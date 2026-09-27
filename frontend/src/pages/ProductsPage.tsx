import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { filterCatalogue, NO_FILTERS, SIZES } from '../catalogueFilters.ts'
import type { CatalogueFilterState, SortOrder } from '../catalogueFilters.ts'
import CatalogueFilters from '../components/CatalogueFilters.tsx'
import { ChatIcon, CloseIcon } from '../components/Icons.tsx'
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.tsx'
import StatusMessage from '../components/StatusMessage.tsx'
import { useAssistantResults } from '../hooks/useAssistantResults.ts'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import { useProducts } from '../hooks/useProducts.ts'
import type { AssistantResults } from '../assistant/AssistantResultsContext.ts'
import type { Category, Product } from '../types.ts'
import './pages.css'

export default function ProductsPage() {
  const { results, clearResults } = useAssistantResults()
  useDocumentTitle(results ? results.heading : 'Shop All Products')
  const products = useProducts()

  return (
    <>
      <section className="page-header">
        <div className="container">
          <p className="eyebrow">Shop</p>
          <h1>All products</h1>
          <p className="lead">
            Hoodies, crewnecks, tees, quarter-zips, and jackets for every kind of Bulldog. Select any item to see its
            sizes and stock, or ask the chat assistant to find something for you.
          </p>
        </div>
      </section>

      {results && <AssistantPicks results={results} onClear={clearResults} />}

      <div className="container section">
        {results && <h2 className="all-products__heading">All products</h2>}
        {products.status === 'loading' && <ProductGridSkeleton />}
        {products.status === 'error' && (
          <StatusMessage tone="error" detail={products.error.message}>
            We couldn't load our products right now. Please try again in a moment.
          </StatusMessage>
        )}
        {products.status === 'success' && <FilteredCatalogue products={products.data} />}
      </div>
    </>
  )
}

/** The chat assistant's latest matches; replaced every time the shopper searches for something new. */
function AssistantPicks({ results, onClear }: { results: AssistantResults; onClear: () => void }) {
  const sectionRef = useRef<HTMLElement>(null)

  // Bring fresh results into view when they arrive (e.g. the shopper had scrolled down).
  useEffect(() => {
    const section = sectionRef.current
    if (section && section.getBoundingClientRect().top < 0) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [results.version])

  const count = results.products.length

  return (
    <section ref={sectionRef} className="assistant-picks" aria-labelledby="assistant-picks-heading" aria-live="polite">
      {/* Keyed by version so each new search replays the entrance animation. */}
      <div key={results.version} className="container assistant-picks__inner">
        <div className="assistant-picks__header">
          <div>
            <p className="eyebrow assistant-picks__eyebrow">
              <ChatIcon aria-hidden="true" /> Picked by our assistant
            </p>
            <h2 id="assistant-picks-heading">{results.heading}</h2>
            <p className="assistant-picks__query">
              {count} {count === 1 ? 'match' : 'matches'} for “{results.query}”
            </p>
          </div>
          <button type="button" className="button button--outline assistant-picks__clear" onClick={onClear}>
            <CloseIcon aria-hidden="true" /> Clear results
          </button>
        </div>
        <ProductGrid products={results.products} />
      </div>
    </section>
  )
}

const CATEGORIES: Category[] = ['hoodie', 'crewneck', 't-shirt', 'quarter-zip', 'jacket', 'long-sleeve']
const SORTS: SortOrder[] = ['name', 'price-asc', 'price-desc']

/** Read filters from the URL (?q=&category=&size=&sort=), ignoring invalid values. */
function readFilters(params: URLSearchParams): CatalogueFilterState {
  const category = params.get('category') as Category | null
  const size = params.get('size')
  const sort = params.get('sort') as SortOrder | null
  return {
    query: params.get('q') ?? '',
    category: category && CATEGORIES.includes(category) ? category : null,
    size: size && (SIZES as readonly string[]).includes(size) ? size : null,
    sort: sort && SORTS.includes(sort) ? sort : NO_FILTERS.sort,
  }
}

function writeFilters(filters: CatalogueFilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.category) params.set('category', filters.category)
  if (filters.size) params.set('size', filters.size)
  if (filters.sort !== NO_FILTERS.sort) params.set('sort', filters.sort)
  return params
}

/** The full catalogue with the search / category / size / sort toolbar. Filters live in the URL. */
function FilteredCatalogue({ products }: { products: Product[] }) {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const shown = filterCatalogue(products, filters)

  return (
    <>
      <CatalogueFilters
        products={products}
        filters={filters}
        shownCount={shown.length}
        onChange={(next) => setParams(writeFilters(next), { replace: true })}
      />
      {shown.length > 0 ? (
        <ProductGrid products={shown} />
      ) : (
        <div className="catalogue-empty">
          <p>No products match those filters.</p>
          <button
            type="button"
            className="button button--outline"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Reset filters
          </button>
        </div>
      )}
    </>
  )
}
