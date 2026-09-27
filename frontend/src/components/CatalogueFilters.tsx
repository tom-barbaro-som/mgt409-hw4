import { useId } from 'react'
import { CATEGORY_LABELS, hasActiveFilters, NO_FILTERS, SIZES } from '../catalogueFilters.ts'
import type { CatalogueFilterState, SortOrder } from '../catalogueFilters.ts'
import type { Category, Product } from '../types.ts'
import { CloseIcon } from './Icons.tsx'
import './products.css'

interface CatalogueFiltersProps {
  products: Product[]
  filters: CatalogueFilterState
  shownCount: number
  onChange: (next: CatalogueFilterState) => void
}

export default function CatalogueFilters({ products, filters, shownCount, onChange }: CatalogueFiltersProps) {
  const searchId = useId()
  const sizeId = useId()
  const sortId = useId()
  const update = (patch: Partial<CatalogueFilterState>) => onChange({ ...filters, ...patch })

  const counts = new Map<Category, number>()
  for (const product of products) counts.set(product.category, (counts.get(product.category) ?? 0) + 1)
  const categories = (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).filter((c) => counts.get(c))

  return (
    <div className="catalogue-filters" role="search" aria-label="Filter products">
      <div className="catalogue-filters__row">
        <div className="catalogue-filters__search">
          <label htmlFor={searchId} className="visually-hidden">
            Search products
          </label>
          <input
            id={searchId}
            type="search"
            placeholder="Search by name, sport, college, color…"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
        <div className="catalogue-filters__select">
          <label htmlFor={sizeId}>In stock in</label>
          <select id={sizeId} value={filters.size ?? ''} onChange={(event) => update({ size: event.target.value || null })}>
            <option value="">Any size</option>
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="catalogue-filters__select">
          <label htmlFor={sortId}>Sort</label>
          <select id={sortId} value={filters.sort} onChange={(event) => update({ sort: event.target.value as SortOrder })}>
            <option value="name">Name (A–Z)</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
      </div>

      <div className="catalogue-filters__chips" role="group" aria-label="Category">
        <button
          type="button"
          className="filter-chip"
          aria-pressed={filters.category === null}
          onClick={() => update({ category: null })}
        >
          All <span className="filter-chip__count">{products.length}</span>
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className="filter-chip"
            aria-pressed={filters.category === category}
            onClick={() => update({ category: filters.category === category ? null : category })}
          >
            {CATEGORY_LABELS[category]} <span className="filter-chip__count">{counts.get(category)}</span>
          </button>
        ))}
      </div>

      <div className="catalogue-filters__summary">
        <p className="results-count" aria-live="polite">
          Showing {shownCount} of {products.length} products
        </p>
        {hasActiveFilters(filters) && (
          <button type="button" className="catalogue-filters__reset" onClick={() => onChange(NO_FILTERS)}>
            <CloseIcon aria-hidden="true" /> Reset filters
          </button>
        )}
      </div>
    </div>
  )
}
