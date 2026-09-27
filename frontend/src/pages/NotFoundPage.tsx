import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import './pages.css'

export default function NotFoundPage() {
  useDocumentTitle('Page Not Found')

  return (
    <section className="container not-found">
      <p className="eyebrow">404</p>
      <h1>This page wandered off campus</h1>
      <p className="lead">We couldn't find the page you were looking for.</p>
      <div className="not-found__actions">
        <Link to="/" className="button button--primary">
          Back to home
        </Link>
        <Link to="/products" className="button button--outline">
          Shop products
        </Link>
      </div>
    </section>
  )
}
