import { Link } from 'react-router-dom'
import { STORE } from '../storeInfo.ts'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__about">
          <p className="site-footer__brand">Campus Customs</p>
          <p className="muted">
            Officially licensed Yale gear for students, alumni, and every proud Bulldog fan, from our shop on
            Broadway.
          </p>
        </div>

        <div>
          <h2>Shop</h2>
          <ul>
            <li>
              <Link to="/products" className="link-underline">All products</Link>
            </li>
          </ul>
        </div>

        <div>
          <h2>Company</h2>
          <ul>
            <li>
              <Link to="/about" className="link-underline">About us</Link>
            </li>
            <li>
              <Link to="/login" className="link-underline">Log in</Link>
            </li>
            <li>
              <Link to="/create-account" className="link-underline">Create account</Link>
            </li>
          </ul>
        </div>

        <div>
          <h2>Visit us</h2>
          <address>
            {STORE.street}
            <br />
            {STORE.cityStateZip}
          </address>
          <a href={`mailto:${STORE.orderEmail}`} className="link-underline">
            {STORE.orderEmail}
          </a>
        </div>
      </div>

      <div className="container site-footer__legal">
        © {new Date().getFullYear()} {STORE.brand}
      </div>
    </footer>
  )
}
