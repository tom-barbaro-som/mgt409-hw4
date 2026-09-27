import type { ChatNotice, ChatRole, ChatTurn, PageContext, PageResults, ProductCard } from '../types.ts'
import { fetchJson, postJson } from './client.ts'

export interface ChatRequest {
  message: string
  /** Used for guests only; signed-in shoppers' history comes from the database. */
  history: ChatTurn[]
  page: PageContext
}

export interface ChatResponse {
  /** Assistant text for the chat bubble. */
  reply: string
  /** Up to 3 cards shown inside the chat panel. */
  products: ProductCard[]
  /** Full ranked matches for the Products page, or null when the message wasn't a merchandise search. */
  page_results: PageResults | null
  /** Guardrail flag: the reply recaps an earlier answer, or sensitive data was blocked. */
  notice: ChatNotice | null
  /** The shopper's message with card numbers / passwords removed, to show instead of what they typed. */
  redacted_message: string | null
}

export interface StoredChatMessage {
  id: number
  role: ChatRole
  content: string
  products: ProductCard[]
  created_at: string
}

interface ChatHistoryResponse {
  signed_in: boolean
  messages: StoredChatMessage[]
}

/** Sends a message (plus page context) to the Campus Customs assistant via POST /api/chat. */
export function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  return postJson<ChatResponse>('/api/chat', request)
}

/** The signed-in shopper's saved chat, oldest first (empty for guests). */
export async function fetchChatHistory(): Promise<StoredChatMessage[]> {
  return (await fetchJson<ChatHistoryResponse>('/api/chat/history')).messages
}

export function clearChatHistory(): Promise<void> {
  return fetchJson<void>('/api/chat/history', { method: 'DELETE' })
}
