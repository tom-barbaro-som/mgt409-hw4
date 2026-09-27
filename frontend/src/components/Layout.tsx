import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { STORE } from '../storeInfo.ts'
import ChatWidget from './ChatWidget.tsx'
import Footer from './Footer.tsx'
import NavBar from './NavBar.tsx'
import './Layout.css'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function Layout() {
  return (
    <div className="site">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <ScrollToTop />
      <p className="announcement-bar">
        Officially licensed Yale gear · Visit our shop at {STORE.street}, New Haven
      </p>
      <NavBar />
      <main id="main-content" className="site-main">
        <Outlet />
      </main>
      <Footer />
      {/* Rendered outside <Outlet /> so the conversation survives page changes. */}
      <ChatWidget />
    </div>
  )
}
