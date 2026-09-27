# Campus Customs Design Update (Problem 10)

The goal was to make the site look and behave more like the real store at yalebulldogblue.com, a Shopify "Empire" theme, and to make buying easier. Reference details were taken from the site's own theme settings:

- Open Sans for all text, with **uppercase** headings
- Yale blue `#00366b` for buttons and prices
- `3px` button corners and square badges
- `10px` rounded product images
- a large "What are you looking for?" search box in the header
- a category menu row, and a store chat widget

## What changed and why it helps sales

| Change | Reference detail it mimics | Why customers buy more |
|---|---|---|
| **Two-row header:** logo, a large search box, and account links on the first row, and a category menu (Shop All, Hoodies, Crewnecks, T-Shirts, Quarter-Zips, Jackets) on the second | The Empire header and its mega-menu categories | Shoppers who search or pick a category are the ones most ready to buy. Search and categories are visible on every page, so they're one click from the right products. The menu links open the pre-filtered Products page. |
| **Uppercase Open Sans headings, 3px uppercase buttons**, and the store's blue, cream, and teal palette | The theme's `text-transform: uppercase` headings, `button-radius: 3px`, and color variables | A consistent brand look builds trust that this is the real, officially licensed Campus Customs store. Clear, high-contrast buttons show exactly where to click next. |
| **"Shop by category" tiles** on Home, with live style counts (27 hoodies, 29 crewnecks, …), plus "True Bulldog Blue 💙" and "Shop all" collection rows | The Home page's category promos and emoji collection titles (e.g. "Back in Bulldog Blue 💙") | A clear hierarchy (hero, then categories, then featured products) gets shoppers from the landing page to a product grid quickly. The counts show a real selection worth browsing. |
| **Product cards:** square badges, a "Choose options" bar that slides up on hover, a blue price, and a row of size chips with sold-out sizes struck through | Empire `productitem` cards: badge, title, price, and the "Choose options" / "Quick shop" button | Shoppers see whether their size is available *before* they click, which cuts wasted clicks and disappointment. The hover button invites the next step. The "Few sizes left" badge appears only when half or more sizes are sold out (21 of 102 products), so it adds honest urgency without appearing everywhere. |
| **Product page reordered for buying:** title, price, stock pill, **selectable size buttons** (with a live "M: 5 in stock" or "XL is sold out" line), then an action box, then description and colors | The theme's product page, where options come right under the price | The size decision comes first. The box has a primary **"Ask about size XL"** button that opens the chat with that question already sent, an "in person" line with the 57 Broadway address, and a trust row (Officially licensed · Shop at 57 Broadway · Instant answers in chat). That replaces a missing cart with a clear next step and removes the doubts that stop purchases. |
| **Store-chat feel:** an online dot on the avatar, an "Online · instant answers" status, rounder bubbles and composer, and a teaser bubble ("Questions about sizes or stock? 👋") beside the launcher | The store's own chat feature ("use our chat feature") and the Shopify Inbox style | A visible, friendly offer of help draws in shoppers who are hesitating. The assistant answers fit, stock, and gift questions instantly, which is when they're most likely to decide. |

## Kept honest

- **No invented facts:** no sales, shipping offers, or reviews that the reference site or database doesn't support. Badges and stock lines come straight from `inventory`.
- **Store wording:** in-store lines say "Shop at 57 Broadway" rather than claiming this item is on the shop floor, since we don't have store stock data.

## Files

- `frontend/src/components/NavBar.tsx` and `Layout.css`: two-row header, search, category menu
- `frontend/src/index.css`: uppercase headings, 3px uppercase buttons, header offset
- `frontend/src/pages/HomePage.tsx` and `pages.css`: category tiles, collection row
- `frontend/src/components/ProductCard.tsx` and `products.css`: badges, "Choose options" bar, size chips
- `frontend/src/pages/ProductDetailPage.tsx`, `products.css`, and `assistant/askAssistant.ts`: size picker, purchase box, trust row, the "Ask" button that opens the chat
- `frontend/src/components/ChatWidget.tsx` and `ChatWidget.css`: online status, teaser bubble, composer style, the listener for "Ask"
