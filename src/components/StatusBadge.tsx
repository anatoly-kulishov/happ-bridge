import type { BridgeStatus } from '../../electron/types'
import { statusPresentation } from '../../electron/types'

export function StatusBadge({
  status,
  phoneIp,
  lanAuthOn = false,
  enabled = true,
  paused = false,
  scan,
}: {
  status: BridgeStatus
  phoneIp: string | null
  lanAuthOn?: boolean
  enabled?: boolean
  paused?: boolean
  scan?: { done: number; total: number } | null
}) {
  const item =
    !enabled || paused
      ? {
          label: !enabled ? 'Мост выключен' : 'Отключено вами',
          badgeClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
          dotClass: 'bg-zinc-400',
        }
      : statusPresentation(status, phoneIp)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ${item.badgeClass}`}
          role="status"
          aria-live="polite"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`} aria-hidden />
          {item.label}
        </div>
        {lanAuthOn && enabled && !paused && (
          <span className="inline-flex items-center rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-200">
            LAN auth
          </span>
        )}
      </div>
      {scan && enabled && !paused && status === 'searching' && scan.total > 0 && (
        <div className="flex items-center gap-2" role="progressbar" aria-label="Поиск телефона">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-200"
              style={{ width: `${Math.min(100, Math.round((scan.done / scan.total) * 100))}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
            {scan.done}/{scan.total}
          </span>
        </div>
      )}
    </div>
  )
}
