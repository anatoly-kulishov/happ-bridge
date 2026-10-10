import type { ReactNode } from 'react'

type Props = {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  /** Emphasize as the primary status surface. */
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
  return (
    <section className={`${elevated ? 'surface-raised' : 'surface'} ${padded ? 'p-3.5' : ''} ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="section-label">{title}</h2> : <div />}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
