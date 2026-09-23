type Props = {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}

export function ProxyCopyButton({ label, value, copied, onCopy }: Props) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex w-full items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left transition-colors duration-150 hover:border-zinc-500 hover:bg-zinc-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-zinc-500">{label}</span>
        <span className="block truncate font-mono text-sm tabular-nums text-zinc-100">
          {value}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-sky-400">
        {copied ? 'Скопировано' : 'Копировать'}
      </span>
    </button>
  )
}
