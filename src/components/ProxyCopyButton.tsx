import { Check, Copy, Ban } from 'lucide-react'

type Props = {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  disabled?: boolean
}

export function ProxyCopyButton({ label, value, copied, onCopy, disabled }: Props) {
  const action = disabled
    ? 'Мост не подключён — адрес пока не работает'
    : copied
      ? `${label}: скопировано`
      : `Копировать ${label}${value ? ` · ${value}` : ''}`
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onCopy}
      disabled={disabled}
      aria-label={action}
      title={action}
      className="group flex w-full items-center gap-3 rounded-[10px] border border-[var(--hb-border)] bg-black/15 px-3 py-2.5 text-left transition-[border-color,background-color,transform,opacity] duration-150 hover:border-[var(--hb-border-strong)] hover:bg-[var(--hb-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="section-label">{label}</span>
        <span
          className={`truncate font-mono text-[13px] tabular-nums tracking-tight ${
            disabled ? 'faint' : 'text-[var(--hb-text)]'
          }`}
        >
          {disabled ? '—' : value}
        </span>
      </span>
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors ${
          disabled
            ? 'border-[var(--hb-border)] faint'
            : copied
              ? 'border-emerald-400/35 bg-[var(--hb-ok-soft)] text-emerald-300'
              : 'border-[var(--hb-border-strong)] bg-[var(--hb-bg-soft)] text-[var(--hb-text-muted)] group-hover:text-[var(--hb-text)]'
        }`}
        title={disabled ? 'Недоступно' : copied ? 'Скопировано' : 'Копировать'}
        aria-hidden
      >
        {disabled ? (
          <Ban size={15} />
        ) : copied ? (
          <Check size={15} />
        ) : (
          <Copy size={15} />
        )}
      </span>
    </button>
  )
}
