"""Pydantic types shared by the API routes, the agent, and its tools."""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

Size = Literal["XS", "S", "M", "L", "XL", "XXL"]
Category = Literal["hoodie", "crewneck", "quarter-zip", "t-shirt", "long-sleeve", "jacket", "other"]

# --- Catalogue --------------------------------------------------------------


class InventoryItem(BaseModel):
    size: str
    quantity: int


class Product(BaseModel):
    """A full catalogue row plus its per-size inventory (the /api/products shape)."""

    product_id: str
    name: str
    garment_type: str
    category: Category = Field(description="Normalized category (see catalogue.product_category)")
    description: str
    colors: list[str]
    search_tags: list[str]
    image_file_path: str
    image_url: str
    price: float
    inventory: list[InventoryItem]
    total_stock: int


class ProductSummary(BaseModel):
    """What the agent's search tool sees for each matching product."""

    product_id: str
    name: str
    category: Category
    garment_type: str
    price: float
    main_color: str | None = Field(
        description="The garment's main color (first entry of colors); null if the catalogue lists no colors"
    )
    colors: list[str] = Field(
        description="Every color that appears on this one item (garment, trim, and graphics). "
        "These are NOT separate color options; each product comes in a single colorway."
    )
    description: str
    sizes_in_stock: list[str]
    sold_out_sizes: list[str] = Field(description="Sizes with 0 units. Always mention these when relevant.")
    total_stock: int


# --- Agent tool results (product info and stock) -----------------------------

LOW_STOCK_THRESHOLD = 5  # Matches the website's "Only N left" label.

StockStatus = Literal["in_stock", "low_stock", "sold_out", "not_offered"]


class ProductDescription(BaseModel):
    """Result of get_product_description: what the item is and looks like."""

    product_id: str
    name: str
    category: Category
    garment_type: str
    description: str
    colors: list[str] = Field(
        description="Every color that appears on this one item (garment, trim, and graphics). "
        "These are NOT separate color options; each product comes in a single colorway."
    )


class ProductPrice(BaseModel):
    """Result of get_product_price."""

    product_id: str
    name: str
    price: float
    currency: Literal["USD"] = "USD"


class SizeStock(BaseModel):
    size: str
    quantity: int
    status: StockStatus = Field(
        description="in_stock: more than 5 units; low_stock: 1-5 units; sold_out: 0 units; "
        "not_offered: the size has no inventory record for this product."
    )


class StockReport(BaseModel):
    """Result of check_stock: live per-size inventory for one product."""

    product_id: str
    name: str
    sizes: list[SizeStock] = Field(description="Every size on record, in XS-XXL order")
    requested_size: SizeStock | None = Field(
        default=None, description="The size the shopper asked about, if one was given"
    )
    sizes_in_stock: list[str]
    low_stock_sizes: list[str]
    sold_out_sizes: list[str]
    total_stock: int
    fully_sold_out: bool = Field(description="True when every size is sold out")
    has_sold_out_sizes: bool = Field(description="True when at least one size is sold out")


class ProductDetails(BaseModel):
    """Result of get_product_details: description, price, and stock in one call."""

    product_id: str
    name: str
    category: Category
    garment_type: str
    description: str
    colors: list[str] = Field(
        description="Every color that appears on this one item (garment, trim, and graphics). "
        "These are NOT separate color options; each product comes in a single colorway."
    )
    price: float
    currency: Literal["USD"] = "USD"
    stock: StockReport


class SearchResults(BaseModel):
    total_matches: int = Field(description="How many products matched before the limit was applied")
    products: list[ProductSummary]


class ProductCard(BaseModel):
    """A product shown as a clickable card, in the chat panel or on the Products page.

    Built by the backend from the database, never from model-written text, so
    names, prices, descriptions, and stock are always accurate.
    """

    product_id: str
    name: str
    garment_type: str
    description: str
    price: float
    image_url: str
    sizes_in_stock: list[str]
    sold_out_sizes: list[str]
    total_stock: int


# --- Chat -------------------------------------------------------------------

MAX_MESSAGE_LENGTH = 1000
MAX_HISTORY_TURNS = 20


ProductIdList = Annotated[list[Annotated[str, StringConstraints(max_length=200)]], Field(max_length=12)]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=4000)]
    # Cards shown with an assistant turn, so the agent knows what "the first one" refers to.
    product_ids: ProductIdList = []


PageType = Literal["home", "products", "product", "about", "login", "create-account", "other"]


class PageContext(BaseModel):
    """What the shopper's browser is showing, sent with every chat message.

    Untrusted input: the backend only uses the IDs to look products up in the database,
    and never passes this text to the agent as-is.
    """

    path: Annotated[str, StringConstraints(max_length=200)] = "/"
    page_type: PageType = "other"
    product_id: Annotated[str, StringConstraints(max_length=200)] | None = Field(
        default=None, description="The product whose page is open (/products/{product_id})"
    )
    visible_product_ids: ProductIdList = Field(
        default=[], description="Assistant matches currently shown on the Products page, in order"
    )


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_MESSAGE_LENGTH)]
    # Used for guests only; signed-in shoppers' history is loaded from the database.
    history: Annotated[list[ChatTurn], Field(max_length=MAX_HISTORY_TURNS * 2)] = []
    page: PageContext | None = None


# --- Customer memory ------------------------------------------------------


class CustomerProfile(BaseModel):
    """The signed-in shopper, as the agent may see them. Built from the session, never from chat text.

    Deliberately excludes the password hash, session tokens, and other customers' data.
    """

    user_id: int
    first_name: str
    last_name: str
    email: str
    member_since: str = Field(description="Account creation date (YYYY-MM-DD)")
    saved_message_count: int = Field(description="How many chat messages are saved for this shopper")


class PageView(BaseModel):
    """The shopper's current page, checked against the database (built from PageContext)."""

    page_type: PageType
    path: str
    viewing_product: ProductSummary | None = Field(
        default=None, description="The product whose page is open. 'This item' / 'this one' refers to it."
    )
    visible_products: list[ProductSummary] = Field(
        default=[], description="Assistant matches shown on the Products page, in on-screen order"
    )


class StoredChatMessage(BaseModel):
    """One saved chat message, as returned to the website."""

    id: int
    role: Literal["user", "assistant"]
    content: str
    products: list[ProductCard] = []
    created_at: str


class ChatHistoryResponse(BaseModel):
    signed_in: bool
    messages: list[StoredChatMessage]


MAX_PRODUCT_MATCHES = 12  # Products shown on the page for one search.
MAX_CHAT_CARDS = 3  # Of those, how many also appear inside the chat panel.


class ChatReply(BaseModel):
    """The agent's structured output."""

    message: str = Field(description="The reply shown to the customer, in plain text (no Markdown).")
    product_ids: list[str] = Field(
        default_factory=list,
        description=(
            f"Up to {MAX_PRODUCT_MATCHES} product_id values, most relevant first. They're shown as product cards "
            "in the chat and, when update_page is true, on the website's Products page. Only use IDs returned "
            "by the tools in this conversation. Leave empty when no product fits."
        ),
    )
    update_page: bool = Field(
        default=False,
        description=(
            "True when the shopper is browsing or searching for a type of merchandise (e.g. 'navy hoodies', "
            "'gifts for grandpa', 'crewnecks under $60'), so the matches should replace the results on the page. "
            "False for questions about one specific item, general questions, or off-topic messages."
        ),
    )
    results_heading: str | None = Field(
        default=None,
        max_length=60,
        description=(
            "When update_page is true: a short title-case heading for the page results, 2-6 words, describing "
            "what was searched (e.g. 'Navy Hoodies Under $70', 'Gifts for a Yale Grandpa'). Otherwise null."
        ),
    )


class PageResults(BaseModel):
    """Product matches for the website to render as a results grid on the Products page."""

    heading: str = Field(description="Title for the results section, from the agent")
    query: str = Field(description="The shopper message that produced these results")
    products: list[ProductCard] = Field(description="Matches in relevance order, built from the database")


class ChatResponse(BaseModel):
    """What POST /api/chat returns to the website.

    - reply: assistant text for the chat bubble
    - products: up to MAX_CHAT_CARDS cards shown inside the chat panel
    - page_results: the full ranked matches for the Products page, or null when the
      message wasn't a merchandise search (the page then keeps what it was showing)
    """

    reply: str
    products: list[ProductCard]
    page_results: PageResults | None = None
    notice: Literal["sensitive_data_removed", "repeat_answer", "crisis_support"] | None = Field(
        default=None,
        description="sensitive_data_removed: the message was blocked by the sensitive-data guardrail. "
        "repeat_answer: the shopper repeated an earlier question and the reply recaps it. "
        "crisis_support: the message mentioned self-harm or an emergency and got support resources.",
    )
    redacted_message: str | None = Field(
        default=None, description="The shopper's message with sensitive data removed (replace it in the chat window)"
    )


class RepeatContext(BaseModel):
    """Set when the shopper repeats an earlier question (see agent.find_repeat)."""

    previous_question: str
    previous_answer: str
    messages_ago: int
    previous_product_ids: list[str] = []


# --- Accounts (request/response bodies for /api/auth/*) ------------------------

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128  # Caps hashing work per request.

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=EMAIL_PATTERN.pattern),
]
Password = Annotated[str, StringConstraints(max_length=PASSWORD_MAX_LENGTH)]


class RegisterRequest(BaseModel):
    first_name: Name
    last_name: Name
    email: Email
    password: Annotated[str, StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)]
    confirm_password: Password

    @model_validator(mode="after")
    def passwords_match(self) -> RegisterRequest:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(BaseModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)]
    password: Password


class User(BaseModel):
    """Public account details; never includes the password hash."""

    id: int
    first_name: str
    last_name: str
    email: str


class SessionResponse(BaseModel):
    user: User | None
