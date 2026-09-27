import { createContext } from 'react'
import type { LoginRequest, RegisterRequest } from '../api/auth.ts'
import type { User } from '../types.ts'

export interface AuthContextValue {
  /** The signed-in user, or null when logged out. */
  user: User | null
  /** False until the initial session check finishes. */
  ready: boolean
  login: (request: LoginRequest) => Promise<User>
  register: (request: RegisterRequest) => Promise<User>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
