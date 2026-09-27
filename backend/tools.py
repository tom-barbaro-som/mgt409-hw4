"""Data access and agent tools.

Three layers in one file:
1. Database: SQLite connections for the API (read/write) and the agent (read-only).
2. Catalogue: product queries shared by the website routes and the agent tools.
3. Agent tools: what the chatbot agent can call. Every tool opens the database read-only.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterator
from contextlib import closing
from dataclasses import dataclass, field
from fastapi import Depends
from pathlib import Path
from pydantic_ai import ModelRetry, RunContext
from typing import Annotated
import json
import os
import re
import sqlite3

from models import (
    LOW_STOCK_THRESHOLD,
    Category,
    CustomerProfile,
    InventoryItem,
    PageView,
    Product,
    ProductCard,
    ProductDescription,
    ProductDetails,
    ProductPrice,
    ProductSummary,
    RepeatContext,
    SearchResults,
    Size,
    SizeStock,
    StockReport,
    StockStatus,
)


# ============================================================================
# 1. Database
# SQLite access shared by the backend modules.
# ============================================================================

BASE_DIR = Path(__file__).resolve().parent.parent
# Local-only data pack (not in git): data/campus_customs.db and data/products/ (see README).
DATA_DIR = Path(os.environ.get("CAMPUS_CUSTOMS_DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "campus_customs.db"


def connect() -> sqlite3.Connection:
    # FastAPI may run a dependency and its endpoint on different worker threads,
    # so the same-thread check is disabled; each connection still serves one request.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """Open one SQLite connection per request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


DbConnection = Annotated[sqlite3.Connection, Depends(get_db)]


def init_db() -> None:
    """Create tables the provided database doesn't include yet."""
    conn = connect()
    try:
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
    finally:
        conn.close()


# ============================================================================
# 2. Catalogue
# Catalogue and inventory queries shared by the product routes and the agent tools.
# ============================================================================

PRODUCT_IMAGE_URL_PREFIX = "/media/products"

# Cleaned, square, white-background copies made by scripts/normalize_product_images.py.
# The originals in data/products/ are never modified; they're served only if the copies are missing.
_CLEAN_IMAGE_DIR = DATA_DIR / "products_web"
_CLEAN_REPORT = _CLEAN_IMAGE_DIR / "_report.json"
PRODUCT_IMAGE_DIR = _CLEAN_IMAGE_DIR if _CLEAN_REPORT.exists() else DATA_DIR / "products"
# Cache-busting version for image URLs: changes whenever the images are rebuilt, so browsers
# don't keep showing an older copy from their cache.
IMAGE_VERSION = str(int(_CLEAN_REPORT.stat().st_mtime)) if _CLEAN_REPORT.exists() else "original"

# Inventory sizes in display order; any unexpected size sorts after these.
SIZE_ORDER = ("XS", "S", "M", "L", "XL", "XXL")
SIZE_RANK = {size: rank for rank, size in enumerate(SIZE_ORDER)}

CATALOGUE_COLUMNS = "product_id, name, garment_type, description, colors, search_tags, image_file_path, price"


def _build_product(row: sqlite3.Row, inventory: list[InventoryItem]) -> Product:
    inventory = sorted(inventory, key=lambda item: SIZE_RANK.get(item.size, len(SIZE_RANK)))
    return Product(
        product_id=row["product_id"],
        name=row["name"],
        garment_type=row["garment_type"],
        category=product_category(row["garment_type"]),
        description=row["description"],
        colors=json.loads(row["colors"]),
        search_tags=json.loads(row["search_tags"]),
        image_file_path=row["image_file_path"],
        image_url=f"{PRODUCT_IMAGE_URL_PREFIX}/{Path(row['image_file_path']).name}?v={IMAGE_VERSION}",
        price=row["price"],
        inventory=inventory,
        total_stock=sum(item.quantity for item in inventory),
    )


def fetch_products(db: sqlite3.Connection) -> list[Product]:
    inventory_by_product: dict[str, list[InventoryItem]] = {}
    for row in db.execute("SELECT product_id, size, quantity FROM inventory"):
        inventory_by_product.setdefault(row["product_id"], []).append(
            InventoryItem(size=row["size"], quantity=row["quantity"])
        )
    rows = db.execute(f"SELECT {CATALOGUE_COLUMNS} FROM catalogue ORDER BY name").fetchall()
    return [_build_product(row, inventory_by_product.get(row["product_id"], [])) for row in rows]


def fetch_product(db: sqlite3.Connection, product_id: str) -> Product | None:
    row = db.execute(f"SELECT {CATALOGUE_COLUMNS} FROM catalogue WHERE product_id = ?", (product_id,)).fetchone()
    if row is None:
        return None
    inventory = [
        InventoryItem(size=item["size"], quantity=item["quantity"])
        for item in db.execute("SELECT size, quantity FROM inventory WHERE product_id = ?", (product_id,))
    ]
    return _build_product(row, inventory)


def product_category(garment_type: str) -> Category:
    """Collapse the catalogue's 22 inconsistent garment_type labels into a few categories."""
    kind = garment_type.lower()
    if "hood" in kind:
        return "hoodie"
    if "quarter-zip" in kind:
        return "quarter-zip"
    if "jacket" in kind:
        return "jacket"
    if "long-sleeve" in kind:
        return "long-sleeve"
    if "t-shirt" in kind:
        return "t-shirt"
    if "crewneck" in kind or "mockneck" in kind or "sweatshirt" in kind:
        return "crewneck"
    return "other"


def sizes_in_stock(product: Product) -> list[str]:
    return [item.size for item in product.inventory if item.quantity > 0]


def sold_out_sizes(product: Product) -> list[str]:
    return [item.size for item in product.inventory if item.quantity <= 0]


def stock_status(quantity: int) -> StockStatus:
    if quantity <= 0:
        return "sold_out"
    return "low_stock" if quantity <= LOW_STOCK_THRESHOLD else "in_stock"


def stock_report(product: Product, requested_size: str | None = None) -> StockReport:
    sizes = [SizeStock(size=i.size, quantity=i.quantity, status=stock_status(i.quantity)) for i in product.inventory]
    requested = None
    if requested_size:
        wanted = requested_size.strip().upper()
        requested = next(
            (s for s in sizes if s.size.upper() == wanted),
            SizeStock(size=wanted, quantity=0, status="not_offered"),
        )
    in_stock = sizes_in_stock(product)
    sold_out = sold_out_sizes(product)
    return StockReport(
        product_id=product.product_id,
        name=product.name,
        sizes=sizes,
        requested_size=requested,
        sizes_in_stock=in_stock,
        low_stock_sizes=[s.size for s in sizes if s.status == "low_stock"],
        sold_out_sizes=sold_out,
        total_stock=product.total_stock,
        fully_sold_out=not in_stock,
        has_sold_out_sizes=bool(sold_out),
    )


def to_description(product: Product) -> ProductDescription:
    return ProductDescription(
        product_id=product.product_id,
        name=product.name,
        category=product_category(product.garment_type),
        garment_type=product.garment_type,
        description=product.description,
        colors=product.colors,
    )


def to_price(product: Product) -> ProductPrice:
    return ProductPrice(product_id=product.product_id, name=product.name, price=product.price)


def to_details(product: Product) -> ProductDetails:
    return ProductDetails(
        product_id=product.product_id,
        name=product.name,
        category=product_category(product.garment_type),
        garment_type=product.garment_type,
        description=product.description,
        colors=product.colors,
        price=product.price,
        stock=stock_report(product),
    )


def main_color(product: Product) -> str | None:
    """The garment's own color. The catalogue lists it first, before trim and graphic colors."""
    return product.colors[0] if product.colors else None


def to_summary(product: Product) -> ProductSummary:
    return ProductSummary(
        product_id=product.product_id,
        name=product.name,
        category=product_category(product.garment_type),
        garment_type=product.garment_type,
        price=product.price,
        main_color=main_color(product),
        colors=product.colors,
        description=product.description,
        sizes_in_stock=sizes_in_stock(product),
        sold_out_sizes=sold_out_sizes(product),
        total_stock=product.total_stock,
    )


def to_card(product: Product) -> ProductCard:
    return ProductCard(
        product_id=product.product_id,
        name=product.name,
        garment_type=product.garment_type,
        description=product.description,
        price=product.price,
        image_url=product.image_url,
        sizes_in_stock=sizes_in_stock(product),
        sold_out_sizes=sold_out_sizes(product),
        total_stock=product.total_stock,
    )


# ============================================================================
# 3. Agent tools
# Tools the Campus Customs agent can call.
#
# Every tool opens the database read-only, so nothing the model does (including a
# prompt-injected request) can change products, inventory, or accounts. Tools
# never touch the users, sessions, or chat_messages tables.
# ============================================================================

@dataclass
class ChatDeps:
    """Per-request context for the agent. Holds only what the agent may know about this shopper.

    customer: the signed-in shopper, from their session cookie (None for guests).
    page: what's on the shopper's screen, with product IDs checked against the database.
    """

    customer: CustomerProfile | None = None
    page: PageView | None = None
    # Set when the shopper repeats an earlier question (see guardrails.find_repeat).
    repeat: RepeatContext | None = None
    # Products and prices the backend already showed the agent (page context, history), which the
    # output validator accepts alongside tool results.
    known_product_ids: set[str] = field(default_factory=set)
    known_prices: set[float] = field(default_factory=set)


def _read_only_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(f"{DB_PATH.as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


STOPWORDS = {
    "a", "an", "and", "any", "are", "do", "does", "for", "have", "i", "in", "is", "it", "looking",
    "me", "my", "need", "of", "on", "or", "show", "some", "something", "that", "the", "to", "want",
    "what", "with", "you", "your", "yale",  # "yale" matches nearly everything, so it doesn't help rank.
}


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower().replace("grey", "gray"))
    # Crude singularization so "hoodies" matches "hoodie".
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words if w not in STOPWORDS]


def _score(product: Product, query_tokens: list[str]) -> int:
    name = product.name.lower()
    labels = " ".join([product.garment_type, product_category(product.garment_type), *product.colors, *product.search_tags]).lower()
    description = product.description.lower()
    score = 0
    for token in query_tokens:
        score += 3 * (token in name) + 2 * (token in labels) + (token in description)
    return score


def search_products(
    ctx: RunContext[ChatDeps],
    query: str = "",
    category: Category | None = None,
    color: str | None = None,
    include_accent_colors: bool = False,
    max_price: float | None = None,
    in_stock_size: Size | None = None,
    limit: int = 8,
) -> SearchResults:
    """Search the Campus Customs catalogue. Use this before recommending or describing any product.

    Args:
        query: Keywords such as a sport, residential college, school, family member, or graphic
            (e.g. "football", "Davenport", "School of Medicine", "mom", "bulldog"). Leave empty to browse.
        category: Limit results to one garment category.
        color: Only products whose main (garment) color matches, e.g. "navy" or "gray". A gray hoodie
            with a navy logo does not match "navy".
        include_accent_colors: Also match trim and graphic colors. Use only when the shopper asks for
            an item "with" a color (e.g. "something with red on it").
        max_price: Only products at or below this price in USD.
        in_stock_size: Only products with at least one unit in stock in this size.
        limit: Maximum number of products to return (1-20).
    """
    with closing(_read_only_connection()) as db:
        products = fetch_products(db)

    if category:
        products = [p for p in products if product_category(p.garment_type) == category]
    if color:
        wanted = color.lower().replace("grey", "gray")

        def matches(p: Product) -> bool:
            candidates = p.colors if include_accent_colors else [main_color(p) or ""]
            return any(wanted in c.lower().replace("grey", "gray") for c in candidates)

        products = [p for p in products if matches(p)]
    if max_price is not None:
        products = [p for p in products if p.price <= max_price]
    if in_stock_size:
        products = [p for p in products if in_stock_size in sizes_in_stock(p)]

    query_tokens = _tokens(query)
    if query_tokens:
        scored = [(p, _score(p, query_tokens)) for p in products]
        products = [p for p, s in sorted(scored, key=lambda pair: pair[1], reverse=True) if s > 0]

    limit = max(1, min(limit, 20))
    return SearchResults(total_matches=len(products), products=[to_summary(p) for p in products[:limit]])


def _load_product(product_id: str) -> Product:
    """Fetch one product live from the database, or ask the model to retry with a real ID."""
    with closing(_read_only_connection()) as db:
        product = fetch_product(db, product_id.strip())
    if product is None:
        raise ModelRetry(f"No product has product_id {product_id!r}. Use search_products to find valid IDs.")
    return product


def get_product_description(ctx: RunContext[ChatDeps], product_id: str) -> ProductDescription:
    """Get what a product is and looks like: garment type, full description, and colors.

    Use for questions like "what does it look like?", "does it have a hood?", or "what colors?".

    Args:
        product_id: A product_id returned by search_products.
    """
    return to_description(_load_product(product_id))


def get_product_price(ctx: RunContext[ChatDeps], product_id: str) -> ProductPrice:
    """Get a product's current price in USD. Use before quoting or comparing any price.

    Args:
        product_id: A product_id returned by search_products.
    """
    return to_price(_load_product(product_id))


def check_stock(ctx: RunContext[ChatDeps], product_id: str, size: Size | None = None) -> StockReport:
    """Check live stock for a product, size by size (XS, S, M, L, XL, XXL).

    Call this before saying an item or size is available. The report lists sold-out
    sizes explicitly; always tell the shopper about sold-out sizes that matter to them.

    Args:
        product_id: A product_id returned by search_products.
        size: The size the shopper asked about, if any. Its status appears in requested_size.
    """
    return stock_report(_load_product(product_id), size)


def get_product_details(ctx: RunContext[ChatDeps], product_id: str) -> ProductDetails:
    """Get everything about one product in one call: description, colors, price, and per-size stock.

    Use when the shopper wants a full rundown of an item, or asks about several of these at once.

    Args:
        product_id: A product_id returned by search_products.
    """
    return to_details(_load_product(product_id))


def list_categories(ctx: RunContext[ChatDeps]) -> dict[str, object]:
    """Overview of the catalogue: product counts per category, the price range, and available sizes."""
    with closing(_read_only_connection()) as db:
        products = fetch_products(db)
    counts = Counter(product_category(p.garment_type) for p in products)
    prices = [p.price for p in products]
    return {
        "total_products": len(products),
        "products_per_category": dict(counts.most_common()),
        "price_range_usd": {"min": min(prices), "max": max(prices)} if prices else None,
        "sizes": ["XS", "S", "M", "L", "XL", "XXL"],
    }


def get_customer_profile(ctx: RunContext[ChatDeps]) -> CustomerProfile | str:
    """Get the signed-in shopper's account details: name, email, member-since date, and saved message count.

    Use when the shopper asks about their own account ("what's my email?", "how long have I been a member?").
    Only this shopper's own details are available; never other customers'.
    """
    if ctx.deps.customer is None:
        return "The shopper is browsing as a guest (not signed in). No account details are available."
    return ctx.deps.customer


def get_current_page(ctx: RunContext[ChatDeps]) -> PageView | str:
    """Get what the shopper is looking at right now: the page type, the product whose page is open
    (with price, colors, and stock), and any assistant matches shown on the Products page.

    Call this when the shopper says "this item", "this one", "it", or "the second one on the page"
    and you aren't sure what they mean.
    """
    if ctx.deps.page is None:
        return "No page information was sent with this message."
    return ctx.deps.page


TOOLS = [
    get_customer_profile,
    get_current_page,
    search_products,
    get_product_description,
    get_product_price,
    check_stock,
    get_product_details,
    list_categories,
]
