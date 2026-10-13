import type { ReactNode } from 'react'

type Props = {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  /** Primary status surface — bordered block, not a marketing card stack. */
  elevated?: boolean
}

export function Card({
  title,
  action,
  children,
  className = '',
  padded = true,
  elevated = false,
}: Props) {
  const shell = elevated ? 'card-elevated' : padded ? 'card' : 'border-t'
  return (
    <section className={`${shell} ${className}`.trim()}>
      {(title || action) && (
        <div className="card-head">
          {title ? <h2 className="section-label">{title}</h2> : <div />}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
