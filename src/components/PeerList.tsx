import { Check, CirclePlus, History, Loader2, Unplug } from '../icons'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

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
  const [focusIdx, setFocusIdx] = useState(0)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const familiar = new Set(familiarIps ?? [])

  useEffect(() => {
    if (peers.length === 0) {
      setFocusIdx(0)
      return
    }
    const selected = selectedIp ? peers.indexOf(selectedIp) : -1
    setFocusIdx(selected >= 0 ? selected : 0)
  }, [peers, selectedIp])

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

  const moveFocus = (next: number) => {
    if (peers.length === 0) return
    const clamped = Math.max(0, Math.min(peers.length - 1, next))
    setFocusIdx(clamped)
    optionRefs.current[clamped]?.focus()
  }

  const onOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveFocus(index + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveFocus(index - 1)
        break
      case 'Home':
        e.preventDefault()
        moveFocus(0)
        break
      case 'End':
        e.preventDefault()
        moveFocus(peers.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div className="stack stack-2">
      {showHeader && (
        <div className="card-head" style={{ marginBottom: 0 }}>
          <p className="section-label">
            Телефоны в сети
            {peers.length > 0 && (
              <span className="chip ml-2 align-middle" title={`Найдено: ${peers.length}`}>
                {peers.length}
              </span>
            )}
          </p>
        </div>
      )}
      {showHeader && peers.length > 1 && (
        <p className="text-xs muted">
          {onDisconnect
            ? 'Нажмите IP, чтобы подключиться. Повторный клик по активному отключает.'
            : 'Нажмите IP, чтобы подключиться.'}
        </p>
      )}

      {peers.length === 0 ? (
        <p className="empty-state">
          {emptyHint ?? 'Телефонов пока нет. Нажмите обновление, чтобы найти.'}
        </p>
      ) : (
        <ul className="stack stack-1.5" role="listbox" aria-label="Найденные прокси">
          {peers.map((ip, index) => {
            const active = ip === selectedIp
            const loading = picking === ip
            const isFamiliar = !active && familiar.has(ip)
            const actionLabel = loading
              ? active
                ? 'Отключаем…'
                : 'Подключаем…'
              : active
                ? onDisconnect
                  ? 'Отключить этот телефон'
                  : 'Текущий телефон'
                : 'Подключиться к этому телефону'
            const rowTitle = [ip, isFamiliar ? 'знакомый' : null, actionLabel]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={ip} role="presentation">
                <button
                  ref={(el) => {
                    optionRefs.current[index] = el
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-label={rowTitle}
                  tabIndex={index === focusIdx ? 0 : -1}
                  disabled={busy || Boolean(picking)}
                  onClick={() => void choose(ip)}
                  onFocus={() => setFocusIdx(index)}
                  onKeyDown={(e) => onOptionKeyDown(e, index)}
                  title={rowTitle}
                  className={`row${active ? ' row-active' : ''}`}
                >
                  <span className="row-check" title={active ? 'Выбран' : 'Не выбран'} aria-hidden>
                    {active && <Check size={12} strokeWidth={2.5} />}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate mono-sm" title={ip}>
                      {ip}
                    </span>
                    {isFamiliar && (
                      <span
                        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hb-ok-soft)] text-emerald-300"
                        title="Знакомый: подключались к этому IP раньше"
                        aria-hidden
                      >
                        <History size={12} />
                      </span>
                    )}
                  </span>
                  <span
                    className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ${
                      active && onDisconnect ? 'text-sky-200' : 'muted'
                    }`}
                    title={actionLabel}
                    aria-hidden
                  >
                    {loading ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : active ? (
                      onDisconnect ? (
                        <Unplug size={15} />
                      ) : (
                        <Check size={15} />
                      )
                    ) : (
                      <CirclePlus size={15} className="opacity-55" />
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
