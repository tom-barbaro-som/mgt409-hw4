const priceFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatPrice(price: number): string {
  return priceFormatter.format(price)
}

/** Uppercases the first letter only, so values like "short-sleeve T-shirt" keep their casing. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const LOW_STOCK_THRESHOLD = 5

export type StockLevel = 'in-stock' | 'low-stock' | 'sold-out'

export function stockLevel(quantity: number): StockLevel {
  if (quantity <= 0) return 'sold-out'
  return quantity <= LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock'
}

export function stockLabel(quantity: number): string {
  if (quantity <= 0) return 'Sold out'
  return quantity <= LOW_STOCK_THRESHOLD ? `Only ${quantity} left` : `${quantity} in stock`
}
