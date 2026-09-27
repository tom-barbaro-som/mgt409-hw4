# Campus Customs Website (MGT 409 Homework 4)

Customer website for **Campus Customs** (Yale Bulldog Blue, 57 Broadway, New Haven): a React + Vite + TypeScript storefront with a FastAPI backend and a PydanticAI shopping-assistant chatbot (gpt-5.6-luna via Portkey). Shoppers can browse and filter 102 products, create accounts and log in, and chat with an assistant that checks live stock and prices, updates the page with matching products, and remembers signed-in shoppers.

## Repository layout

```text
hw4/
├── AI_prompts.md            full log of the prompts used to build this project
├── AGENTS.md                security expectations for people and AI agents
├── README.md
├── requirements.txt         Python dependencies (backend + helper scripts)
├── .env.example             placeholder settings; copy to .env
├── .gitignore               keeps secrets and the data pack out of git
├── frontend/                Vite React TypeScript app
├── backend/
│   ├── main.py              FastAPI app: accounts, chat history, product and chat routes
│   ├── agent.py             PydanticAI agent + guardrails + append-only audit trail
│   ├── models.py            Pydantic types (products, chat, accounts, tool results)
│   ├── tools.py             database access, catalogue queries, agent tools
│   └── prompts/
│       └── prompt.md        agent system prompt (voice, answering rules, safety)
├── scripts/
│   ├── normalize_product_images.py   builds data/products_web/ from data/products/
│   └── app_check.py                  live browser test of the running site
└── output/
    ├── harness.md           how the whole site works (start here)
    ├── design.md            storefront styling decisions
    ├── usability.md         usability improvements
    ├── app_check.html       live site test report
    ├── app_check_images/    screenshots linked from app_check.html
    └── audit_trail.json     append-only log of every agent run
```

## Data pack (local only, not in git)

The database and product photos aren't in this repository. Place them in a `data/` folder inside `hw4/`:

```text
hw4/data/
├── campus_customs.db        SQLite database (catalogue, inventory, users, chat_messages)
└── products/                product images referenced by the catalogue (*.jpg)
```

Then build the cleaned, square, white-background copies the site serves. This writes `data/products_web/`, and the originals are never modified:

```bash
.venv/bin/python scripts/normalize_product_images.py
```

If `data/products_web/` is missing, the site falls back to the original photos. To keep the data somewhere else, set the shell variable `CAMPUS_CUSTOMS_DATA_DIR=/path/to/data`.

## One-time setup

From the `hw4` folder (Python 3.12+ and Node 20+):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

Create your `.env` from the template and add your Portkey key. `.env` is git-ignored, so never commit it:

```bash
cp .env.example .env
```

The backend reads `PORTKEY_API_KEY` from `hw4/.env`. If that file doesn't exist, it falls back to the class folder's `Portkey.env`, or you can point `CAMPUS_CUSTOMS_ENV_FILE` at another file. Without a key, the site still works, but chat returns "assistant isn't available".

## Run the site

Start the backend (terminal 1, from `hw4/backend`):

```bash
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000
```

Start the frontend (terminal 2, from `hw4/frontend`):

```bash
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/media` to the backend at `http://127.0.0.1:8000`; set `BACKEND_URL` to point elsewhere. The interactive API docs are at http://127.0.0.1:8000/docs.

**Test login:** `test@campuscustoms.yale.edu` / `password`, which comes from the provided database.

## Backend API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/products`, `/api/products/{id}` | Catalogue with per-size stock |
| GET | `/media/products/{file}` | Product images |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Accounts (hashed passwords, HttpOnly session cookie) |
| GET | `/api/auth/session` | The signed-in user, or `null` |
| POST | `/api/chat` | Send `{message, history, page}` to the assistant. Returns `{reply, products, page_results, notice, redacted_message}`. |
| GET / DELETE | `/api/chat/history` | A signed-in shopper's saved chat |

## Checks

With both servers running, from `hw4`:

```bash
.venv/bin/python scripts/app_check.py
```

It drives Chrome through the live site, checks the answers against the database, and saves screenshots to `output/app_check_images/`. `output/app_check.html` is the report.

## Security notes

- No secrets are in this repo. The Portkey key is only ever read from an ignored env file.
- Passwords are salted PBKDF2-SHA256 hashes.
- The chatbot's tools open the database read-only.
- Card numbers and passwords typed into chat are blocked before they reach the model.
- See `AGENTS.md` and the Safety section of `output/harness.md` for the full rules.
