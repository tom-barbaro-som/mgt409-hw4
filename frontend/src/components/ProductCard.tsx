import { Link } from 'react-router-dom'
import { formatPrice } from '../format.ts'
import type { InventoryItem, ProductCard as ProductCardData } from '../types.ts'
import './products.css'

/**
 * Fields a card needs. Catalogue products (GET /api/products) include per-size inventory;
 * the assistant's cards (POST /api/chat) include sizes_in_stock / sold_out_sizes instead.
 */
export type CardProduct = Pick<ProductCardData, 'product_id' | 'name' | 'price' | 'description' | 'image_url' | 'total_stock'> &
  Partial<Pick<ProductCardData, 'sizes_in_stock' | 'sold_out_sizes'>> & { inventory?: InventoryItem[] }

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

/** Every size with whether it's in stock, from whichever fields this card has. */
function sizeAvailability(product: CardProduct): { size: string; inStock: boolean }[] {
  if (product.inventory) return product.inventory.map((item) => ({ size: item.size, inStock: item.quantity > 0 }))
  const inStock = new Set(product.sizes_in_stock ?? [])
  const known = new Set([...inStock, ...(product.sold_out_sizes ?? [])])
  return SIZE_ORDER.filter((size) => known.has(size)).map((size) => ({ size, inStock: inStock.has(size) }))
}

export function ProductCard({ product }: { product: CardProduct }) {
  const sizes = sizeAvailability(product)
  const soldOut = product.total_stock === 0
  const soldOutSizes = sizes.filter((s) => !s.inStock).length
  // Badge only real scarcity (half or more sizes gone); the size chips show every sold-out size.
  const fewSizesLeft = !soldOut && sizes.length > 0 && soldOutSizes * 2 >= sizes.length
  return (
    <Link to={`/products/${product.product_id}`} className="product-card">
      <div className="product-card__media">
        {/* The product name follows in the link text, so the image is decorative here. */}
        <img src={product.image_url} alt="" loading="lazy" />
        {soldOut && <span className="product-card__badge product-card__badge--sold-out">Sold out</span>}
        {fewSizesLeft && <span className="product-card__badge product-card__badge--limited">Few sizes left</span>}
        <span className="product-card__quick" aria-hidden="true">
          {soldOut ? 'View details' : 'Choose options'}
        </span>
      </div>
      <div className="product-card__body">
        <h3 className="product-card__name">
          <span className="link-underline">{product.name}</span>
        </h3>
        <p className="product-card__price">{formatPrice(product.price)}</p>
        <p className="product-card__description">{product.description}</p>
        {sizes.length > 0 && (
          <p className="product-card__sizes">
            <span className="visually-hidden">
              {soldOut
                ? 'Sold out in every size.'
                : `In stock: ${sizes.filter((s) => s.inStock).map((s) => s.size).join(', ')}.`}
              {soldOutSizes > 0 && ` Sold out: ${sizes.filter((s) => !s.inStock).map((s) => s.size).join(', ')}.`}
            </span>
            {sizes.map(({ size, inStock }) => (
              <span
                key={size}
                className={`product-card__size${inStock ? '' : ' product-card__size--out'}`}
                aria-hidden="true"
              >
                {size}
              </span>
            ))}
          </p>
        )}
      </div>
    </Link>
  )
}

export function ProductGrid({ products }: { products: CardProduct[] }) {
  return (
    <ul className="product-grid">
      {products.map((product) => (
        <li key={product.product_id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      <p className="visually-hidden" role="status">
        Loading products…
      </p>
      <ul className="product-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="product-card">
            <div className="skeleton product-card__skeleton-media" />
            <div className="skeleton product-card__skeleton-line" />
            <div className="skeleton product-card__skeleton-line product-card__skeleton-line--short" />
          </li>
        ))}
      </ul>
    </>
  )
}
