import { use } from 'react'
import { AuthContext } from '../auth/AuthContext.ts'
import type { AuthContextValue } from '../auth/AuthContext.ts'

export function useAuth(): AuthContextValue {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
