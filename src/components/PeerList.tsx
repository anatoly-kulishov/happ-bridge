import { useState } from 'react'

type Props = {
  peers: string[]
  selectedIp: string | null
  busy?: boolean
  onSelect: (ip: string) => void | Promise<void>
}

export function PeerList({ peers, selectedIp, busy, onSelect }: Props) {
  const [picking, setPicking] = useState<string | null>(null)

  if (peers.length === 0) return null

  const choose = async (ip: string) => {
    setPicking(ip)
    try {
      await onSelect(ip)
    } finally {
      setPicking(null)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-sm font-medium text-zinc-200">
        Телефоны в сети
        <span className="ml-1.5 text-xs font-normal text-zinc-500">
          {peers.length}
        </span>
      </p>
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
