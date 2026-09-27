import { createContext } from 'react'
import type { PageResults } from '../types.ts'

export interface AssistantResults extends PageResults {
  /** Increments with every new search, so the page can re-animate and scroll to fresh results. */
  version: number
}

export interface AssistantResultsContextValue {
  /** The latest merchandise matches from the chat assistant, or null. */
  results: AssistantResults | null
  showResults: (results: PageResults) => void
  clearResults: () => void
}

export const AssistantResultsContext = createContext<AssistantResultsContextValue | null>(null)
