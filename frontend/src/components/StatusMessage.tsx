import type { ReactNode } from 'react'

interface StatusMessageProps {
  tone?: 'info' | 'error'
  detail?: string
  children: ReactNode
}

export default function StatusMessage({ tone = 'info', detail, children }: StatusMessageProps) {
  return (
    <p className={`status-message status-message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
      {detail && <span className="status-message__detail">{detail}</span>}
    </p>
  )
}
