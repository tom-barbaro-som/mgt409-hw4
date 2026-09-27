/** Lets any page open the chat widget and send it a question (the widget listens for this event). */
export const ASK_ASSISTANT_EVENT = 'campus-customs:ask-assistant'

export function askAssistant(message: string) {
  window.dispatchEvent(new CustomEvent<string>(ASK_ASSISTANT_EVENT, { detail: message }))
}
