import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '../components/Icons.tsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import { STORE } from '../storeInfo.ts'
import './pages.css'

export default function AboutPage() {
  useDocumentTitle('About Us')

  return (
    <>
      <section className="page-header">
        <div className="container">
          <p className="eyebrow">About us</p>
          <h1>More than 40 years of Bulldog pride</h1>
          <p className="lead">
            Campus Customs is the New Haven team behind Yale Bulldog Blue, and officially licensed Yale merchandise is
            what we do best.
          </p>
        </div>
      </section>

      <div className="container section about">
        <div className="about__story">
          <section>
            <h2>Where it all started</h2>
            <p>
              Our story is stitched into a single sweater. More than four decades ago, we created the original replica
              of Yale's classic "Y" sweater, and it has been a cornerstone of our collection ever since. It's still
              one of our staples: 100% cotton, made in the USA, and finished with a sewn-on felt Y.
            </p>
          </section>

          <section>
            <h2>Much more than sweatshirts</h2>
            <p>Today our collection covers just about every way to show your Yale spirit:</p>
            <ul className="about__list">
              <li>
                <strong>Apparel</strong> for men, women, youth, and infants and toddlers
              </li>
              <li>
                <strong>Accessories</strong> like hats, neckwear, jewelry, bags, and even gear for pets
              </li>
              <li>
                <strong>Souvenirs</strong> such as decals, magnets, and keychains
              </li>
              <li>
                <strong>Home goods</strong> including décor, pennants and banners, drinkware, and books
              </li>
              <li>
                <strong>Desk essentials</strong> like stationery and writing utensils
              </li>
            </ul>
            <p>
              This website starts with our apparel: hoodies, crewnecks, T-shirts, quarter-zips, and jackets, including
              pieces from Champion, Brooks Brothers, and Hype and Vice.
            </p>
          </section>

          <section>
            <h2>Something for every Bulldog</h2>
            <p>
              Whether you're repping one of Yale's 14 residential colleges, cheering on a team from crew to squash, or
              celebrating a degree from one of the graduate and professional schools, we've got you covered. The whole
              family can join in too, with gear for moms, dads, grandparents, siblings, aunts, uncles, and cousins.
            </p>
          </section>
        </div>

        <aside className="about__aside">
          <div className="info-card">
            <h2>Visit our shop</h2>
            <address>
              {STORE.street}
              <br />
              {STORE.cityStateZip}
            </address>
            <a href={STORE.directionsUrl} target="_blank" rel="noreferrer" className="text-link">
              <span className="link-underline">Get directions</span> <ArrowRightIcon />
            </a>
          </div>
          <div className="info-card">
            <h2>Need help with an order?</h2>
            <p>
              Email us at <a href={`mailto:${STORE.orderEmail}`}>{STORE.orderEmail}</a>, or start a conversation with
              our assistant using the chat button in the corner.
            </p>
          </div>
          <Link to="/products" className="button button--primary button--block">
            Shop the collection
          </Link>
        </aside>
      </div>
    </>
  )
}
