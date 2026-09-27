import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.ts'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import './pages.css'

const PASSWORD_MIN_LENGTH = 8

export default function CreateAccountPage() {
  useDocumentTitle('Create Account')
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user && !submitting) return <Navigate to="/" replace />

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <p className="eyebrow">Create account</p>
        <h1>Join the Campus Customs family</h1>
        <p className="auth-card__intro">It only takes a minute to set up your account.</p>

        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const field = (name: string) => String(form.get(name) ?? '')
            if (field('password') !== field('confirmPassword')) {
              setError("Those passwords don't match. Please try again.")
              return
            }

            setSubmitting(true)
            setError(null)
            try {
              await register({
                first_name: field('firstName'),
                last_name: field('lastName'),
                email: field('email'),
                password: field('password'),
                confirm_password: field('confirmPassword'),
              })
              navigate('/', { replace: true })
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
              setSubmitting(false)
            }
          }}
        >
          <div className="field-row">
            <div className="field">
              <label htmlFor="signup-first-name">First name</label>
              <input id="signup-first-name" name="firstName" autoComplete="given-name" maxLength={50} required />
            </div>
            <div className="field">
              <label htmlFor="signup-last-name">Last name</label>
              <input id="signup-last-name" name="lastName" autoComplete="family-name" maxLength={50} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="signup-email">Email</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={128}
              required
              aria-describedby="signup-password-hint"
            />
            <span id="signup-password-hint" className="field__hint">
              Use at least {PASSWORD_MIN_LENGTH} characters.
            </span>
          </div>
          <div className="field">
            <label htmlFor="signup-confirm-password">Confirm password</label>
            <input
              id="signup-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={128}
              required
            />
          </div>
          <button type="submit" className="button button--primary button--block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
        </form>

        <p className="auth-card__switch">
          Already have an account? <Link to="/login" className="link-underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
