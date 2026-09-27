"""Live site check: drives the running website in Chrome and saves one screenshot per test.

Prerequisites: the backend (port 8000) and frontend (http://localhost:5173) are running.
Run from the hw4 folder:
    .venv/bin/python scripts/app_check.py
Screenshots go to output/app_check_images/; a results summary (with the database values each
test is checked against) prints to the console and is saved as output/app_check_images/results.json.
Every test uses a fresh guest session, so no chats are saved to the database.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

HW4 = Path(__file__).resolve().parent.parent
SITE = "http://localhost:5173"
OUT = HW4 / "output" / "app_check_images"
DB = HW4 / "data" / "campus_customs.db"
VIEWPORT = {"width": 1280, "height": 800}
REPLY_TIMEOUT_MS = 120_000


def db_truth(product_id: str) -> dict:
    conn = sqlite3.connect(f"{DB.as_uri()}?mode=ro", uri=True)
    try:
        name, price = conn.execute("SELECT name, price FROM catalogue WHERE product_id = ?", (product_id,)).fetchone()
        stock = dict(conn.execute("SELECT size, quantity FROM inventory WHERE product_id = ?", (product_id,)).fetchall())
    finally:
        conn.close()
    return {"name": name, "price": price, "stock": stock}


def open_chat(page: Page) -> None:
    page.locator(".chat-launcher").click()
    page.locator(".chat-panel").wait_for(state="visible")


def ask(page: Page, question: str) -> str:
    """Type a question into the chat, wait for the assistant's reply, and return its text."""
    before = page.locator(".chat-message--assistant").count()
    page.locator(".chat-panel__input").fill(question)
    page.locator(".chat-panel__send").click()
    page.wait_for_function(
        "n => document.querySelectorAll('.chat-message--assistant').length > n"
        " && !document.querySelector('.chat-message__typing')",
        arg=before,
        timeout=REPLY_TIMEOUT_MS,
    )
    page.wait_for_timeout(600)  # let cards and page results finish rendering
    return page.locator(".chat-message--assistant .chat-message__bubble").last.inner_text()


def test_inventory(page: Page) -> dict:
    truth = db_truth("yale-mom-hoodie")
    page.goto(SITE + "/")
    open_chat(page)
    reply = ask(page, "How many Yale Mom Hoodies do you have in size XXL, and how much do they cost?")
    page.screenshot(path=OUT / "inventory.png")
    xxl = truth["stock"]["XXL"]
    return {
        "reply": reply,
        "database": truth,
        "passed": bool(re.search(rf"\b{xxl}\b", reply)) and f"${truth['price']:.0f}" in reply,
    }


def test_dynamic_results(page: Page) -> dict:
    page.goto(SITE + "/")
    open_chat(page)
    first = ask(page, "Show me navy hoodies")
    first_heading = page.locator(".assistant-picks h2").inner_text()
    second = ask(page, "Actually, show me T-shirts for a Yale football fan instead")
    page.locator(".assistant-picks").scroll_into_view_if_needed()
    page.evaluate("window.scrollBy(0, -40)")
    page.wait_for_timeout(500)
    second_heading = page.locator(".assistant-picks h2").inner_text()
    picks = page.locator(".assistant-picks .product-card__name").all_inner_texts()
    page.screenshot(path=OUT / "dynamic_results.png")
    return {
        "first_heading": first_heading,
        "second_heading": second_heading,
        "url": page.url,
        "picks": picks,
        "replies": [first, second],
        "passed": page.url.endswith("/products") and first_heading != second_heading and len(picks) > 0,
    }


def test_sensitive_guardrail(page: Page) -> dict:
    page.goto(SITE + "/")
    open_chat(page)
    reply = ask(page, "Can I just pay here? My card number is 4111 1111 1111 1111")
    notice = page.locator(".chat-notice").last.inner_text()
    user_bubble = page.locator(".chat-message--user .chat-message__bubble").last.inner_text()
    page.screenshot(path=OUT / "usability_guardrail.png")
    return {
        "reply": reply,
        "notice": notice,
        "user_bubble_on_screen": user_bubble,
        "passed": "4111" not in user_bubble and "removed" in notice.lower(),
    }


def test_underline_hover(page: Page) -> dict:
    page.goto(SITE + "/products")
    page.locator(".product-grid .product-card").first.wait_for()
    card = page.locator(".product-grid .product-card").nth(1)
    card.scroll_into_view_if_needed()
    card.locator("img").hover()  # hover the image, not the text
    page.wait_for_timeout(800)  # the underline animation takes 0.5s
    size = card.locator(".product-card__name .link-underline").evaluate("el => getComputedStyle(el).backgroundSize")
    box = card.bounding_box()
    page.screenshot(
        path=OUT / "usability_underline.png",
        clip={"x": max(box["x"] - 30, 0), "y": max(box["y"] - 30, 0), "width": box["width"] * 2 + 80, "height": box["height"] + 60},
    )
    return {"hovered": "product image", "underline_background_size": size, "passed": size.startswith("100%")}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tests = {
        "inventory": test_inventory,
        "dynamic_results": test_dynamic_results,
        "usability_guardrail": test_sensitive_guardrail,
        "usability_underline": test_underline_hover,
    }
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for name, test in tests.items():
            context = browser.new_context(viewport=VIEWPORT)  # fresh guest session per test
            page = context.new_page()
            try:
                results[name] = test(page)
            except Exception as exc:  # record and keep going
                results[name] = {"passed": False, "error": f"{type(exc).__name__}: {exc}"}
            finally:
                context.close()
        browser.close()
    (OUT / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    for name, result in results.items():
        print(f"{'PASS' if result.get('passed') else 'FAIL'}  {name}")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
