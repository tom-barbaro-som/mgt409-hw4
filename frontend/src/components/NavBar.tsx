import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.ts'
import { CloseIcon, MenuIcon, SearchIcon, UserIcon } from './Icons.tsx'

// Second header row, modeled on the reference store's category menu. Category links
// open the Products page pre-filtered (see catalogueFilters.ts).
const MENU_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'Shop All' },
  { to: '/products?category=hoodie', label: 'Hoodies' },
  { to: '/products?category=crewneck', label: 'Crewnecks' },
  { to: '/products?category=t-shirt', label: 'T-Shirts' },
  { to: '/products?category=quarter-zip', label: 'Quarter-Zips' },
  { to: '/products?category=jacket', label: 'Jackets' },
  { to: '/about', label: 'About Us' },
]

function isMenuLinkActive(to: string, pathname: string, search: string): boolean {
  const [path, query = ''] = to.split('?')
  if (path === '/') return pathname === '/'
  if (path === '/about') return pathname === '/about'
  const category = new URLSearchParams(search).get('category') ?? ''
  const linkCategory = new URLSearchParams(query).get('category') ?? ''
  if (pathname.startsWith('/products/')) return linkCategory === ''
  return pathname === '/products' && category === linkCategory
}

export default function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const closeMenu = () => setMenuOpen(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  return (
    <header className="site-header">
      <div className="navbar container">
        <Link to="/" className="brand" onClick={closeMenu}>
          <span className="brand__mark" aria-hidden="true">
            CC
          </span>
          <span className="brand__text">
            <span className="brand__name">Campus Customs</span>
            <span className="brand__tagline">Yale Bulldog Blue · New Haven</span>
          </span>
        </Link>

        <form
          className="header-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            const q = query.trim()
            navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products')
            closeMenu()
          }}
        >
          <label htmlFor="header-search-input" className="visually-hidden">
            Search products
          </label>
          <input
            id="header-search-input"
            type="search"
            placeholder="What are you looking for?"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="header-search__button" aria-label="Search">
            <SearchIcon />
          </button>
        </form>

        <button
          type="button"
          className="navbar__toggle"
          aria-expanded={menuOpen}
          aria-controls="account-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
          <span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        </button>

        <ul id="account-navigation" className={`navbar__links${menuOpen ? ' is-open' : ''}`}>
          {user ? (
            <>
              <li className="navbar__greeting">
                <UserIcon aria-hidden="true" /> Hi, {user.first_name}
              </li>
              <li>
                <button
                  type="button"
                  className="button button--outline navbar__cta"
                  onClick={() => {
                    closeMenu()
                    void logout().then(() => navigate('/'))
                  }}
                >
                  Log out
                </button>
              </li>
            </>
          ) : (
            <>
              <li>
                <NavLink to="/login" className="nav-link nav-link--account" onClick={closeMenu}>
                  <UserIcon aria-hidden="true" /> Log in
                </NavLink>
              </li>
              <li>
                <NavLink to="/create-account" className="button button--primary navbar__cta" onClick={closeMenu}>
                  Create account
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </div>

      <nav className="category-nav" aria-label="Main">
        <ul className="container category-nav__list">
          {MENU_LINKS.map(({ to, label }) => (
            <li key={to}>
              <Link
                to={to}
                className={`nav-link${isMenuLinkActive(to, pathname, search) ? ' active' : ''}`}
                aria-current={isMenuLinkActive(to, pathname, search) ? 'page' : undefined}
                onClick={closeMenu}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
