import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { clearChatHistory, fetchChatHistory, sendChatMessage } from '../api/chat.ts'
import { ASK_ASSISTANT_EVENT } from '../assistant/askAssistant.ts'
import { ApiError } from '../api/client.ts'
import { formatPrice } from '../format.ts'
import { useAssistantResults } from '../hooks/useAssistantResults.ts'
import { useAuth } from '../hooks/useAuth.ts'
import type { ChatMessage, ChatNotice, PageContext, PageType, ProductCard } from '../types.ts'
import { ChatIcon, ChevronDownIcon, CloseIcon, SendIcon, TrashIcon } from './Icons.tsx'
import './ChatWidget.css'

// Matches the backend's cap of 20 turns (user + assistant pairs).
const MAX_HISTORY_MESSAGES = 40

// Pages the chat may leave automatically to show new search results. Product pages
// and the account forms are left alone so the shopper doesn't lose their place or input.
const AUTO_NAVIGATE_FROM = new Set(['/', '/about', '/products'])

function ChatProductCard({ product }: { product: ProductCard }) {
  const soldOutEverywhere = product.sizes_in_stock.length === 0
  return (
    <Link to={`/products/${product.product_id}`} className="chat-product">
      <img src={product.image_url} alt="" className="chat-product__image" />
      <span className="chat-product__text">
        <span className="chat-product__name">
          <span className="link-underline">{product.name}</span>
        </span>
        <span className="chat-product__price">{formatPrice(product.price)}</span>
        {soldOutEverywhere ? (
          <span className="chat-product__sold-out">Sold out in every size</span>
        ) : (
          <>
            <span className="chat-product__stock">In stock: {product.sizes_in_stock.join(', ')}</span>
            {product.sold_out_sizes.length > 0 && (
              <span className="chat-product__sold-out">Sold out: {product.sold_out_sizes.join(', ')}</span>
            )}
          </>
        )}
      </span>
    </Link>
  )
}

const NOTICE_TEXT: Record<ChatNotice, { icon: string; label: string }> = {
  repeat_answer: { icon: '↺', label: 'Recap of an earlier answer · stock re-checked' },
  sensitive_data_removed: { icon: '🔒', label: 'Sensitive info removed · not sent to the assistant or saved' },
  crisis_support: { icon: '💙', label: 'Support resources · you are not alone' },
}

function ChatNoticeTag({ notice }: { notice: ChatNotice }) {
  const { icon, label } = NOTICE_TEXT[notice]
  return (
    <p className={`chat-notice chat-notice--${notice}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </p>
  )
}

const GREETING_ID = 'greeting'

function greeting(firstName?: string): ChatMessage {
  return {
    id: GREETING_ID,
    role: 'assistant',
    content: firstName
      ? `Welcome back, ${firstName}! 👋 Your chats are saved to your account, so we can pick up where we left off.`
      : "Hi there! 👋 I'm the Campus Customs assistant. Ask me about our Yale gear, sizes, or what's in stock.",
  }
}

const PAGE_TYPES: Record<string, PageType> = {
  '/': 'home',
  '/products': 'products',
  '/about': 'about',
  '/login': 'login',
  '/create-account': 'create-account',
}

/** Describe the current screen for the agent: page type, open product, and assistant matches shown. */
function pageContext(pathname: string, visibleProductIds: string[]): PageContext {
  const productMatch = pathname.match(/^\/products\/([^/]+)$/)
  if (productMatch) {
    return { path: pathname, page_type: 'product', product_id: decodeURIComponent(productMatch[1]), visible_product_ids: [] }
  }
  const pageType = PAGE_TYPES[pathname] ?? 'other'
  return {
    path: pathname,
    page_type: pageType,
    product_id: null,
    visible_product_ids: pageType === 'products' ? visibleProductIds.slice(0, 12) : [],
  }
}

const SUGGESTED_PROMPTS = [
  'What hoodies do you have?',
  'Which crewnecks come in size XL?',
  'Gift ideas for a Yale grandparent',
]

let messageCounter = 0
const nextMessageId = () => `message-${++messageCounter}`

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [greeting()])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const { results, showResults } = useAssistantResults()
  const { user, ready: authReady } = useAuth()
  const userId = user?.id ?? null
  const firstName = user?.first_name
  const location = useLocation()
  const navigate = useNavigate()
  const onProductsPage = location.pathname === '/products'

  const panelId = useId()
  const titleId = useId()
  const inputId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, isSending, isOpen])

  // Signed in: load the shopper's saved chat. Logged out (or a different user): start fresh,
  // so one person's conversation is never shown to the next person on the same browser.
  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    if (userId === null) {
      setMessages([greeting()])
      return
    }
    setMessages([greeting(firstName)])
    fetchChatHistory()
      .then((saved) => {
        if (cancelled) return
        const restored: ChatMessage[] = saved.map((m) => ({
          id: `saved-${m.id}`,
          role: m.role,
          content: m.content,
          products: m.products,
          fromHistory: true,
        }))
        setMessages([...restored, greeting(firstName)])
      })
      .catch(() => {
        // Keep the greeting; the shopper can still chat.
      })
    return () => {
      cancelled = true
    }
  }, [authReady, userId, firstName])

  async function clearConversation() {
    if (userId !== null) {
      try {
        await clearChatHistory()
      } catch {
        return
      }
    }
    setMessages([greeting(firstName)])
  }

  const closePanel = () => {
    setIsOpen(false)
    launcherRef.current?.focus()
  }

  // Small "Questions? Ask me" bubble next to the launcher, like the store chat on the
  // reference site. Hidden once the shopper opens or dismisses the chat.
  const [showTeaser, setShowTeaser] = useState(true)
  const openPanel = () => {
    setIsOpen(true)
    setShowTeaser(false)
  }

  // Other pages (e.g. a product page's "Ask about this item" button) can open the chat
  // with a question via askAssistant(). The ref always points at the latest send().
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {})
  useEffect(() => {
    sendRef.current = send
  })
  useEffect(() => {
    const handleAsk = (event: Event) => {
      setIsOpen(true)
      setShowTeaser(false)
      void sendRef.current((event as CustomEvent<string>).detail)
    }
    window.addEventListener(ASK_ASSISTANT_EVENT, handleAsk)
    return () => window.removeEventListener(ASK_ASSISTANT_EVENT, handleAsk)
  }, [])

  async function send(text: string) {
    const content = text.trim()
    if (!content || isSending) return

    // The greeting and error notices are UI-only, so they aren't sent as history.
    // (Signed-in shoppers' history is read from the database by the backend instead.)
    const history = messages
      .filter((message) => message.id !== GREETING_ID && !message.isError)
      .slice(-MAX_HISTORY_MESSAGES)
      .map(({ role, content, products, pageResults }) => ({
        role,
        content,
        product_ids: (pageResults?.products ?? products ?? []).map((p) => p.product_id).slice(0, 12),
      }))
    const page = pageContext(location.pathname, results?.products.map((p) => p.product_id) ?? [])
    const userMessageId = nextMessageId()
    setMessages((current) => [...current, { id: userMessageId, role: 'user', content }])
    setDraft('')
    setIsSending(true)

    try {
      const response = await sendChatMessage({ message: content, history, page })
      const { reply, products, page_results: pageResults, notice, redacted_message: redacted } = response
      setMessages((current) => [
        // Guardrail: never keep a card number or password on screen (or in history sent later).
        ...current.map((m) => (redacted && m.id === userMessageId ? { ...m, content: redacted } : m)),
        {
          id: nextMessageId(),
          role: 'assistant',
          content: reply,
          products,
          pageResults: pageResults ?? undefined,
          notice: notice ?? undefined,
        },
      ])
      if (pageResults) {
        showResults(pageResults)
        if (AUTO_NAVIGATE_FROM.has(location.pathname) && location.pathname !== '/products') navigate('/products')
      }
    } catch (error) {
      // The backend's 422/429/502/503 errors carry shopper-friendly messages. A bare 500
      // (e.g. the Vite proxy when the backend is down) or a network failure doesn't.
      const text =
        error instanceof ApiError && error.status !== 500 && error.status !== 404
          ? error.message
          : 'Sorry, something went wrong on our end. Please try again.'
      setMessages((current) => [...current, { id: nextMessageId(), role: 'assistant', content: text, isError: true }])
    } finally {
      setIsSending(false)
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a new line. Skip while an IME is composing text.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(draft)
    }
  }

  return (
    <div className="chat-widget">
      <section
        id={panelId}
        className="chat-panel"
        role="dialog"
        aria-labelledby={titleId}
        hidden={!isOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePanel()
        }}
      >
        <header className="chat-panel__header">
          <span className="chat-panel__avatar" aria-hidden="true">
            CC
            <span className="chat-panel__online" />
          </span>
          <div className="chat-panel__heading">
            <h2 id={titleId} className="chat-panel__title">
              Campus Customs
            </h2>
            <p className="chat-panel__subtitle">
              Online · {user ? 'chat saved to your account' : 'guest chat'}
            </p>
          </div>
          {messages.some((m) => m.id !== GREETING_ID) && (
            <button
              type="button"
              className="chat-panel__minimize chat-panel__clear"
              onClick={() => void clearConversation()}
              aria-label={user ? 'Delete your saved chat history' : 'Clear this conversation'}
              title={user ? 'Delete your saved chat history' : 'Clear this conversation'}
            >
              <TrashIcon width={18} height={18} />
            </button>
          )}
          <button type="button" className="chat-panel__minimize" onClick={closePanel} aria-label="Minimize chat">
            <ChevronDownIcon />
          </button>
        </header>

        <div ref={messageListRef} className="chat-panel__messages" role="log" aria-live="polite">
          {messages.map((message, index) => (
            <div key={message.id} className={`chat-message chat-message--${message.role}`}>
              {message.fromHistory && !messages[index - 1]?.fromHistory && (
                <p className="chat-panel__divider">Earlier conversations</p>
              )}
              <p className={`chat-message__bubble${message.isError ? ' chat-message__bubble--error' : ''}`}>
                {message.content}
              </p>
              {message.notice && <ChatNoticeTag notice={message.notice} />}
              {message.products && message.products.length > 0 && (
                <div className="chat-message__products">
                  {message.products.map((product) => (
                    <ChatProductCard key={product.product_id} product={product} />
                  ))}
                </div>
              )}
              {message.pageResults && (
                <p className="chat-message__page-note">
                  {onProductsPage ? (
                    <>Showing {message.pageResults.products.length} matches on the page.</>
                  ) : (
                    <Link to="/products" className="chat-message__page-link">
                      See all {message.pageResults.products.length} matches on the page →
                    </Link>
                  )}
                </p>
              )}
            </div>
          ))}
          {isSending && (
            <div className="chat-message chat-message--assistant">
              <p className="chat-message__bubble chat-message__typing">
                <span />
                <span />
                <span />
                <span className="visually-hidden">The assistant is typing</span>
              </p>
            </div>
          )}
        </div>

        {!messages.some((m) => m.role === 'user') && (
          <div className="chat-panel__suggestions">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" className="chat-suggestion" onClick={() => void send(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-panel__composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send(draft)
          }}
        >
          <label htmlFor={inputId} className="visually-hidden">
            Message the Campus Customs assistant
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            className="chat-panel__input"
            rows={1}
            value={draft}
            placeholder="Ask about our Yale gear…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
          <button type="submit" className="chat-panel__send" disabled={!draft.trim() || isSending} aria-label="Send message">
            <SendIcon />
          </button>
        </form>
      </section>

      {showTeaser && !isOpen && (
        <div className="chat-teaser">
          <button type="button" className="chat-teaser__open" onClick={openPanel}>
            <strong>Questions about sizes or stock? 👋</strong>
            <span>Ask me. I'll find the right Yale gear in seconds.</span>
          </button>
          <button type="button" className="chat-teaser__close" aria-label="Dismiss" onClick={() => setShowTeaser(false)}>
            <CloseIcon />
          </button>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        className={`chat-launcher${isOpen ? ' is-open' : ''}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        onClick={() => (isOpen ? closePanel() : openPanel())}
      >
        {isOpen ? <CloseIcon /> : <ChatIcon />}
        {!isOpen && (
          <span className="chat-launcher__label" aria-hidden="true">
            Chat with us
          </span>
        )}
      </button>
    </div>
  )
}
