import { Link } from 'react-router-dom'
import { ArrowRightIcon, HeartIcon, MailIcon, MapPinIcon, ShieldCheckIcon } from '../components/Icons.tsx'
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.tsx'
import StatusMessage from '../components/StatusMessage.tsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import { useProducts } from '../hooks/useProducts.ts'
import { STORE } from '../storeInfo.ts'
import type { Category, Product } from '../types.ts'
import './pages.css'

// Hand-picked for the hero collage and featured row.
const HERO_PRODUCT_IDS = [
  'champion-reverse-weave-hoodie-1',
  'district-vit-crewneck-vintage-bulldog',
  '2025-yale-vs-harvard-t-shirt',
  'super-heavyweight-crewneck-arched-yale-crest',
]

const FEATURED_PRODUCT_IDS = [
  'district-vit-hoodie-vintage-sailor-bulldog',
  'hype-and-vice-yale-university-premium-crewneck',
  'champion-full-zip-hood',
  'yale-bowl-t-shirt',
]

const VALUE_PROPS = [
  {
    Icon: ShieldCheckIcon,
    title: 'Officially licensed',
    text: "Officially licensed Yale merchandise is our specialty, so the Bulldog pride you wear is the real deal.",
  },
  {
    Icon: MapPinIcon,
    title: 'Right here in New Haven',
    text: `You'll find our shop at ${STORE.street}. Stop by and see the collection up close.`,
  },
  {
    Icon: HeartIcon,
    title: 'For the whole Yale family',
    text: "Students, alumni, moms, dads, and grandparents: there's something here for every Bulldog fan.",
  },
]

const COMMUNITIES = [
  'Residential colleges',
  'Yale athletics',
  'Graduate & professional schools',
  'Moms, dads, grandparents & more',
]

const CATEGORY_TILES: { category: Category; label: string; blurb: string }[] = [
  { category: 'hoodie', label: 'Hoodies', blurb: 'Pullovers and full-zips' },
  { category: 'crewneck', label: 'Crewnecks', blurb: 'Classic crews for every college' },
  { category: 't-shirt', label: 'T-Shirts', blurb: 'Game-day and everyday tees' },
  { category: 'quarter-zip', label: 'Quarter-Zips', blurb: 'Grad and professional school picks' },
  { category: 'jacket', label: 'Jackets', blurb: 'Fleece and bomber layers' },
]

function pickProducts(products: Product[], ids: string[]): Product[] {
  const byId = new Map(products.map((product) => [product.product_id, product]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

export default function HomePage() {
  useDocumentTitle()
  const products = useProducts()
  const heroProducts = products.status === 'success' ? pickProducts(products.data, HERO_PRODUCT_IDS) : []
  const featuredProducts = products.status === 'success' ? pickProducts(products.data, FEATURED_PRODUCT_IDS) : []
  const categoryCounts = new Map<Category, number>()
  if (products.status === 'success') {
    for (const product of products.data) categoryCounts.set(product.category, (categoryCounts.get(product.category) ?? 0) + 1)
  }

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div>
            <p className="eyebrow hero__eyebrow">{STORE.brand}</p>
            <h1>Bulldog pride you can wear every day.</h1>
            <p className="hero__lead">
              Cozy hoodies, classic crewnecks, and game-day tees. It's officially licensed Yale gear for students,
              alumni, and fans of every age.
            </p>
            <div className="hero__actions">
              <Link to="/products" className="button button--light">
                Shop all products
              </Link>
              <Link to="/about" className="button button--ghost-light">
                Our story
              </Link>
            </div>
          </div>

          <div className="hero__collage">
            {products.status === 'loading' &&
              HERO_PRODUCT_IDS.map((id) => <div key={id} className="hero__tile hero__tile--placeholder" />)}
            {heroProducts.map((product) => (
              <Link key={product.product_id} to={`/products/${product.product_id}`} className="hero__tile">
                <img src={product.image_url} alt={product.name} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="section-heading">
            <h2>Shop by category</h2>
            <Link to="/products" className="button button--outline">
              Shop all
            </Link>
          </div>
          <ul className="category-tiles">
            {CATEGORY_TILES.map(({ category, label, blurb }) => (
              <li key={category}>
                <Link to={`/products?category=${category}`} className="category-tile">
                  <span className="category-tile__label">{label}</span>
                  <span className="category-tile__blurb">{blurb}</span>
                  <span className="category-tile__count">
                    {products.status === 'success' ? `${categoryCounts.get(category) ?? 0} styles` : '\u00a0'}
                  </span>
                  <span className="category-tile__cta">
                    Shop now <ArrowRightIcon aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--flush-top">
        <div className="container value-props">
          {VALUE_PROPS.map(({ Icon, title, text }) => (
            <div key={title} className="value-prop">
              <span className="value-prop__icon">
                <Icon />
              </span>
              <div>
                <h2 className="value-prop__title">{title}</h2>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section section--flush-top">
        <div className="container">
          <div className="section-heading">
            <div>
              <h2>True Bulldog Blue 💙</h2>
              <p className="section-heading__sub">Easy layers and everyday Bulldog pride.</p>
            </div>
            <Link to="/products" className="button button--primary">
              Shop all
            </Link>
          </div>

          {products.status === 'loading' && <ProductGridSkeleton count={4} />}
          {products.status === 'error' && (
            <StatusMessage tone="error" detail={products.error.message}>
              We couldn't load our products right now. Please try again in a moment.
            </StatusMessage>
          )}
          {products.status === 'success' && <ProductGrid products={featuredProducts} />}
        </div>
      </section>

      <section className="section section--cream">
        <div className="container community">
          <div>
            <p className="eyebrow">Rep your corner of Yale</p>
            <h2>Something for every Bulldog</h2>
            <p className="lead">
              Show off your residential college, cheer on your favorite team, celebrate your graduate or professional
              school, or get the proud family back home suited up for game day.
            </p>
            <Link to="/products" className="button button--primary">
              Browse the collection
            </Link>
          </div>
          <ul className="community__list">
            {COMMUNITIES.map((community) => (
              <li key={community}>{community}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container visit">
          <div>
            <p className="eyebrow">Visit us</p>
            <h2>Come say hi on Broadway</h2>
            <p className="lead">
              Want to see the gear in person? Swing by our New Haven shop and browse the lineup for yourself.
            </p>
          </div>

          <div className="visit__card">
            <div className="visit__item">
              <MapPinIcon />
              <div>
                <h3>Our shop</h3>
                <address>
                  {STORE.street}
                  <br />
                  {STORE.cityStateZip}
                </address>
                <a href={STORE.directionsUrl} target="_blank" rel="noreferrer" className="text-link">
                  <span className="link-underline">Get directions</span> <ArrowRightIcon />
                </a>
              </div>
            </div>
            <div className="visit__item">
              <MailIcon />
              <div>
                <h3>Questions about an order?</h3>
                <p>
                  Email us at <a href={`mailto:${STORE.orderEmail}`}>{STORE.orderEmail}</a>, or open the chat in the
                  bottom corner of any page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
