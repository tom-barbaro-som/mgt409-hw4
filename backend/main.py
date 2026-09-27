"""Campus Customs backend API (the FastAPI app uvicorn runs).

Run from this backend/ folder, with the hw4 virtual environment active:
    uvicorn main:app --reload --port 8000

1. Accounts: create account, login, logout, and cookie sessions.
2. Chat history: saved chats for signed-in shoppers (chat_messages table).
3. App and routes: products, images, chat, and chat history.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, closing
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic_ai.exceptions import (
    AgentRunError,
    ContentFilterError,
    ModelAPIError,
    ModelHTTPError,
    UsageLimitExceeded,
)

from models import (
    MAX_CHAT_CARDS,
    MAX_PRODUCT_MATCHES,
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ChatTurn,
    CustomerProfile,
    LoginRequest,
    PageContext,
    PageResults,
    PageView,
    Product,
    ProductCard,
    RegisterRequest,
    SessionResponse,
    StoredChatMessage,
    User,
)
from tools import (
    PRODUCT_IMAGE_DIR,
    PRODUCT_IMAGE_URL_PREFIX,
    ChatDeps,
    connect,
    DbConnection,
    fetch_product,
    fetch_products,
    init_db,
    to_card,
    to_summary,
)
from agent import (
    CRISIS_REPLY,
    AgentNotConfiguredError,
    append_audit_entry,
    find_repeat,
    is_content_filtered,
    new_audit_entry,
    run_chat,
    screen_crisis,
    screen_sensitive,
)


# ============================================================================
# 1. Accounts
# Account creation, login, and cookie-based sessions.
#
# Passwords are never stored: each is salted and run through PBKDF2-HMAC-SHA256,
# and only the salt and derived key are saved in users.password_hash. Logins issue
# a random session token in an HttpOnly cookie; the database keeps only the
# token's SHA-256 hash, so a leaked database can't be used to hijack sessions.
# ============================================================================

router = APIRouter(prefix="/api/auth", tags=["auth"])

# --- Password hashing -------------------------------------------------------

HASH_ALGORITHM = "pbkdf2_sha256"
# OWASP's current recommendation for PBKDF2-HMAC-SHA256.
PBKDF2_ITERATIONS = 600_000
# Accounts in the provided database use "pbkdf2_sha256$<salt>$<hex>" at 120,000
# iterations. They are verified with that count and upgraded after a successful login.
LEGACY_PBKDF2_ITERATIONS = 120_000


def _derive(password: str, salt: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()


def hash_password(password: str) -> str:
    """Return "pbkdf2_sha256$<iterations>$<salt>$<hex digest>" with a fresh random salt."""
    salt = secrets.token_hex(16)
    return f"{HASH_ALGORITHM}${PBKDF2_ITERATIONS}${salt}${_derive(password, salt, PBKDF2_ITERATIONS)}"


def _parse_hash(stored: str) -> tuple[int, str, str] | None:
    parts = stored.split("$")
    if len(parts) == 4 and parts[0] == HASH_ALGORITHM and parts[1].isdigit():
        return int(parts[1]), parts[2], parts[3]
    if len(parts) == 3 and parts[0] == HASH_ALGORITHM:
        return LEGACY_PBKDF2_ITERATIONS, parts[1], parts[2]
    return None


def verify_password(password: str, stored: str) -> bool:
    parsed = _parse_hash(stored)
    if parsed is None:
        return False
    iterations, salt, expected = parsed
    return hmac.compare_digest(_derive(password, salt, iterations), expected)


def needs_rehash(stored: str) -> bool:
    parsed = _parse_hash(stored)
    return parsed is None or parsed[0] < PBKDF2_ITERATIONS


# Checked when an email isn't registered, so unknown and known emails take the
# same time to reject and response timing doesn't reveal which accounts exist.
_DUMMY_HASH = hash_password(secrets.token_hex(16))

# --- Sessions ---------------------------------------------------------------

SESSION_COOKIE = "cc_session"
SESSION_LIFETIME = timedelta(days=7)
# Keep False for http://localhost; set SESSION_COOKIE_SECURE=true when served over HTTPS.
SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _utc_timestamp(moment: datetime) -> str:
    # Same format as SQLite's datetime('now') so the two compare correctly.
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def start_session(db: sqlite3.Connection, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_LIFETIME
    with db:
        db.execute("DELETE FROM sessions WHERE expires_at <= datetime('now')")
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (_hash_token(token), user_id, _utc_timestamp(expires_at)),
        )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,  # Not readable from JavaScript, so XSS can't steal it.
        samesite="lax",  # Not sent on cross-site POSTs, which blocks CSRF.
        secure=SESSION_COOKIE_SECURE,
        path="/",
    )


# --- Login throttling -------------------------------------------------------

FAILED_LOGIN_WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_CLIENT = 20

_failed_logins: dict[str, list[float]] = {}
_failed_logins_lock = threading.Lock()


def _recent_failures(key: str, now: float) -> list[float]:
    recent = [t for t in _failed_logins.get(key, []) if now - t < FAILED_LOGIN_WINDOW_SECONDS]
    _failed_logins[key] = recent
    return recent


def _throttle_keys(email: str, request: Request) -> list[tuple[str, int]]:
    client = request.client.host if request.client else "unknown"
    return [(f"email:{email}", MAX_FAILURES_PER_EMAIL), (f"client:{client}", MAX_FAILURES_PER_CLIENT)]


def _check_throttle(email: str, request: Request) -> None:
    now = time.monotonic()
    with _failed_logins_lock:
        if any(len(_recent_failures(key, now)) >= limit for key, limit in _throttle_keys(email, request)):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please wait a few minutes and try again.",
            )


def _record_failure(email: str, request: Request) -> None:
    now = time.monotonic()
    with _failed_logins_lock:
        for key, _ in _throttle_keys(email, request):
            _recent_failures(key, now).append(now)


def _clear_failures(email: str) -> None:
    with _failed_logins_lock:
        _failed_logins.pop(f"email:{email}", None)




def _to_user(row: sqlite3.Row) -> User:
    # Older rows may only have the combined `name` column filled in.
    first, _, last = (row["name"] or "").partition(" ")
    return User(
        id=row["id"],
        first_name=row["first_name"] or first,
        last_name=row["last_name"] or last,
        email=row["email"],
    )


USER_COLUMNS = "id, name, first_name, last_name, email, password_hash"


def get_current_user(request: Request, db: DbConnection) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    row = db.execute(
        """
        SELECT u.id, u.name, u.first_name, u.last_name, u.email
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')
        """,
        (_hash_token(token),),
    ).fetchone()
    return _to_user(row) if row else None


CurrentUser = Annotated[User | None, Depends(get_current_user)]


# --- Routes -----------------------------------------------------------------


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, response: Response, db: DbConnection) -> SessionResponse:
    if db.execute("SELECT 1 FROM users WHERE lower(email) = ?", (body.email,)).fetchone():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    try:
        with db:
            cursor = db.execute(
                "INSERT INTO users (name, first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?, ?)",
                (
                    f"{body.first_name} {body.last_name}",
                    body.first_name,
                    body.last_name,
                    body.email,
                    hash_password(body.password),
                ),
            )
    except sqlite3.IntegrityError:  # Lost a race with a simultaneous sign-up.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists."
        ) from None

    user_id = cursor.lastrowid
    assert user_id is not None
    start_session(db, response, user_id)
    row = db.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (user_id,)).fetchone()
    return SessionResponse(user=_to_user(row))


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: DbConnection) -> SessionResponse:
    _check_throttle(body.email, request)

    row = db.execute(f"SELECT {USER_COLUMNS} FROM users WHERE lower(email) = ?", (body.email,)).fetchone()
    # Always run a hash check so response time is the same whether or not the email exists.
    valid = verify_password(body.password, row["password_hash"] if row else _DUMMY_HASH)
    if row is None or not valid:
        _record_failure(body.email, request)
        # One generic message, so the response doesn't reveal which accounts exist.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")

    _clear_failures(body.email)
    if needs_rehash(row["password_hash"]):
        with db:
            db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(body.password), row["id"]))
    start_session(db, response, row["id"])
    return SessionResponse(user=_to_user(row))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DbConnection) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=SESSION_COOKIE_SECURE)


@router.get("/session")
def session(user: CurrentUser) -> SessionResponse:
    """The signed-in user, or null. Returns 200 either way so logged-out visitors don't see errors."""
    return SessionResponse(user=user)


# ============================================================================
# 2. Chat history
# Saved chat history for signed-in shoppers (the chat_messages table).
#
# Guests' chats are never written here; their history lives only in the browser tab.
# ============================================================================

# How many saved messages the chat window shows, and how many the agent reads as context.
DISPLAY_LIMIT = 100
AGENT_CONTEXT_LIMIT = 40


def _plain_text(content: str) -> str:
    # Older saved replies used Markdown (**bold**, # headings); the chat window shows plain text.
    return re.sub(r"^#+\s*", "", content.replace("**", ""), flags=re.MULTILINE)


def _product_ids(products_json: str | None) -> list[str]:
    """Product IDs from a saved message.

    Accepts both shapes in the table: older full product snapshots and newer ProductCards.
    Both have a product_id field.
    """
    if not products_json:
        return []
    try:
        items = json.loads(products_json)
    except json.JSONDecodeError:
        return []
    return [item["product_id"] for item in items if isinstance(item, dict) and isinstance(item.get("product_id"), str)]


def _recent_rows(db: sqlite3.Connection, user_id: int, limit: int) -> list[sqlite3.Row]:
    rows = db.execute(
        """
        SELECT id, role, content, products_json, created_at FROM chat_messages
        WHERE user_id = ? AND role IN ('user', 'assistant')
        ORDER BY id DESC LIMIT ?
        """,
        (user_id, limit),
    ).fetchall()
    return list(reversed(rows))


def load_history(db: sqlite3.Connection, user_id: int, limit: int = DISPLAY_LIMIT) -> list[StoredChatMessage]:
    """The shopper's most recent saved messages, oldest first.

    Product cards are rebuilt from the live catalogue, so prices and stock are current.
    Products that no longer exist are dropped.
    """
    cards: dict[str, ProductCard | None] = {}

    def card_for(product_id: str) -> ProductCard | None:
        if product_id not in cards:
            product = fetch_product(db, product_id)
            cards[product_id] = to_card(product) if product else None
        return cards[product_id]

    messages = []
    for row in _recent_rows(db, user_id, limit):
        # Matches the live chat panel: up to MAX_CHAT_CARDS cards per reply.
        products = [card for pid in _product_ids(row["products_json"]) if (card := card_for(pid))][:MAX_CHAT_CARDS]
        messages.append(
            StoredChatMessage(
                id=row["id"],
                role=row["role"],
                content=_plain_text(row["content"]),
                products=products,
                created_at=row["created_at"],
            )
        )
    return messages


def agent_history(db: sqlite3.Connection, user_id: int, limit: int = AGENT_CONTEXT_LIMIT) -> list[ChatTurn]:
    """Recent saved messages in the shape the agent's message history uses."""
    return [
        ChatTurn(role=row["role"], content=_plain_text(row["content"])[:4000], product_ids=_product_ids(row["products_json"])[:12])
        for row in _recent_rows(db, user_id, limit)
    ]


def save_exchange(
    db: sqlite3.Connection, user_id: int, user_message: str, reply: str, cards: list[ProductCard]
) -> None:
    """Save one shopper message and the assistant's reply in a single transaction."""
    products_json = json.dumps([card.model_dump() for card in cards]) if cards else None
    with db:
        db.execute(
            "INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'user', ?)",
            (user_id, user_message),
        )
        db.execute(
            "INSERT INTO chat_messages (user_id, role, content, products_json) VALUES (?, 'assistant', ?, ?)",
            (user_id, reply, products_json),
        )


def clear_history(db: sqlite3.Connection, user_id: int) -> int:
    with db:
        return db.execute("DELETE FROM chat_messages WHERE user_id = ?", (user_id,)).rowcount


def customer_profile(db: sqlite3.Connection, user_id: int) -> CustomerProfile | None:
    row = db.execute(
        """
        SELECT u.id, u.name, u.first_name, u.last_name, u.email, u.created_at,
               (SELECT COUNT(*) FROM chat_messages m WHERE m.user_id = u.id) AS saved
        FROM users u WHERE u.id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    first, _, last = (row["name"] or "").partition(" ")
    return CustomerProfile(
        user_id=row["id"],
        first_name=row["first_name"] or first,
        last_name=row["last_name"] or last,
        email=row["email"],
        member_since=(row["created_at"] or "")[:10],
        saved_message_count=row["saved"],
    )


# ============================================================================
# 3. App and routes
# ============================================================================

logger = logging.getLogger("campus_customs")



@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="Campus Customs API", version="0.3.0", lifespan=lifespan)
app.include_router(router)
app.mount(PRODUCT_IMAGE_URL_PREFIX, StaticFiles(directory=PRODUCT_IMAGE_DIR), name="product-images")


# --- Validation errors --------------------------------------------------------

FIELD_LABELS = {
    "first_name": "First name",
    "last_name": "Last name",
    "email": "Email",
    "password": "Password",
    "confirm_password": "Confirm password",
    "message": "Message",
}


def describe_validation_error(error: dict) -> str:
    field = str(error["loc"][-1]) if error.get("loc") else ""
    label = FIELD_LABELS.get(field, field.replace("_", " ").capitalize())
    kind = error.get("type", "")
    if field == "email" and kind == "string_pattern_mismatch":
        return "Please enter a valid email address."
    if kind == "string_too_short":
        min_length = error.get("ctx", {}).get("min_length", 1)
        return f"{label} is required." if min_length == 1 else f"{label} must be at least {min_length} characters."
    if kind in ("string_too_long", "too_long"):
        return f"{label} is too long (maximum {error.get('ctx', {}).get('max_length')})."
    if kind == "missing":
        return f"{label} is required."
    message = str(error.get("msg", "Invalid value")).removeprefix("Value error, ")
    return message if field in ("", "body") else f"{label}: {message}"


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default 422 body echoes the submitted input, which would include
    # passwords. Return readable messages only.
    messages = list(dict.fromkeys(describe_validation_error(error) for error in exc.errors()))
    return JSONResponse(status_code=422, content={"detail": " ".join(messages)})


# --- Products ---------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products")
def list_products(db: DbConnection) -> list[Product]:
    return fetch_products(db)


@app.get("/api/products/{product_id}")
def get_product(product_id: str, db: DbConnection) -> Product:
    product = fetch_product(db, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# --- Chat -------------------------------------------------------------------

# Every message costs a model call, so each client gets a modest budget.
CHAT_REQUESTS_PER_MINUTE = 15
_chat_requests: dict[str, list[float]] = {}
_chat_requests_lock = threading.Lock()


def _check_chat_rate_limit(request: Request) -> None:
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _chat_requests_lock:
        recent = [t for t in _chat_requests.get(client, []) if now - t < 60]
        if len(recent) >= CHAT_REQUESTS_PER_MINUTE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You're sending messages quickly. Please wait a moment and try again.",
            )
        recent.append(now)
        _chat_requests[client] = recent


CONTENT_FILTERED_REPLY = (
    "Sorry, I can't help with that one. I'm here for Campus Customs gear, like hoodies, crewnecks, "
    "tees, sizes, and stock. What can I help you find?"
)


def resolve_page(db: sqlite3.Connection, page: PageContext | None) -> PageView | None:
    """Turn the browser's page context into database-checked facts. Unknown IDs are dropped."""
    if page is None:
        return None
    viewing = None
    if page.page_type == "product" and page.product_id:
        product = fetch_product(db, page.product_id)
        viewing = to_summary(product) if product else None
    visible = [to_summary(p) for pid in dict.fromkeys(page.visible_product_ids) if (p := fetch_product(db, pid))]
    return PageView(page_type=page.page_type, path=page.path, viewing_product=viewing, visible_products=visible)


@app.get("/api/chat/history")
def get_chat_history(user: CurrentUser, db: DbConnection) -> ChatHistoryResponse:
    """The signed-in shopper's saved chat, oldest first. Guests get an empty list (nothing is saved)."""
    if user is None:
        return ChatHistoryResponse(signed_in=False, messages=[])
    return ChatHistoryResponse(signed_in=True, messages=load_history(db, user.id))


@app.delete("/api/chat/history", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_history(user: CurrentUser, db: DbConnection) -> None:
    """Delete the signed-in shopper's saved chat."""
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Log in to manage your saved chat.")
    clear_history(db, user.id)


def _audit_blocked(user: User | None, stop_reason: str, message: str, details: dict | None = None) -> None:
    """Record a chat request that never reached the agent (the agent loop logs its own runs)."""
    entry = new_audit_entry("guardrail_block")
    entry.update(
        {
            "stop_reason": stop_reason,
            "shopper": {"signed_in": user is not None, "user_id": user.id if user else None},
            "message": message,
            "runtime_ms": 0,
            "tools_used": [],
            **(details or {}),
        }
    )
    try:
        append_audit_entry(entry)
    except OSError:
        logger.exception("Could not write the audit trail entry.")


@app.post("/api/chat")
async def chat(body: ChatRequest, request: Request, user: CurrentUser) -> ChatResponse:
    """Send the shopper's message to the agent and return its reply.

    Signed-in shoppers: the agent reads their saved history from the database, and the
    new exchange is saved. Guests: the browser's in-tab history is used and nothing is saved.
    """
    try:
        _check_chat_rate_limit(request)
    except HTTPException:
        # Only a length, not the text: a flood of messages shouldn't also flood the audit file.
        _audit_blocked(user, "rate_limited", f"[{len(body.message)} characters, not recorded]")
        raise

    # Guardrail: card numbers, SSNs, and passwords never reach the model or the database.
    sensitive = screen_sensitive(body.message)
    if sensitive:
        logger.info("Chat message blocked by the sensitive-data guardrail (%s).", ", ".join(sensitive.kinds))
        _audit_blocked(user, "blocked_sensitive_data", sensitive.redacted_message, {"detected": sensitive.kinds})
        response = ChatResponse(
            reply=sensitive.reply,
            products=[],
            notice="sensitive_data_removed",
            redacted_message=sensitive.redacted_message,
        )
        _save_if_signed_in(user, sensitive.redacted_message, response)
        return response

    # Safety guardrail: crisis messages get support resources right away, not a shopping reply.
    if screen_crisis(body.message):
        response = ChatResponse(reply=CRISIS_REPLY, products=[], notice="crisis_support")
        _audit_blocked(user, "crisis_support", body.message)
        _save_if_signed_in(user, body.message, response)
        return response

    with closing(connect()) as db:
        customer = customer_profile(db, user.id) if user else None
        history = agent_history(db, user.id) if user else body.history
        page = resolve_page(db, body.page)

    # Products the agent was already shown via page context; the output validator accepts these.
    known_products = []
    if page:
        known_products = ([page.viewing_product] if page.viewing_product else []) + page.visible_products
    deps = ChatDeps(
        customer=customer,
        page=page,
        repeat=find_repeat(body.message, history),
        known_product_ids={p.product_id for p in known_products} | {pid for t in history for pid in t.product_ids},
        known_prices={round(p.price, 2) for p in known_products},
    )

    try:
        reply = await run_chat(body.message, history, deps)
    except (ContentFilterError, ModelHTTPError) as exc:
        if not is_content_filtered(exc):
            logger.error("Chat agent failed: %s (status %s)", type(exc).__name__, getattr(exc, "status_code", "n/a"))
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "The assistant is having trouble right now. Please try again."
            ) from None
        logger.info("Chat message blocked by the provider's content filter.")
        response = ChatResponse(reply=CONTENT_FILTERED_REPLY, products=[])
        _save_if_signed_in(user, body.message, response)
        return response
    except AgentNotConfiguredError:
        logger.error("Chat is unavailable: PORTKEY_API_KEY is not configured.")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The assistant isn't available right now.") from None
    except UsageLimitExceeded:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Sorry, I got stuck on that one. Could you rephrase your question?"
        ) from None
    except (ModelAPIError, AgentRunError) as exc:
        # Log only the error type and status; provider error bodies aren't needed here.
        logger.error("Chat agent failed: %s (status %s)", type(exc).__name__, getattr(exc, "status_code", "n/a"))
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The assistant is having trouble right now. Please try again."
        ) from None

    # Cards come from the database, so a mistyped or invented ID is simply dropped.
    cards = []
    with closing(connect()) as db:
        for product_id in dict.fromkeys(reply.product_ids):
            product = fetch_product(db, product_id)
            if product:
                cards.append(to_card(product))
            if len(cards) == MAX_PRODUCT_MATCHES:
                break

    page_results = None
    if reply.update_page and cards:
        page_results = PageResults(
            heading=(reply.results_heading or "Picked for You").strip(),
            query=body.message,
            products=cards,
        )
    response = ChatResponse(
        reply=reply.message,
        products=cards[:MAX_CHAT_CARDS],
        page_results=page_results,
        notice="repeat_answer" if deps.repeat else None,
    )
    # Save the full ranked list so "the fifth one" still resolves on a later visit.
    _save_if_signed_in(user, body.message, response, saved_cards=cards)
    return response


def _save_if_signed_in(
    user: User | None, message: str, response: ChatResponse, saved_cards: list | None = None
) -> None:
    if user is None:
        return  # Guests' chats are not stored.
    with closing(connect()) as db:
        save_exchange(db, user.id, message, response.reply, saved_cards if saved_cards is not None else response.products)
