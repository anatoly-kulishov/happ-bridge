import type { ReactNode } from 'react'

type Props = {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}

export function Card({ title, action, children, className = '', padded = true }: Props) {
  return (
    <section
      className={`rounded-xl border border-zinc-800/80 bg-zinc-900/40 ${padded ? 'p-3' : ''} ${className}`}
    >
      {(title || action) && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {title}
            </h2>
          ) : (
            <div />
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}