import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PageResults } from '../types.ts'
import { AssistantResultsContext } from './AssistantResultsContext.ts'
import type { AssistantResults } from './AssistantResultsContext.ts'

/** Shares the chat assistant's latest product matches between the chat widget and the Products page. */
export default function AssistantResultsProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<AssistantResults | null>(null)

  const showResults = useCallback((next: PageResults) => {
    setResults((current) => ({ ...next, version: (current?.version ?? 0) + 1 }))
  }, [])

  const clearResults = useCallback(() => setResults(null), [])

  const value = useMemo(() => ({ results, showResults, clearResults }), [results, showResults, clearResults])

  return <AssistantResultsContext value={value}>{children}</AssistantResultsContext>
}
