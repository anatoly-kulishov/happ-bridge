import { Check, Copy, Ban } from 'lucide-react'

type Props = {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  disabled?: boolean
}

export function ProxyCopyButton({ label, value, copied, onCopy, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onCopy}
      disabled={disabled}
      title={disabled ? 'Мост не подключён — адрес пока не работает' : `Копировать ${label}`}
      className="group flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <span className="truncate font-mono text-sm tabular-nums text-zinc-100">
          {disabled ? '—' : value}
        </span>
      </span>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
          disabled
            ? 'border-zinc-800 text-zinc-600'
            : copied
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : 'border-zinc-700 bg-zinc-800 text-zinc-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
      >
        {disabled ? (
          <Ban size={16} />
        ) : copied ? (
          <Check size={16} />
        ) : (
          <Copy size={16} />
        )}
      </span>
    </button>
  )
}