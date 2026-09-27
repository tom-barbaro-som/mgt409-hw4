import { use } from 'react'
import { AssistantResultsContext } from '../assistant/AssistantResultsContext.ts'
import type { AssistantResultsContextValue } from '../assistant/AssistantResultsContext.ts'

export function useAssistantResults(): AssistantResultsContextValue {
  const context = use(AssistantResultsContext)
  if (!context) throw new Error('useAssistantResults must be used inside <AssistantResultsProvider>')
  return context
}
