import type { ReactNode } from 'react'

type StatusTone = 'info' | 'success' | 'warning' | 'error'

interface StatusMessageProps {
  children: ReactNode
  tone?: StatusTone
}

const toneLabels: Record<StatusTone, string> = {
  info: 'Informação',
  success: 'Concluído',
  warning: 'Atenção',
  error: 'Erro',
}

export function StatusMessage({ children, tone = 'info' }: StatusMessageProps) {
  const isError = tone === 'error'

  return (
    <div
      className="status-message"
      data-tone={tone}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <strong className="status-message__label">{toneLabels[tone]}</strong>
      <span>{children}</span>
    </div>
  )
}
