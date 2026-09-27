import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../api/auth.ts'
import type { LoginRequest, RegisterRequest } from '../api/auth.ts'
import type { User } from '../types.ts'
import { AuthContext } from './AuthContext.ts'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  // Restore the session from the HttpOnly cookie on page load.
  useEffect(() => {
    let cancelled = false
    authApi
      .fetchSession()
      .then((sessionUser) => {
        if (!cancelled) setUser(sessionUser)
      })
      .catch(() => {
        // Treat an unreachable backend as logged out.
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (request: LoginRequest) => {
    const signedIn = await authApi.login(request)
    setUser(signedIn)
    return signedIn
  }, [])

  const register = useCallback(async (request: RegisterRequest) => {
    const created = await authApi.register(request)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, login, register, logout }), [user, ready, login, register, logout])

  return <AuthContext value={value}>{children}</AuthContext>
}
