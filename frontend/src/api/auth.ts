import type { User } from '../types.ts'
import { fetchJson, postJson } from './client.ts'

export interface RegisterRequest {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
}

export interface LoginRequest {
  email: string
  password: string
}

interface SessionResponse {
  user: User | null
}

export async function fetchSession(): Promise<User | null> {
  return (await fetchJson<SessionResponse>('/api/auth/session')).user
}

export async function register(request: RegisterRequest): Promise<User> {
  const { user } = await postJson<SessionResponse>('/api/auth/register', request)
  if (!user) throw new Error('Account was created but no session was returned.')
  return user
}

export async function login(request: LoginRequest): Promise<User> {
  const { user } = await postJson<SessionResponse>('/api/auth/login', request)
  if (!user) throw new Error('Login succeeded but no session was returned.')
  return user
}

export function logout(): Promise<void> {
  return postJson<void>('/api/auth/logout')
}
