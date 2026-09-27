// Shapes returned by the FastAPI backend (see backend/main.py).

export interface InventoryItem {
  size: string
  quantity: number
}

export type Category = 'hoodie' | 'crewneck' | 'quarter-zip' | 't-shirt' | 'long-sleeve' | 'jacket' | 'other'

export interface Product {
  product_id: string
  name: string
  garment_type: string
  category: Category
  description: string
  colors: string[]
  search_tags: string[]
  image_file_path: string
  image_url: string
  price: number
  inventory: InventoryItem[]
  total_stock: number
}

export interface User {
  id: number
  first_name: string
  last_name: string
  email: string
}

export type ChatRole = 'user' | 'assistant'

export interface ChatTurn {
  role: ChatRole
  content: string
  /** Cards shown with an assistant turn, so the agent can resolve "the first one". */
  product_ids?: string[]
}

export type PageType = 'home' | 'products' | 'product' | 'about' | 'login' | 'create-account' | 'other'

/** What's on screen, sent with every chat message so the agent understands "this item". */
export interface PageContext {
  path: string
  page_type: PageType
  product_id: string | null
  visible_product_ids: string[]
}

/** A product card shown under an assistant chat reply (built by the backend from the database). */
export interface ProductCard {
  product_id: string
  name: string
  garment_type: string
  description: string
  price: number
  image_url: string
  sizes_in_stock: string[]
  sold_out_sizes: string[]
  total_stock: number
}

/** Ranked search matches the assistant sends for the Products page (see POST /api/chat). */
export interface PageResults {
  heading: string
  query: string
  products: ProductCard[]
}

export type ChatNotice = 'sensitive_data_removed' | 'repeat_answer' | 'crisis_support'

export interface ChatMessage extends ChatTurn {
  id: string
  products?: ProductCard[]
  /** Set when this reply also updated the page's results area. */
  pageResults?: PageResults
  /** Local error notices; they aren't sent back to the assistant as history. */
  isError?: boolean
  /** Loaded from the signed-in shopper's saved history. */
  fromHistory?: boolean
  /** Set by backend guardrails: a recap of an earlier answer, or a blocked sensitive message. */
  notice?: ChatNotice
}
