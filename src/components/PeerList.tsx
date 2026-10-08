import { Check, Loader2 } from 'lucide-react'
import { useState } from 'react'

type Props = {
  peers: string[]
  selectedIp: string | null
  busy?: boolean
  /** IPs the user has connected to before (recent / per-SSID). */
  familiarIps?: string[]
  onSelect: (ip: string) => void | Promise<void>
  /** Clicking the active peer disconnects instead of no-op. */
  onDisconnect?: () => void | Promise<void>
  /** When the list is wrapped in a card with its own title, hide the internal header. */
  showHeader?: boolean
  emptyHint?: string
}

export function PeerList({
  peers,
  selectedIp,
  busy,
  familiarIps,
  onSelect,
  onDisconnect,
  showHeader = true,
  emptyHint,
}: Props) {
  const [picking, setPicking] = useState<string | null>(null)

  const familiar = new Set(familiarIps ?? [])

  const choose = async (ip: string) => {
    if (ip === selectedIp) {
      if (!onDisconnect) return
      setPicking(ip)
      try {
        await onDisconnect()
      } finally {
        setPicking(null)
      }
      return
    }
    setPicking(ip)
    try {
      await onSelect(ip)
    } finally {
      setPicking(null)
    }
  }

  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Телефоны в сети
            {peers.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-zinc-800 px-1 text-[10px] font-bold text-zinc-400">
                {peers.length}
              </span>
            )}
          </p>
        </div>
      )}
      {showHeader && peers.length > 1 && (
        <p className="text-xs text-zinc-500">
          {onDisconnect
            ? 'Нажмите IP, чтобы подключиться. Активный — чтобы отключить.'
            : 'Нажмите IP, чтобы подключиться.'}
        </p>
      )}

      {peers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-3 py-4 text-center text-xs leading-relaxed text-zinc-500">
          {emptyHint ?? 'Телефонов пока нет. Нажмите обновление, чтобы найти.'}
        </p>
      ) : (
        <ul className="space-y-1.5" role="listbox" aria-label="Найденные прокси">
          {peers.map((ip) => {
            const active = ip === selectedIp
            const loading = picking === ip
            return (
              <li key={ip}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={busy || Boolean(picking)}
                  onClick={() => void choose(ip)}
                  title={
                    active
                      ? onDisconnect
                        ? 'Отключить этот телефон'
                        : 'Текущий телефон'
                      : 'Подключиться к этому телефону'
                  }
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.99] disabled:opacity-50 ${
                    active
                      ? 'border-sky-500/50 bg-sky-500/10 text-sky-100'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/80'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      active
                        ? 'border-sky-400 bg-sky-400 text-zinc-950'
                        : 'border-zinc-600 bg-transparent'
                    }`}
                    aria-hidden
                  >
                    {active && <Check size={12} />}
                  </span>
                  <span className="flex-1 font-mono tabular-nums">{ip}</span>
                  {!active && familiar.has(ip) && (
                    <span className="shrink-0 text-xs text-emerald-400/80">знакомый</span>
                  )}
                  <span className="inline-flex min-w-[4.25rem] items-center justify-end gap-1 text-xs text-zinc-500">
                    {loading ? (
                      <>
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                        {active ? 'стоп' : 'связь'}
                      </>
                    ) : active ? (
                      onDisconnect ? (
                        'отключить'
                      ) : (
                        'выбран'
                      )
                    ) : (
                      'выбрать'
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
