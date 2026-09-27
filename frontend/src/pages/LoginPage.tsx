import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.ts'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import './pages.css'

export default function LoginPage() {
  useDocumentTitle('Log In')
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in (e.g. the back button after logging in): nothing to do here.
  if (user && !submitting) return <Navigate to="/" replace />

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Log in</p>
        <h1>Welcome back, Bulldog</h1>
        <p className="auth-card__intro">Log in to your Campus Customs account.</p>

        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            setSubmitting(true)
            setError(null)
            try {
              await login({ email: String(form.get('email')), password: String(form.get('password')) })
              navigate('/', { replace: true })
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
              setSubmitting(false)
            }
          }}
        >
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit" className="button button--primary button--block" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
        </form>

        <p className="auth-card__switch">
          New to Campus Customs? <Link to="/create-account" className="link-underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
