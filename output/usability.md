# Campus Customs Usability Improvements

Four improvements to the website: two on the front end and two in the agent/backend. Each section covers what was added, why it improves the Campus Customs experience, and how to see it on the site.

To try them, start the backend (`uvicorn main:app --reload --port 8000` from `backend/`) and the frontend (`npm run dev` from `frontend/`), then open http://localhost:5173.

---

## Front end 1: Animated link underlines

**What was added:**
- **Links and titles:** an underline now *draws* from left to right over 0.5 seconds when you hover over (or tab to) a link, and retracts the same way when you move off. Before, underlines snapped on and off instantly.
  - Product card titles, on the Products page, the assistant's picks, and the Home page's featured products
  - Product names in the chat's product cards
  - Breadcrumbs on product pages (Home / Products)
  - Footer links and the footer email
  - "Shop all products →" and "Get directions →" links
  - The "Create an account" and "Log in" links on the account forms
- **Nav bar:** the underline under Home / Products / About Us grows from the left on hover, and stays drawn under the page you're on.
- **Implementation:**
  - The shared `.link-underline` class in `frontend/src/index.css` draws the line as a background that animates from `0` to `100%` width. It follows multi-line product titles line by line.
  - The nav uses a `transform: scaleX()` animation on its `::after` bar (`components/Layout.css`).
  - Links inside paragraphs, such as the email in "Email us at …", keep a normal always-visible underline so they still read clearly as links.
  - With "reduce motion" turned on in the operating system, the existing global rule switches the animation off.

**Why it's better:**
- The motion shows at a glance which card or link your pointer is on. That helps on a dense 102-product grid where many images look similar.
- It feels more polished and on-brand than an abrupt underline, closer to the look of the reference store.
- Keyboard users get the same cue, because focus triggers it too. That makes tabbing through products easier to follow.

**Where to see it:** hover over any product title on the Products page, the nav links, the breadcrumbs on a product page, or the footer links.

---

## Front end 2: Search, filter, and sort toolbar on the Products page

**What was added:**
- **The toolbar:** it sits above the full catalogue on the Products page (`components/CatalogueFilters.tsx`, with logic in `catalogueFilters.ts`).
  - **Search box:** matches words in the product name, description, and colors (e.g. "bulldog", "Davenport", "navy").
  - **Category chips with counts:** All 102, Hoodies 27, Crewnecks 29, T-Shirts 25, Quarter-Zips 11, Jackets 8, Long Sleeve 2. The raw database has 22 inconsistent garment labels, so the counts use the backend's normalized categories. The API now includes `category` for each product.
  - **"In stock in" size filter:** shows only items with at least one unit in stock in that size.
  - **Sort:** Name (A–Z), Price low to high, Price high to low.
  - **Results:** a live "Showing N of 102 products" count, a **Reset filters** link, and a friendly empty state when nothing matches.
- **Filters are kept in the URL**, e.g. `/products?category=hoodie&size=M&sort=price-desc`. The back button, refresh, and shared links all keep the shopper's view. That includes coming back from a product page.
- It works alongside the chat assistant's "Picked by our assistant" results, which stay above it.

**Why it's better:**
- Before, the only way to narrow 102 products was to scroll or ask the chatbot.
- Shoppers can now answer the most common questions in one or two clicks: "which hoodies do you have in my size?" or "what's the cheapest crewneck?"
- The size filter means shoppers don't open product pages only to find their size is sold out.
- The chips and counts show the shape of the catalogue at a glance.

**Checked:** Hoodies + "in stock in M" + Price high to low showed 21 of 102, led by the $88 full-zip hoodies. That matches the database exactly (21 hoodies with M in stock, max price $88). There was no horizontal scrolling at phone width.

---

## Back end 1: Code-enforced safety guardrails

The system prompt already asked the agent to stay safe and accurate. These guardrails enforce it **in Python** (`backend/agent.py`), so they hold even if the model ignores its instructions.

**What was added:**
1. **Sensitive-data screen, before the model and the database.** Each chat message is checked for:
   - payment card numbers: 13–19 digits that pass the Luhn checksum, so order numbers and prices aren't flagged
   - Social Security numbers
   - passwords ("my password is …")

   If one is found:
   - The message is **never sent to the AI provider**. The shopper gets an immediate reply explaining that they shouldn't share it, that nothing was read or saved, and that orders go to orderdept@campuscustoms.com.
   - The website swaps the shopper's own chat bubble to the redacted text, e.g. "Number is [card number removed]". A 🔒 tag appears: "Sensitive info removed · not sent to the assistant or saved".
   - For signed-in shoppers, only the redacted text is stored in `chat_messages`.
2. **Fact-checking output validator.** A PydanticAI `@agent.output_validator` in `backend/agent.py` checks every reply before it reaches the shopper:
   - Every **dollar amount** in the reply must match a price the tools returned in that conversation, a total of 2–3 of those prices, or an amount the shopper typed ("under $70").
   - Every **product card ID** must come from a tool result, the current page, or earlier product cards.

   If a reply fails, the model is sent back to fix it (`ModelRetry`) instead of showing an invented price or product.

**Why it's better:**
- **Trust:** shoppers can rely on the prices they see in chat. A tested reply with a made-up "$49" price was automatically rejected and corrected to the real $68.
- **Privacy and security:** card numbers and passwords never reach the AI provider, the database, or the chat window. Campus Customs can't take payments in chat anyway, so the shopper is steered to the right channel.
- The guardrails are enforced in code, not just requested in the prompt, which protects both the store and its customers.

**Where to see it:** in the chat, type something like "Can I pay by card? My number is 4111 1111 1111 1111". The price check runs silently on every reply.

---

## Back end 2: Repeat-question detection

**What was added:**
- **Detection:** before each reply, `agent.find_repeat()` compares the new message with the shopper's last 20 messages. For signed-in shoppers that includes saved history from earlier visits.
  - Comparisons ignore case and punctuation, and a message counts as a repeat at 85% similarity.
  - Short messages like "thanks" or "yes" are never flagged.
- **When a repeat is found:**
  - The agent gets a "Repeated question" block with the earlier question, its earlier answer, and the product cards it showed.
  - A new "Repeated questions" section in `backend/prompts/prompt.md` tells the agent to acknowledge the repeat kindly ("Like I mentioned a moment ago…"). It gives a 1–2 sentence recap, re-checks live stock and price, shows the same cards, and asks whether the shopper wants a different size, color, or style.
  - If the repeat means the earlier answer wasn't clear, the agent answers fully instead.
- **In the API and on screen:** the response carries `notice: "repeat_answer"`, and the chat shows a small ↺ tag under the reply: "Recap of an earlier answer · stock re-checked".

**Why it's better:**
- Shoppers who re-ask get a short, consistent answer, not a long reply that might word things differently and seem contradictory.
- The recap is still live: stock is re-checked, so a size that sold out since the first answer is reported correctly.
- Ending with a follow-up moves the conversation forward instead of looping.
- Consistent, shorter replies are easier to read on a phone.

**Where to see it:** ask "Is the Yale Mom Hoodie in stock in XXL?", then ask it again (e.g. "is this in stock in xxl?" on that product's page). Verified: the second reply began "Like I mentioned a moment ago: yes, the Yale Mom Hoodie is in stock in XXL, with only 2 left." with the ↺ tag. The database shows XXL = 2.

---

## Files changed

| Improvement | Files |
|---|---|
| Animated underlines | `frontend/src/index.css`, `components/Layout.css`, `components/products.css`, `components/ChatWidget.css`, `components/ProductCard.tsx`, `components/ChatWidget.tsx`, `components/Footer.tsx`, `pages/ProductDetailPage.tsx`, `pages/HomePage.tsx`, `pages/AboutPage.tsx`, `pages/LoginPage.tsx`, `pages/CreateAccountPage.tsx` |
| Filter toolbar | `frontend/src/components/CatalogueFilters.tsx`, `catalogueFilters.ts`, `pages/ProductsPage.tsx`, `components/products.css`, `types.ts`; `backend/models.py` and `backend/tools.py` (the `category` field) |
| Safety guardrails | `backend/agent.py` (guardrails section and output validator), `backend/main.py`, `backend/models.py` (`notice`, `redacted_message`), `backend/prompts/prompt.md`, `frontend/src/components/ChatWidget.tsx` (redaction and 🔒 tag) |
| Repeat detection | `backend/agent.py`, `backend/agent.py` ("Repeated question" block), `backend/tools.py` (`ChatDeps.repeat`), `backend/main.py`, `backend/prompts/prompt.md`, `frontend/src/components/ChatWidget.tsx` (↺ tag) |
