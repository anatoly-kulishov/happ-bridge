import { useState } from 'react'

type Props = {
  peers: string[]
  selectedIp: string | null
  busy?: boolean
  /** IPs the user has connected to before (recent / per-SSID). */
  familiarIps?: string[]
  /** Show a «refresh list» button that re-scans without dropping the relay. */
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
  onSelect: (ip: string) => void | Promise<void>
}

export function PeerList({
  peers,
  selectedIp,
  busy,
  familiarIps,
  onRefresh,
  refreshing,
  onSelect,
}: Props) {
  const [picking, setPicking] = useState<string | null>(null)

  if (peers.length === 0) return null

  const familiar = new Set(familiarIps ?? [])

  const choose = async (ip: string) => {
    if (ip === selectedIp) return
    setPicking(ip)
    try {
      await onSelect(ip)
    } finally {
      setPicking(null)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">
          Телефоны в сети
          <span className="ml-1.5 text-xs font-normal text-zinc-500">
            {peers.length}
          </span>
        </p>
        {onRefresh && (
          <button
            type="button"
            disabled={refreshing || busy || Boolean(picking)}
            onClick={() => void onRefresh()}
            className="min-h-8 rounded-md border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 transition-colors duration-150 hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
          >
            {refreshing ? 'Сканируем…' : 'Обновить'}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Несколько человек могут раздавать Happ. Выберите нужный IP.
      </p>
      <ul className="mt-2 space-y-1.5" role="listbox" aria-label="Найденные прокси">
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
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.99] disabled:opacity-50 ${
                  active
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-100'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/80'
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    active ? 'bg-sky-400' : 'bg-zinc-600'
                  }`}
                  aria-hidden
                />
                <span className="flex-1 font-mono tabular-nums">{ip}</span>
                {!active && familiar.has(ip) && (
                  <span className="shrink-0 text-xs text-emerald-400/80">знакомый</span>
                )}
                <span className="text-xs text-zinc-500">
                  {loading ? '…' : active ? 'выбран' : 'выбрать'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
