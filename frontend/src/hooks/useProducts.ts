import { useCallback, useEffect, useState } from 'react'
import { fetchProduct, fetchProducts } from '../api/products.ts'
import type { Product } from '../types.ts'

export type RequestState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

type Loader<T> = (signal: AbortSignal) => Promise<T>

/** Runs `load` whenever it changes, aborting any request still in flight. */
function useRequest<T>(load: Loader<T>): RequestState<T> {
  const [result, setResult] = useState<{ load: Loader<T>; state: RequestState<T> } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ load, state: { status: 'success', data } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const reason = error instanceof Error ? error : new Error(String(error))
        setResult({ load, state: { status: 'error', error: reason } })
      },
    )
    return () => controller.abort()
  }, [load])

  // A result from a previous loader (e.g. the last product viewed) is stale.
  return result?.load === load ? result.state : { status: 'loading' }
}

export function useProducts(): RequestState<Product[]> {
  return useRequest(fetchProducts)
}

export function useProduct(productId: string): RequestState<Product> {
  const load = useCallback((signal: AbortSignal) => fetchProduct(productId, signal), [productId])
  return useRequest(load)
}
