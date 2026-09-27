import type { Category, Product } from './types.ts'

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

export const CATEGORY_LABELS: Record<Exclude<Category, 'other'>, string> = {
  hoodie: 'Hoodies',
  crewneck: 'Crewnecks',
  't-shirt': 'T-Shirts',
  'quarter-zip': 'Quarter-Zips',
  jacket: 'Jackets',
  'long-sleeve': 'Long Sleeve',
}

export type SortOrder = 'name' | 'price-asc' | 'price-desc'

export interface CatalogueFilterState {
  query: string
  category: Category | null
  size: string | null
  sort: SortOrder
}

export const NO_FILTERS: CatalogueFilterState = { query: '', category: null, size: null, sort: 'name' }

export function hasActiveFilters(filters: CatalogueFilterState): boolean {
  return Boolean(filters.query.trim() || filters.category || filters.size || filters.sort !== 'name')
}

/** Apply the toolbar's search, category, in-stock size, and sort to the catalogue. */
export function filterCatalogue(products: Product[], filters: CatalogueFilterState): Product[] {
  const words = filters.query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = products.filter((product) => {
    if (filters.category && product.category !== filters.category) return false
    if (filters.size && !product.inventory.some((item) => item.size === filters.size && item.quantity > 0)) {
      return false
    }
    const text = `${product.name} ${product.description} ${product.colors.join(' ')}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
  const sorted = [...matches]
  if (filters.sort === 'price-asc') sorted.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
  if (filters.sort === 'price-desc') sorted.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name))
  return sorted
}
