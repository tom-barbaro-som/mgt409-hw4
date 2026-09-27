import type { Product } from '../types.ts'
import { fetchJson } from './client.ts'

export function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  return fetchJson<Product[]>('/api/products', { signal })
}

export function fetchProduct(productId: string, signal?: AbortSignal): Promise<Product> {
  return fetchJson<Product>(`/api/products/${encodeURIComponent(productId)}`, { signal })
}
