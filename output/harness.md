# Campus Customs Harness

Reference for people and AI agents working on the Campus Customs website and chatbot: how the whole site works, end to end. Security expectations are in `../AGENTS.md`; setup commands are in `../README.md` and summarized under [Agent specs](#agent-specs).

**Contents:**
- [Database](#database-overview)
- [Authentication](#authentication)
- [Frontend ↔ FastAPI](#how-the-frontend-talks-to-fastapi)
- [Agent loading](#how-the-agent-is-loaded)
- [Agent tools and abilities](#agent-tools-product-info-and-stock)
- [Search results on the page](#how-search-results-reach-the-page)
- [Customer memory and page context](#customer-memory-and-page-context)
- [models.py reference](#modelspy-reference)
- [Safety rules](#safety-rules)
- [Audit trail](#audit-trail)
- [Agent specs](#agent-specs)

## Database overview

Source: `data/campus_customs.db` (SQLite, part of the local-only data pack; see [Agent specs](#agent-specs)). The provided file had four application tables. The backend adds a fifth, `sessions`, at startup (see [Authentication](#authentication)). There's also SQLite's internal `sqlite_sequence` table, which tracks AUTOINCREMENT counters and should not be edited.

| Table | Rows (as provided) | Purpose |
|---|---|---|
| `catalogue` | 102 | One row per product: what it is, what it looks like, and what it costs |
| `inventory` | 612 | Stock count for each product in each size (102 products × 6 sizes) |
| `users` | 3 | Customer accounts for website login; new sign-ups are appended here |
| `chat_messages` | 22 | Saved chatbot conversation history for each user |
| `sessions` | (new) | Active login sessions; stores only a hash of each session token |

Relationships:

```text
tools.product_id  1 ──< inventory.product_id      (one product, many sizes)
users.id              1 ──< chat_messages.user_id     (one user, many messages)
users.id              1 ──< sessions.user_id          (one user, many logged-in devices)
chat_messages.products_json  → embeds snapshots of catalogue + inventory rows
```

## `catalogue`

The store's product master list. The chatbot uses it to answer "what do you have?" questions, and the website uses it to render product pages.

| Field | Type | Why it matters |
|---|---|---|
| `product_id` | TEXT, primary key | Stable, URL-friendly slug (e.g. `baseball-left-chest-crewneck`) that uniquely identifies a product. It joins to `inventory`, and it matches the image filename in `data/products/`. |
| `name` | TEXT, required | Customer-facing product title for listings, search results, and chatbot replies. |
| `garment_type` | TEXT, required | Product category (hoodie, crewneck, T-shirt, quarter-zip, etc.) used to filter and browse. **Note:** values aren't standardized. There are 22 distinct strings for about 8 real categories (e.g. `short-sleeve T-shirt`, `short-sleeve t-shirt`, `t-shirt`; `pullover hoodie`, `hoodie`, `hooded sweatshirt`). Normalize or match loosely when filtering. |
| `description` | TEXT, required | Visual description of the item (color, graphic, placement, construction). Lets the chatbot answer detailed questions like "does it have a hood?" or "where is the logo?" without seeing the image. |
| `colors` | TEXT (JSON array) | Every color on the garment, including graphic colors (e.g. `["navy", "white"]`). Supports color questions such as "do you have this in pink?". Parse it as JSON; don't treat it as plain text. |
| `search_tags` | TEXT (JSON array) | Keywords (sport, event, style, audience) that widen search recall beyond the name and description, e.g. "The Game", "college rivalry". Parse as JSON. |
| `image_file_path` | TEXT, required | Relative path to the product photo (`products/<product_id>.jpg`). The website needs it to show the item. All 102 paths point to existing files. |
| `price` | REAL, required | Retail price in USD, ranging from $32 to $98 (mean about $58). Needed for display, price filters ("under $50"), and checkout. |

## `inventory`

Stock levels by size. The store uses it to avoid recommending or selling items that are out of stock.

| Field | Type | Why it matters |
|---|---|---|
| `id` | INTEGER, primary key (autoincrement) | Internal row identifier. |
| `product_id` | TEXT, foreign key → `tools.product_id` | Links a stock row to its product. Every catalogue product has inventory rows. |
| `size` | TEXT, required | One of `XS`, `S`, `M`, `L`, `XL`, `XXL`. Every product comes in all six sizes. Customers pick a size, so availability has to be checked per size, not only per product. |
| `quantity` | INTEGER, required | Units on hand (0–25). 145 of the 612 size rows are at **0**, so the chatbot should check stock before saying an item is available, and low counts can trigger "only a few left" messages. |

Constraint: `UNIQUE (product_id, size)` allows only one stock row per product-size pair. Update that row in place; don't insert duplicates.

## `users`

Customer accounts. They support login, personalization, and saved chat history.

| Field | Type | Why it matters |
|---|---|---|
| `id` | INTEGER, primary key (autoincrement) | Internal user identifier, referenced by `chat_messages.user_id`. |
| `name` | TEXT, required | Full display name (e.g. "Ada Lovelace"). This is the legacy field, and it overlaps with `first_name`/`last_name`. |
| `email` | TEXT, required, UNIQUE | Login identifier and contact address. The uniqueness constraint stops duplicate accounts. |
| `password_hash` | TEXT, required | Salted PBKDF2-SHA256 hash, never a plaintext password. Used to verify logins securely (format described under [Authentication](#authentication)). **Never display, log, or send this to the chatbot/LLM.** |
| `created_at` | TEXT, defaults to `datetime('now')` | Account creation timestamp (UTC) for auditing and customer analytics. |
| `first_name` | TEXT, nullable | Added after the table was created (via `ALTER TABLE`). Used for friendly greetings ("Hi Ada!"). It's filled in for all current users, but new code should handle null values. |
| `last_name` | TEXT, nullable | Added alongside `first_name`. Used for formal addressing and order records. |

## `chat_messages`

Chatbot conversation history, saved so a returning user can see earlier chats and the bot keeps context.

| Field | Type | Why it matters |
|---|---|---|
| `id` | INTEGER, primary key (autoincrement) | Message identifier. It also gives the order of messages within a conversation. |
| `user_id` | INTEGER, foreign key → `users.id` | Ties each message to one customer so histories stay private and separate. |
| `role` | TEXT, required | `user` or `assistant`. Needed to rebuild the conversation in the right format for the LLM. |
| `content` | TEXT, required | The message text. Assistant replies use Markdown (bold, bullet lists), so the frontend should render Markdown. |
| `products_json` | TEXT (JSON array), nullable | Only on assistant messages. It stores snapshots of the products the bot recommended so the UI can show product cards. Each object has the catalogue fields plus `image_url`, `inventory` (per-size stock), and `total_stock`. These are snapshots taken at reply time, so price or stock can differ from the live tables. |
| `created_at` | TEXT, defaults to `datetime('now')` | Message timestamp (UTC) for ordering and displaying history. |

## Notes for agents

- JSON-array columns (`colors`, `search_tags`, `products_json`) are stored as TEXT. Use `json.loads` or SQLite `json_each()` to read them.
- Join `catalogue` and `inventory` on `product_id` to answer "is X available in size Y?".
- Treat `password_hash` and user emails as sensitive. Keep them out of LLM prompts and logs.

## Authentication

Code: `backend/main.py` (API routes, hashing, sessions) and `backend/tools.py` (connections and the `sessions` table). The frontend side is `frontend/src/api/auth.ts` and `frontend/src/auth/AuthProvider.tsx`.

### Flow

1. **Create account** (`/create-account`): the form collects first name, last name, email, password, and confirm password, then sends `POST /api/auth/register`. The backend validates the input, checks that the email isn't taken, hashes the password, and appends a row to `users`:
   - `name` = "First Last"
   - `first_name`, `last_name`
   - `email`, lowercased
   - `password_hash`
   - `created_at` (automatic)

   The new user is logged in right away.
2. **Log in** (`/login`): the form sends email and password to `POST /api/auth/login`. The backend looks up the email (case-insensitive) and checks the password against the stored hash. On success it starts a session.
3. **Session:** the browser receives a `cc_session` cookie. On every page load, the site calls `GET /api/auth/session`, which returns `{"user": {...}}` or `{"user": null}`. The nav bar shows "Hi, First" and a **Log out** button when signed in.
4. **Log out:** `POST /api/auth/logout` deletes the session row and clears the cookie.

| Endpoint | Body | Success | Errors |
|---|---|---|---|
| `POST /api/auth/register` | `first_name`, `last_name`, `email`, `password`, `confirm_password` | 201 + user, sets cookie | 422 invalid input, 409 email already registered |
| `POST /api/auth/login` | `email`, `password` | 200 + user, sets cookie | 401 wrong email or password, 429 too many failures |
| `POST /api/auth/logout` | — | 204, clears cookie | — |
| `GET /api/auth/session` | — | 200 + `{"user": User \| null}` | — |

The `User` object returned to the browser contains only `id`, `first_name`, `last_name`, and `email`. It never includes `password_hash`.

Validation rules, enforced by the backend and mirrored in the forms:
- names: 1–50 characters
- email: must look like `name@domain.tld`
- password: 8–128 characters
- confirm password: must match the password

### How passwords are protected

- **Never stored or logged in plaintext.** Each password is run through **PBKDF2-HMAC-SHA256** with a random 16-byte salt unique to that user and **600,000 iterations** (OWASP's current recommendation). Only the result is stored: `pbkdf2_sha256$600000$<salt hex>$<derived key hex>`.
- **Why this resists human and AI attackers:** a hash can't be reversed. Someone who steals the database has to guess each password and pay 600,000 SHA-256 rounds for every guess. The per-user salt means identical passwords produce different hashes, so precomputed rainbow tables don't work and each account must be attacked separately. No password recovery is possible, even for the store.
- **Older accounts:** the three accounts in the provided database use an older format, `pbkdf2_sha256$<salt>$<hex>`, at 120,000 iterations. They still verify. After a user's next successful login, their hash is rewritten in the 600,000-iteration format (this has already happened for the test user).
- **Constant-time checks:** hashes are compared with `hmac.compare_digest`. Unknown emails are checked against a dummy hash, so a missing account takes as long to reject as a wrong password.
- **No account enumeration at login:** wrong email and wrong password both return the same message, "Incorrect email or password."
- **Brute-force throttling:** more than 5 failed logins for one email, or 20 from one client, within 15 minutes returns HTTP 429 until the window passes. The counters are in memory and reset when the backend restarts.
- **Passwords are never echoed:** FastAPI's default validation errors include the submitted input. The backend replaces them with plain messages (e.g. "Password must be at least 8 characters.") so passwords don't show up in responses or logs.

### How sessions are protected

- The session token is 32 random bytes from `secrets.token_urlsafe`. The `sessions` table stores only its **SHA-256 hash** (`token_hash`), plus `user_id`, `created_at`, and `expires_at`. Someone who reads the database can't reuse a session.
- The cookie is `HttpOnly`, so page JavaScript and XSS can't read it. It's also `SameSite=Lax`, so it isn't sent on cross-site POSTs, which blocks CSRF. It expires after 7 days. Set `SESSION_COOKIE_SECURE=true` to add the `Secure` flag when the site is served over HTTPS; leave it off for `http://localhost`.
- Expired sessions are ignored on lookup and cleaned up whenever a new session starts.

### Rules for agents

- Never read, print, or send `password_hash`, session tokens, or `sessions.token_hash` to the chatbot/LLM or to logs.
- To find the current user in a new endpoint, add a `user: CurrentUser` parameter (from `backend/main.py`). It's `None` when the visitor is logged out.
- Create accounts only through `hash_password()` or the register endpoint. Never write a password into `users` directly.
- Test account: `test@campuscustoms.yale.edu` / `password`.

## How the frontend talks to FastAPI

```text
Browser (React + Vite, http://localhost:5173)
   │  fetch('/api/...')  and  <img src="/media/products/...">   (same origin, cookies included)
   ▼
Vite dev server proxy  (frontend/vite.config.ts: /api and /media → http://127.0.0.1:8000)
   ▼
FastAPI app  (backend/main.py, run from backend/:  uvicorn main:app --reload --port 8000)
   ├── /api/products, /api/products/{id}  → tools.py → campus_customs.db (catalogue + inventory)
   ├── /media/products/*?v=…              → cleaned square photos in data/products_web/ (originals in products/)
   ├── /api/auth/*                        → main.py → users + sessions tables
   ├── /api/chat/history                  → main.py → chat_messages (signed-in shoppers)
   └── /api/chat                          → agent.py → agent.py (PydanticAI) → tools.py (read-only DB)
                                            → Portkey → gpt-5.6-luna; every run logged by agent.py
```

- Because the proxy makes every call same-origin, the HttpOnly `cc_session` cookie is sent automatically, and no CORS configuration is needed.
- Frontend API helpers live in `frontend/src/api/`:
  - `client.ts`: `fetchJson` and `postJson`. Errors become `ApiError`, which carries the backend's `detail` message.
  - `products.ts`: the product endpoints.
  - `auth.ts`: the account endpoints.
  - `chat.ts`: `sendChatMessage()`.
- Backend modules:

| File | Role |
|---|---|
| `backend/main.py` | The FastAPI app (the file uvicorn runs), in three sections. **1. Accounts:** register, login, logout, session lookup, password hashing, login throttling. **2. Chat history:** saving and loading signed-in shoppers' chats, and building `CustomerProfile`. **3. App and routes:** products, images, chat, the validation-error handler, the chat rate limit, and guardrail-block auditing. |
| `backend/agent.py` | The agent, in three sections. **1. Guardrails:** sensitive-data screen, crisis screen, reply fact check (output validator), repeat detection, content-filter check. **2. Audit trail:** append-only log of every run (`output/audit_trail.json`). **3. Agent:** model, Portkey client, system prompt, instructions, `run_chat()`. |
| `backend/tools.py` | Data access and agent tools, in three sections. **1. Database:** SQLite connections; the data pack location (`data/`, override with `CAMPUS_CUSTOMS_DATA_DIR`); the `sessions` table. **2. Catalogue:** product queries and category normalization shared by the routes and the tools. **3. Agent tools:** the eight tools and `ChatDeps`. |
| `backend/models.py` | All Pydantic types; see [models.py reference](#modelspy-reference) |
| `backend/prompts/prompt.md` | The agent's system prompt (voice, answering rules, safety rules) |
| `scripts/normalize_product_images.py` | Builds `data/products_web/` (square, white-background photos) from `data/products/` |
| `scripts/app_check.py` | Live browser test of the running site (Problem 11); writes `output/app_check_images/` |

### The chat round trip

1. The shopper types in the chat widget (`frontend/src/components/ChatWidget.tsx`). The widget sends `POST /api/chat` with `{"message", "history", "page"}`. The history is only used for guests; signed-in shoppers' history comes from the database. See [Customer memory and page context](#customer-memory-and-page-context).
2. `main.py` validates the request:
   - message: 1–1,000 characters
   - history: at most 40 turns, each at most 4,000 characters
   - rate limit: 15 chat requests per minute per client, otherwise 429

   It then looks up the signed-in user, if any, from the session cookie.
   - Messages with card numbers, SSNs, or passwords, or that suggest a crisis, are answered by a [guardrail](#safety-rules) and never reach the model.
   - For signed-in shoppers, it loads their `CustomerProfile` and saved history.
   - It checks the page context against the database and detects repeated questions.
3. `agent.run_chat()` converts the history into PydanticAI messages (`ModelRequest`/`ModelResponse`) and runs the agent with `ChatDeps(customer=..., page=...)`. The run is capped at 8 model requests.
4. The agent calls tools as needed and returns a structured `ChatReply`: `message`, plain text; `product_ids`, up to 12 ranked; `update_page`; `results_heading`.
5. Before the reply is accepted, the output validator rejects prices or product IDs that no tool returned, and the model retries. `main.py` then looks up each `product_id` in the database and builds `ProductCard`s (name, price, image, sizes in stock). Unknown IDs are dropped, so cards can't show invented products or prices. The whole run is appended to the [audit trail](#audit-trail).
6. The response is `{"reply": "...", "products": [ProductCard, ...], "page_results": PageResults | null}`. The widget shows the reply and up to 3 clickable cards. When `page_results` is present, the Products page updates too; see [How search results reach the page](#how-search-results-reach-the-page).
7. On failure, the shopper sees a friendly message and nothing else:
   - 503: assistant not configured
   - 502: model or provider error
   - 429: too many messages
   - 422: invalid input

   The server logs only the error type and status.

## How the agent is loaded

- **When:** `agent.get_agent()` builds the agent once, on the first chat request, and caches it with `functools.cache`. The API still starts, and products and login still work, when the key is missing; chat then returns 503.
- **Credentials:** at import, `agent.py` loads `Portkey.env` from the class folder (`backend/` → `hw4/` → `Homework/` → class folder) with `python-dotenv`. `CAMPUS_CUSTOMS_ENV_FILE` can point elsewhere. Only `PORTKEY_API_KEY` is read, and it's never logged.
- **Model:** `OpenAIResponsesModel(OPENAI_MODEL)`, which defaults to `gpt-5.6-luna` and uses the OpenAI Responses API. It gets an `AsyncOpenAI` client aimed at Portkey's gateway:
  - `base_url`: `https://api.portkey.ai/v1` (`PORTKEY_BASE_URL`)
  - `x-portkey-api-key`: the key
  - `x-portkey-provider`: sent only if `PORTKEY_PROVIDER` is set. This key has a default provider attached, and sending `@openai` is rejected with "Following keys are not valid: openai".
- **Model settings:** `openai_reasoning_effort` comes from `OPENAI_REASONING_EFFORT` (default `low`). No temperature is sent. `retries=2` lets the model fix a bad tool call or output.
- **System prompt:** registered with `@agent.instructions`. It re-reads `backend/prompts/prompt.md` on every run, so prompt edits take effect on the next message without a restart. `uvicorn --reload` only watches `.py` files. Two more instruction functions add a "Current shopper" block and a "Current page" block from `ChatDeps`.
- **Output type:** `ChatReply`, from `models.py`. PydanticAI validates it and asks the model to retry if it's malformed.
- **Tools** (from `tools.py`): eight read-only tools, described in [Agent tools: product info and stock](#agent-tools-product-info-and-stock).

| Setting (environment variable) | Default | Purpose |
|---|---|---|
| `CAMPUS_CUSTOMS_ENV_FILE` | `<class folder>/Portkey.env` | Where to load `PORTKEY_API_KEY` from |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Model name sent through Portkey |
| `OPENAI_REASONING_EFFORT` | `low` | Responses API reasoning effort |
| `PORTKEY_PROVIDER` | (unset) | Optional `x-portkey-provider` header value; leave unset for this key |
| `PORTKEY_BASE_URL` | `https://api.portkey.ai/v1` | Portkey gateway URL |

## Agent tools: product info and stock

All tools live in `backend/tools.py` and are registered in `TOOLS`. PydanticAI turns each function's type hints and docstring into the tool schema the model sees, and validates the tool's return value against a Pydantic model in `backend/models.py`.

Each call reads **live** data. It opens `campus_customs.db` read-only (`file:...?mode=ro`) and loads rows through `backend/tools.py`, which the website's product pages use too, so the chatbot and the site always agree. Nothing is cached or generated. If a `product_id` doesn't exist, the tool raises `ModelRetry`, which tells the model to call `search_products` and try again with a real ID. That way it never guesses.

The website already showed description, price, and stock on each product page (`GET /api/products/{id}`). The agent previously had one general tool for this, `get_product_details`, which returned the raw product with inventory. It's still there as the all-in-one tool. It now sits alongside three focused tools and returns explicit sold-out information.

| Tool | Input | Returns (`models.py`) | Database fields used | Why it exists |
|---|---|---|---|---|
| `search_products` | `query`, `category`, `color`, `max_price`, `in_stock_size`, `limit` | `SearchResults` → list of `ProductSummary` | `catalogue`: all columns; `inventory`: `size`, `quantity` | Turns what the shopper says ("Big Yale hoodie", "Davenport", "navy under $60") into real `product_id`s. Summaries include `sizes_in_stock` and `sold_out_sizes`, so even browsing answers are honest about availability. |
| `get_product_description` | `product_id` | `ProductDescription` | `tools.name`, `garment_type`, `description`, `colors` | Answers "what does it look like?" (graphics, logo placement, hood or zip). It returns no price or stock, so the answer stays focused. |
| `get_product_price` | `product_id` | `ProductPrice` | `tools.name`, `price` | A single source for prices, so quoted and compared prices are always the current database value (USD). |
| `check_stock` | `product_id`, optional `size` (XS–XXL) | `StockReport` (list of `SizeStock`) | `inventory.size`, `quantity` (plus `tools.name`) | Answers "is it in stock in M?" or "what sizes are left?". Each size gets an explicit status, so sold-out sizes can't be missed or guessed. |
| `get_product_details` | `product_id` | `ProductDetails` (includes a `StockReport`) | All of the above | The general tool: a full rundown of one item in one call, when a shopper asks about several things at once. |
| `list_categories` | none | dict of counts and price range | `tools.garment_type`, `price` | Broad questions ("what do you carry?", "what's your price range?") without loading every product. |
| `get_customer_profile` | none | `CustomerProfile` or a "guest" message | from `ChatDeps.customer` (built from the session) | Account questions about the signed-in shopper only; see [Customer fields](#customer-fields-the-agent-can-access) |
| `get_current_page` | none | `PageView` or a message | from `ChatDeps.page` (checked against the DB) | Resolves "this item" / "the second one"; see [page context](#how-page-context-is-passed) |

### Agent abilities at a glance

- **Find and filter products:** by keyword, category, main color, price, and in-stock size, then recommend them.
- **Answer from live data:** exact descriptions, prices, and per-size stock, always naming sold-out sizes.
- **Drive the page:** put up to 12 ranked matches on the Products page (`update_page`); see [below](#how-search-results-reach-the-page).
- **Remember signed-in shoppers:** across visits, and greet them by name; see [memory](#customer-memory-and-page-context).
- **Understand the screen:** "this item" on a product page, or "the second one" among the page's matches.
- **Recap repeated questions:** a short answer instead of starting over, with stock re-checked.
- **Answer questions sent from product pages:** the "Ask about size X" button (`assistant/askAssistant.ts`) opens the chat and sends the question.

### Model fields and why they matter

- **`ProductSummary`** (search results): `product_id`, `name`, `category`, `garment_type`, `price`, `colors`, `description`, `sizes_in_stock`, `sold_out_sizes`, `total_stock`.
  - `category` is a normalized label from `tools.product_category()` (the raw `garment_type` has 22 inconsistent values). It's what lets the model filter reliably.
  - `sold_out_sizes` is included so a list of recommendations can mention sold-out sizes without extra tool calls.
- **`ProductDescription`**: `product_id`, `name`, `category`, `garment_type`, `description`, `colors`.
  - The `colors` field description tells the model these are all the colors on one item (garment, trim, graphics), **not** separate color options. Without that, the model said an ivory tee with navy trim was "also offered in navy blue".
- **`ProductPrice`**: `product_id`, `name`, `price`, `currency` (always `"USD"`). Having the currency explicit avoids ambiguity when the model quotes prices.
- **`SizeStock`**: `size`, `quantity`, `status`. `status` is one of four values:
  - `in_stock`: more than 5 units
  - `low_stock`: 1–5 units, the same threshold as the website's "Only N left" label (`LOW_STOCK_THRESHOLD`)
  - `sold_out`: 0 units
  - `not_offered`: no inventory row for that size

  Giving the model a labeled status, not just a number, makes "sold out" unambiguous.
- **`StockReport`**: `product_id`, `name`, `sizes` (every size in XS–XXL order), `requested_size`, `sizes_in_stock`, `low_stock_sizes`, `sold_out_sizes`, `total_stock`, `fully_sold_out`, `has_sold_out_sizes`.
  - `requested_size` answers the shopper's exact size question directly.
  - The boolean flags trigger the prompt's out-of-stock rules: always name every sold-out size, and say "sold out" when `fully_sold_out` is true.
- **`ProductDetails`**: the description and price fields plus `stock: StockReport`.
- **`ProductCard`** (sent to the website, not the model): see [the API contract](#2-the-api-contract-post-apichat). The chat widget prints "Sold out: XS, XL" in red on each card, so sold-out sizes are visible even if the reply text doesn't mention them.

### How the prompt uses the tools

`backend/prompts/prompt.md` has three sections for this:

- **Product info and stock tools:** which tool to call for which question. Search first to get IDs; call `check_stock` before saying anything is available.
- **Out-of-stock rules:** list every sold-out size, say "sold out" plainly, never invent restock dates, and for `not_offered` sizes say they aren't available.
- **Colors:** explains what the `colors` list means.

Live checks against the database:
- **Benjamin Franklin Fleece Jacket, "XXL?":** `check_stock` answered XXL sold out and also named XS as sold out.
- **Baseball Left Chest Crewneck, price and sizes:** $58; XS and XL sold out; only a few left in M.
- **Yale Law School quarter-zip, price:** `get_product_price` returned $72.
- **Yale Dad Hoodie, "3XL? restock?":** 3XL isn't carried, and it had no restock information.

## How search results reach the page

When a shopper asks the chatbot about a type of merchandise ("navy hoodies", "crewnecks under $60", "gifts for a Yale grandpa"), the matches appear as product cards on the **Products page**. Each card has an image, name, price, and description, plus sold-out sizes when there are any. Every new search replaces them, so the page follows the conversation.

```text
Shopper message ─► ChatWidget ─► POST /api/chat {message, history}
                                   │
                                   ▼
                    agent.run_chat()  (prompt: "Showing results on the page")
                      └─ search_products(category, color, max_price, in_stock_size, limit≤12)   [read-only DB]
                                   │
                                   ▼
                    ChatReply {message, product_ids[≤12], update_page, results_heading}
                                   │
                  main.py: look up every ID in the DB → ProductCard (drop unknown IDs)
                                   │
                                   ▼
        ChatResponse {reply, products: cards[:3], page_results: {heading, query, products: cards} | null}
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
  Chat panel: reply + 3 mini cards                AssistantResultsProvider (React context)
  + "See all N matches on the page →"                        │
                                                             ▼
                                   ProductsPage: "Picked by our assistant" section
                                   (ProductGrid of the same ProductCard component)
                                                             │  click
                                                             ▼
                                   /products/{product_id}: single-item page (Problem 3)
```

### 1. The agent decides (structured output)

`ChatReply` in `backend/models.py` has four fields:

| Field | Meaning |
|---|---|
| `message` | Chat text. For searches, a short summary of the top picks. |
| `product_ids` | Up to `MAX_PRODUCT_MATCHES` (12) IDs, most relevant first, taken only from tool results |
| `update_page` | `true` for merchandise searches and refinements. `false` for single-item questions (price, stock, description), general questions, greetings, off-topic or refused messages, and searches with no matches. |
| `results_heading` | A short title-case heading for the page (e.g. "Navy Hoodies", "Crewnecks Under $60"), or null |

The **"Showing results on the page"** section of `backend/prompts/prompt.md` tells the agent when to set `update_page`:
- For a merchandise search, call `search_products` with `limit` up to 12.
- Re-search when the shopper changes direction or refines ("only size M", "cheaper").
- Keep the chat text short.
- Never pad the page with unrelated items.

Color searches match the garment's **main color**, `main_color`, which is the first entry in `colors`. So "navy hoodies" returns navy hoodies, not gray hoodies with a navy logo. `include_accent_colors=true` matches trim and graphics too.

### 2. The API contract (`POST /api/chat`)

```json
{
  "reply": "I've pulled 12 navy hoodies onto the page...",
  "products": [ProductCard, ProductCard, ProductCard],
  "page_results": {
    "heading": "Navy Hoodies",
    "query": "Show me navy hoodies",
    "products": [ProductCard, "... up to 12"]
  }
}
```

- **`ProductCard`** (built by `tools.to_card()` from the database, never from model text) has these fields:
  - `product_id`, `name`, `garment_type`, `description`
  - `price`, `image_url`
  - `sizes_in_stock`, `sold_out_sizes`, `total_stock`
- **`page_results`** is `null` unless `update_page` is true and at least one ID was valid. A `null` means "leave the page as it is", so a follow-up such as "is the first one in stock in M?" doesn't wipe the results.
- **`products`** is the first `MAX_CHAT_CARDS` (3) cards, shown inside the chat panel.
- The same TypeScript types live in `frontend/src/types.ts` (`ProductCard`, `PageResults`) and `frontend/src/api/chat.ts` (`ChatResponse`).

### 3. The frontend renders it

- **`ChatWidget.tsx`**: on a response with `page_results`, it calls `showResults()` from `useAssistantResults()`.
  - On Home, About, or Products, it also navigates to `/products`, so the page adapts right away.
  - On a product page or the Log in / Create account forms, it doesn't navigate away, to protect the shopper's place and form input. The chat message shows a "See all N matches on the page →" link instead.
- **`assistant/AssistantResultsProvider.tsx`**: a React context that holds the latest `PageResults` plus a `version` counter.
  - It sits above the router's pages, in `main.tsx`, so results survive navigating to an item page and back.
  - Results clear on a full page reload or with the **Clear results** button.
- **`pages/ProductsPage.tsx`**: when results exist, it renders an **"Picked by our assistant"** section above the full catalogue. The section shows the heading, "N matches for “query”", the **Clear results** button, and a `ProductGrid` of the matches.
  - Each new `version` replays a short entrance animation.
  - If the shopper has scrolled past the section, it scrolls into view.
  - The tab title changes to the heading, e.g. "Navy Hoodies | Campus Customs".
  - The full "All products" grid stays below.
- **`components/ProductCard.tsx`**: one card component for both catalogue products and assistant matches. It accepts any object with `product_id`, `name`, `price`, `description`, `image_url`, and `total_stock`. Assistant cards also show "Sold out: …" in red when some sizes are sold out.

### 4. Clicking through still uses the single-item page

Every card, whether on the page or in the chat, is a link to `/products/{product_id}`. That route is the Problem 3 `ProductDetailPage`: a large image on the left and name, price, description, colors, and per-size stock on the right. It fetches `GET /api/products/{product_id}` fresh, so stock is always current. The chat panel stays open with its conversation, and going back to `/products` still shows the assistant's picks.

Verified in the browser:
- "Show me navy hoodies" from the Home page navigated to Products and showed 12 navy hoodies.
- "Actually, show me T-shirts for the Yale football fan" replaced them with 3 football tees.
- "Is the first one in stock in medium?" answered in chat (M = 25, which matches the database) and left the page unchanged.
- Clicking a page card and a chat card both opened the correct item page.
- "See all matches" returned to the results, and "Clear results" restored the plain catalogue.

## Customer memory and page context

### How chat history is stored

**Where:** the `chat_messages` table. The code is in `backend/main.py`, and the routes are in `backend/main.py`.

| Column | What's stored |
|---|---|
| `id` | Autoincrement; gives message order |
| `user_id` | The signed-in shopper (`users.id`), taken from the session cookie, never from the request body |
| `role` | `user` or `assistant` |
| `content` | The shopper's message, or the assistant's plain-text reply |
| `products_json` | Assistant rows only: a JSON list of the `ProductCard`s for that reply, the full ranked list of up to 12. `NULL` when there were none. |
| `created_at` | UTC timestamp (SQLite default) |

**When:**
- After every successful `POST /api/chat` from a **signed-in** shopper, `save_exchange()` writes the user row and the assistant row in one transaction.
- Replies to messages blocked by the content filter are saved the same way.
- Failed requests (502/503) aren't saved.
- **Guests are never saved.** Their conversation lives only in the chat widget's React state and disappears when the tab is closed or reloaded.

**Loading on login:**
- `GET /api/chat/history` returns `{signed_in, messages: [StoredChatMessage]}`: the shopper's last 100 messages, oldest first. Guests get an empty list.
- Each message's product cards are rebuilt from the **live** catalogue using the saved `product_id`s, so old conversations show current prices and stock. Deleted products are dropped, and up to 3 cards are shown per reply, as in the live chat.
- The loader understands both `products_json` shapes in the table: the full product snapshots in the provided rows, and `ProductCard`s. It also strips old Markdown (`**bold**`).
- When `AuthProvider` reports a signed-in user, the chat widget loads this history under an "Earlier conversations" divider, followed by a "Welcome back, First!" greeting.
- On logout, or when a different user logs in, the widget resets to the guest greeting. One person's chat is never shown to the next person using the same browser.

**What the agent reads:**
- For signed-in shoppers, `agent_history()` loads their last 40 saved messages as the agent's `message_history`. The browser's `history` field is ignored for them, so a tampered request can't inject fake past turns.
- Assistant turns get a note, `[Product cards shown with this reply: id, ...]`, so "the first one you showed me" still resolves in a later visit.
- For guests, the browser's `history` is used instead (last 40 messages, each with the `product_ids` it showed).

**Deleting:**
- `DELETE /api/chat/history` removes all of the signed-in shopper's rows. It's the trash button in the chat header, shown only when there's something to clear.
- For guests, the same button just clears the widget.

### Customer fields the agent can access

The agent learns who the shopper is only from the **session**. `main.py` looks up the user from the `cc_session` cookie (`main.get_current_user`), then builds a `CustomerProfile` with `main.customer_profile()` and puts it in `ChatDeps.customer`. Guests have `customer = None`.

| `CustomerProfile` field | Source | Used for |
|---|---|---|
| `user_id` | `users.id` | Internal. Keeps the agent tied to this shopper; not shown in replies. |
| `first_name`, `last_name` | `users.first_name` / `last_name` (falls back to splitting `users.name`) | Greeting by name, "who am I?" |
| `email` | `users.email` | "What email is my account under?" |
| `member_since` | `users.created_at` (date only) | "How long have I been a member?" |
| `saved_message_count` | `COUNT(*)` of their `chat_messages` | Knowing there's prior history |

How the agent receives it:
- The **"Current shopper"** instructions block (`agent.describe_shopper`) gives the name and member-since date. It says whether the shopper is signed in and tells the agent never to discuss other customers.
- The **`get_customer_profile`** tool returns the full profile when the shopper asks about their account. For guests it returns a "browsing as a guest" message.

**Never available to the agent:** `password_hash`, session tokens, and other users' rows. None of its tools can query `users`, `sessions`, or `chat_messages`; the backend passes in only this shopper's profile and history.

### How page context is passed

The chat widget sends a `page` object with every message. `pageContext()` in `ChatWidget.tsx` builds it from the current route and the assistant results context:

```json
{
  "path": "/products/yale-dad-crewneck",
  "page_type": "product",
  "product_id": "yale-dad-crewneck",
  "visible_product_ids": []
}
```

- **`page_type`** is one of `home`, `products`, `product`, `about`, `login`, `create-account`, or `other`.
- **`product_id`** is set on `/products/{id}` pages.
- **`visible_product_ids`** is set on `/products` when the "Picked by our assistant" section is showing (up to 12, in on-screen order).

The browser's page object is untrusted input. `main.resolve_page()` turns it into a `PageView` using only database lookups:
- `viewing_product` is the open product as a `ProductSummary`: price, `main_color`, all colors, `sizes_in_stock`, and `sold_out_sizes`.
- `visible_products` are the on-screen matches, as `ProductSummary`s.
- Unknown IDs are dropped, and no browser-supplied text reaches the model.

The `PageView` goes in `ChatDeps.page` and reaches the agent two ways:
- **The "Current page" instructions block** (`agent.describe_page`) states the page type. On a product page it says "This item / this one / it refers to …", with that product's facts. On the Products page it lists the assistant matches as `1.`, `2.`, `3.` so "the second one" resolves.
- **The `get_current_page` tool** returns the same `PageView` when the agent needs to double-check.

Examples, verified live:
- On `/products/basic-hoodie-big-yale`, "Do you have this item in green?" got: No, it's a navy pullover with white Yale lettering, and no hoodie comes in green. That's correct: no hoodie has green as its main color.
- On `/products/yale-dad-crewneck`, the same question got: No, it's heather gray with navy accents; M, L, and XL are sold out.
- On `/products` with three matches shown, "Is the second one available in XL?" got: the Baseball Left Chest Crewneck's XL is sold out (and XS too).
- Signed in as a test account, visit 1 asked about gifts for a dad. Visit 2 was a fresh login with no browser history. "Who was I shopping for last time, and what's my email?" got: your dad, and handsome.dan@yale.edu.
- A guest asking for other customers' accounts was refused, and no guest messages were written to `chat_messages`.

## models.py reference

Every request and response body, tool result, and agent output is a Pydantic model in `backend/models.py`. That gives FastAPI validation (and the `/docs` schema), gives the agent typed tool results, and matches `frontend/src/types.ts`. Models explained in detail above are linked rather than repeated. Auth bodies (`RegisterRequest`, `LoginRequest`, `User`, `SessionResponse`) are here too; see [Authentication](#authentication).

| Model / type | Fields | Why it's needed |
|---|---|---|
| `Size`, `Category`, `StockStatus`, `PageType` | Literal value sets | Restrict tool arguments and fields to valid values. `Category` is the normalized version of the 22 raw garment labels. |
| `InventoryItem` | `size`, `quantity` | One inventory row; the building block of per-size stock |
| `Product` | `product_id`, `name`, `garment_type`, `category`, `description`, `colors`, `search_tags`, `image_file_path`, `image_url`, `price`, `inventory`, `total_stock` | The `/api/products` shape used by product pages, filters (`category`), and cards. `image_url` carries the cache-busting `?v=`. |
| `ProductSummary`, `SearchResults` | Summary fields plus `main_color`; `total_matches`, `products` | What `search_products` returns. `main_color` is the garment color, which color search matches. See [tool models](#model-fields-and-why-they-matter). |
| `ProductDescription`, `ProductPrice`, `SizeStock`, `StockReport`, `ProductDetails` | See [tool models](#model-fields-and-why-they-matter) | Focused tool results with explicit sold-out statuses |
| `ProductCard` | See [API contract](#2-the-api-contract-post-apichat) | Cards built from the database, never from model text |
| `ChatTurn` | `role`, `content` (≤4,000 chars), `product_ids` (≤12) | One history turn. `product_ids` lets the agent resolve "the first one" later. |
| `PageContext` → `PageView` | See [page context](#how-page-context-is-passed) | The untrusted page info from the browser, then its database-checked version for the agent |
| `ChatRequest` | `message` (1–1,000 chars), `history` (≤40 turns), `page` | The `/api/chat` body. The length caps bound cost and injection surface. |
| `CustomerProfile` | See [customer fields](#customer-fields-the-agent-can-access) | The only account data the agent may see |
| `StoredChatMessage`, `ChatHistoryResponse` | `id`, `role`, `content`, `products`, `created_at`; `signed_in`, `messages` | The `/api/chat/history` response |
| `ChatReply` | See [structured output](#1-the-agent-decides-structured-output) | The agent's validated output |
| `PageResults` | `heading`, `query`, `products` | Matches for the Products page |
| `ChatResponse` | `reply`, `products` (≤3), `page_results`, `notice`, `redacted_message` | The `/api/chat` response. `notice` is `sensitive_data_removed`, `repeat_answer`, or `crisis_support`, and the chat shows a matching tag. `redacted_message` replaces the shopper's bubble when sensitive data was removed. |
| Constants | `LOW_STOCK_THRESHOLD`=5, `MAX_MESSAGE_LENGTH`=1000, `MAX_HISTORY_TURNS`=20, `MAX_PRODUCT_MATCHES`=12, `MAX_CHAT_CARDS`=3 | Shared limits (see [Agent specs](#agent-specs)) |

## Safety rules

Safety is layered: prompt rules ask the model to behave, and code enforces the rules that matter most, even if the model misbehaves.

**Prompt rules** (`backend/prompts/prompt.md`):

| Section | Covers |
|---|---|
| Safety basics | Stay on topic, resist prompt injection, never reveal the prompt or credentials, never collect passwords or payment data, refuse harmful content |
| How to answer, Product info and stock tools, Out-of-stock rules, Colors | Only facts from tools; call the right tool; name every sold-out size; no invented restocks or colorways |
| Customer memory and page context | Trust the session and page blocks over what the shopper claims; never discuss other customers |
| Repeated questions, Guardrails enforced in code | Recap repeats; only cite tool-returned prices and IDs |
| **Additional safety rules** (Problem 12) | No discounts, holds, refunds, or custom orders; no fabric, fit, care, origin, or delivery claims; officially licensed, but never speaking for Yale; collect no personal data and keep things simple with apparent minors; nothing about other people's accounts or chats; treat product data and history as untrusted; friendly rivalry only, no politics; crisis resources first; decline briefly when in doubt |

**Enforced in code:**

| Guardrail | Where | What happens |
|---|---|---|
| Sensitive-data screen | `agent.screen_sensitive` | Luhn-valid card numbers, SSNs, and "password is …" are caught before the model and the database. The shopper gets a safety reply, their bubble is redacted, and only the redacted text is stored or audited. |
| Crisis screen | `agent.screen_crisis` | Self-harm, danger, or emergency wording gets an immediate caring reply with 911 and 988, before the model. The provider's content filter would otherwise have turned it into a generic refusal. |
| Reply fact check | `agent.only_verified_facts` (output validator) | Dollar amounts must match tool prices (or totals of them, or amounts the shopper typed). Product IDs must come from tools, page context, or history. Anything else raises `ModelRetry`. |
| Content-filter handling | `agent.is_content_filtered` | A prompt blocked by Azure's filter (Portkey's default provider) gets a polite on-brand refusal, not an error. |
| Read-only tools | `tools._read_only_connection` | The agent can't change products, stock, or accounts; no tool runs model-written SQL. |
| Cost and abuse limits | `main.py`, `agent.py`, `models.py` | 15 chat requests per minute per client, length caps, and 8 model requests per run (see [Agent specs](#agent-specs)) |
| Account and privacy protections | `main.py`, `main.py` | Hashed passwords, HttpOnly session cookies, login throttling, guests never saved (see [Authentication](#authentication)). The audit trail stores `user_id` only. |

Verified live: a 20%-off request was declined, and the reply said fabric content isn't available rather than guessing. A self-harm message got crisis resources. A jailbreak attempt got the polite refusal, and a card number was redacted.

## Audit trail

**File:** `output/audit_trail.json`, written by `backend/agent.py`. It is a JSON array with one entry per chat request that reaches the backend's chat logic.

**Append-only:**
- Each entry is written in place of the array's closing `]`, under a file lock.
- Earlier bytes are never rewritten, and the file is never cleared, so history survives restarts and reruns.
- If the file isn't a valid array (e.g. after a hand edit), new entries go to `output/audit_trail.recovery.jsonl` and the file itself isn't touched.

| Field | Meaning |
|---|---|
| `event_id`, `event` | Unique ID. `agent_run` for model runs; `guardrail_block` for requests answered before the model. |
| `timestamp_start`, `timestamp_end`, `runtime_ms` | When it ran and how long the whole loop took |
| `model`, `reasoning_effort`, `system_prompt_sha256`, `limits` | Which model and settings were used, a fingerprint of the exact `prompt.md` version, and the loop limits (`request_limit`, `retries`) |
| `shopper` | `signed_in` and `user_id` only (no names or emails) |
| `page`, `repeat_detected`, `message`, `history_messages` | The page context, whether a repeat was detected, the (redacted) shopper message, and the number of history messages |
| `steps` | In order: `model_response` (`finish_reason`, `model_name`, token `usage`, `tool_calls` with `args`, any text), `tool_result` (`tool_name`, `duration_ms`, `result`, truncated at 4,000 chars), and `retry` (a validator or tool retry with its reason) |
| `tools_used`, `usage` | Tool names in call order; totals for requests, tool calls, and input/output tokens |
| `output` | The final `ChatReply` (`message`, `product_ids`, `update_page`, `results_heading`) |
| `stop_reason` | `final_output`, `usage_limit_exceeded`, `output_validation_failed`, `content_filtered`, `model_error`, `not_configured`, or `error` for agent runs; `blocked_sensitive_data`, `crisis_support`, or `rate_limited` for guardrail blocks |
| `error` | Exception type and HTTP status only (never provider bodies or keys) |

**Reading it:**

```bash
python3 -c "import json; [print(e['timestamp_start'], e['stop_reason'], e.get('tools_used')) for e in json.load(open('output/audit_trail.json'))]"
```

## Agent specs

| Spec | Value | Where |
|---|---|---|
| Model | `gpt-5.6-luna` (`OPENAI_MODEL`) via the OpenAI Responses API through Portkey; reasoning effort `low`; no temperature | `agent.py`; see [How the agent is loaded](#how-the-agent-is-loaded) |
| Framework | PydanticAI 2.x (`pydantic-ai-slim[openai]`), structured output `ChatReply` | `agent.py`, `models.py` |
| Loop limit | At most 8 model requests per chat message (`USAGE_LIMITS`). If exceeded, the stop reason is `usage_limit_exceeded` and the shopper is asked to rephrase. | `agent.py` |
| Retries | 2 (`AGENT_RETRIES`) for invalid tool calls and validator-rejected replies. After that, the stop reason is `output_validation_failed` and the shopper sees a friendly error. | `agent.py` |
| Result caps | `search_products` returns `limit` results (default 8, max 20). Up to 12 product IDs per reply, 12 on the page, 3 cards in chat. | `tools.py`, `models.py` |
| Input caps | Message ≤1,000 chars; history ≤40 turns of ≤4,000 chars; 15 chat requests per minute per client | `models.py`, `main.py` |
| Memory | The agent reads the last 40 saved messages. The chat window shows the last 100. Guests aren't saved. | `main.py` |
| Repeat detection | ≥85% similarity against the last 20 shopper messages | `agent.py` |
| Tools | 8 read-only tools | `tools.py`; see [tools](#agent-tools-product-info-and-stock) |
| Audit | Every run is appended to `output/audit_trail.json` | `agent.py` |

**How to run** (details in `../README.md`):

```bash
cd "/Users/tombarbaro/Desktop/MGT 409 - AI Foundations/Homework/hw4/backend" && source ../.venv/bin/activate && uvicorn main:app --reload --port 8000
```

```bash
cd "/Users/tombarbaro/Desktop/MGT 409 - AI Foundations/Homework/hw4/frontend" && npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/media` to the backend on port 8000. The API docs are at http://127.0.0.1:8000/docs.

**Maintenance scripts** (from `hw4`, with the venv):
- `.venv/bin/python scripts/normalize_product_images.py` rebuilds `data/products_web/`.
- `.venv/bin/python scripts/app_check.py` runs the live browser test (both servers must be running).
