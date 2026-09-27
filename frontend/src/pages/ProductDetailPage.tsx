import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { askAssistant } from '../assistant/askAssistant.ts'
import { ChatIcon, MapPinIcon, ShieldCheckIcon } from '../components/Icons.tsx'
import { STORE } from '../storeInfo.ts'
import { ApiError } from '../api/client.ts'
import StatusMessage from '../components/StatusMessage.tsx'
import { capitalize, formatPrice, stockLabel, stockLevel } from '../format.ts'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import { useProduct } from '../hooks/useProducts.ts'
import type { Product } from '../types.ts'
import '../components/products.css'

export default function ProductDetailPage() {
  const { productId = '' } = useParams()
  const request = useProduct(productId)
  const product = request.status === 'success' ? request.data : null
  const notFound = request.status === 'error' && request.error instanceof ApiError && request.error.status === 404

  useDocumentTitle(product?.name ?? (notFound ? 'Product not found' : 'Product'))

  return (
    <div className="container product-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/" className="link-underline">
              Home
            </Link>
          </li>
          <li>
            <Link to="/products" className="link-underline">
              Products
            </Link>
          </li>
          {product && <li aria-current="page">{product.name}</li>}
        </ol>
      </nav>

      {request.status === 'loading' && <ProductDetailSkeleton />}

      {notFound && (
        <div className="product-not-found">
          <h1>We couldn't find that product</h1>
          <p className="lead">The link may be mistyped, or the item may no longer be in our catalogue.</p>
          <Link to="/products" className="button button--primary">
            Browse all products
          </Link>
        </div>
      )}

      {request.status === 'error' && !notFound && (
        <StatusMessage tone="error" detail={request.error.message}>
          We couldn't load this product right now. Please try again in a moment.
        </StatusMessage>
      )}

      {product && <ProductDetail product={product} />}
    </div>
  )
}

function ProductDetail({ product }: { product: Product }) {
  const sizesInStock = product.inventory.filter((item) => item.quantity > 0)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const selected = product.inventory.find((item) => item.size === selectedSize) ?? null

  return (
    <article className="product-detail">
      <div className="product-detail__media">
        <img src={product.image_url} alt={product.name} />
      </div>

      <div className="product-detail__info">
        <p className="eyebrow">{capitalize(product.garment_type)}</p>
        <h1 className="product-detail__name">{product.name}</h1>
        <p className="product-detail__price">{formatPrice(product.price)}</p>

        {product.inventory.length > 0 &&
          (sizesInStock.length > 0 ? (
            <p className="availability availability--in-stock">
              In stock in {sizesInStock.length} of {product.inventory.length} sizes
            </p>
          ) : (
            <p className="availability availability--sold-out">Sold out in every size</p>
          ))}

        {/* Size first: it's the decision shoppers need to make, as on the reference store's product pages. */}
        <section className="product-detail__section product-detail__section--sizes">
          <h2 id="size-heading">
            Size{selected ? `: ${selected.size}` : ''}
          </h2>
          {product.inventory.length > 0 ? (
            <>
              <div className="size-grid" role="radiogroup" aria-labelledby="size-heading">
                {product.inventory.map((item) => (
                  <button
                    key={item.size}
                    type="button"
                    role="radio"
                    aria-checked={item.size === selectedSize}
                    className={`size-tile size-tile--${stockLevel(item.quantity)}${item.size === selectedSize ? ' is-selected' : ''}`}
                    onClick={() => setSelectedSize(item.size)}
                  >
                    <span className="size-tile__size">{item.size}</span>
                    <span className="size-tile__stock">{stockLabel(item.quantity)}</span>
                  </button>
                ))}
              </div>
              <p className="product-detail__stock-total" aria-live="polite">
                {selected
                  ? selected.quantity > 0
                    ? `${selected.size}: ${selected.quantity} in stock.`
                    : `${selected.size} is sold out right now.`
                  : `Select a size to check availability. ${product.total_stock} in stock across all sizes.`}
              </p>
            </>
          ) : (
            <p className="muted">Size and stock details aren't available for this item yet.</p>
          )}
        </section>

        <div className="purchase-box">
          <button
            type="button"
            className="button button--primary button--block"
            onClick={() =>
              askAssistant(
                selected
                  ? `Is the ${product.name} available in size ${selected.size}?`
                  : `Can you tell me about the ${product.name}?`,
              )
            }
          >
            {selected ? `Ask about size ${selected.size}` : 'Ask our assistant about this item'}
          </button>
          <p className="purchase-box__store">
            Prefer to shop in person? Visit us at {STORE.street}, {STORE.cityStateZip}.
          </p>
          <ul className="trust-row">
            <li>
              <ShieldCheckIcon aria-hidden="true" /> Officially licensed
            </li>
            <li>
              <MapPinIcon aria-hidden="true" /> Shop at 57 Broadway
            </li>
            <li>
              <ChatIcon aria-hidden="true" /> Instant answers in chat
            </li>
          </ul>
        </div>

        <section className="product-detail__section">
          <h2>Description</h2>
          <p className="product-detail__description">{product.description}</p>
        </section>

        {product.colors.length > 0 && (
          <section className="product-detail__section">
            <h2>Colors</h2>
            <ul className="chip-list">
              {product.colors.map((color) => (
                <li key={color} className="chip">
                  {capitalize(color)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  )
}

function ProductDetailSkeleton() {
  return (
    <>
      <p className="visually-hidden" role="status">
        Loading product…
      </p>
      <div className="product-detail-skeleton" aria-hidden="true">
        <div className="skeleton product-detail-skeleton__media" />
        <div>
          <div className="skeleton product-detail-skeleton__line" style={{ width: '30%' }} />
          <div className="skeleton product-detail-skeleton__line" style={{ width: '75%', height: '2.25rem' }} />
          <div className="skeleton product-detail-skeleton__line" style={{ width: '20%', height: '1.6rem' }} />
          <div className="skeleton product-detail-skeleton__line" style={{ width: '100%', height: '5rem' }} />
          <div className="skeleton product-detail-skeleton__line" style={{ width: '100%', height: '8rem' }} />
        </div>
      </div>
    </>
  )
}
