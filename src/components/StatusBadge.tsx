import { Loader2, ShieldCheck } from '../icons'
import type { BridgeStatus } from '../../electron/types'
import { statusPresentation } from '../../electron/types'

export function StatusBadge({
  status,
  phoneIp,
  lanAuthOn = false,
  enabled = true,
  paused = false,
  scan,
  compact = false,
}: {
  status: BridgeStatus
  phoneIp: string | null
  lanAuthOn?: boolean
  enabled?: boolean
  paused?: boolean
  scan?: { done: number; total: number; currentIp?: string } | null
  /** Smaller inline variant for wizard / dense layouts. */
  compact?: boolean
}) {
  const item =
    !enabled || paused
      ? {
          label: !enabled ? 'Мост выключен' : 'Отключено вами',
          badgeClass: 'badge badge-muted',
          dotClass: 'dot-muted status-dot-idle',
          tone: 'grey' as const,
        }
      : statusPresentation(status, phoneIp)

  const percent =
    scan && enabled && !paused && status === 'searching' && scan.total > 0
      ? Math.min(100, Math.round((scan.done / scan.total) * 100))
      : null

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`${item.badgeClass} ${
            compact ? 'badge-compact' : 'badge-lg'
          }`}
          role="status"
          aria-live="polite"
          title={item.label}
        >
          <span className={item.dotClass} title={item.label} aria-hidden />
          <span className="tracking-tight">{item.label}</span>
        </div>
        {lanAuthOn && enabled && !paused && (
          <span
            className="inline-flex size-7 items-center justify-center rounded-[8px] border border-sky-400/30 bg-[var(--hb-accent-soft)] text-sky-200"
            title="Пароль Happ LAN задан: подключения без логина отсекаются"
            aria-label="LAN auth включён"
          >
            <ShieldCheck size={14} aria-hidden />
          </span>
        )}
      </div>
      {percent != null && (
        <div
          className="space-y-1.5"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Поиск телефона"
        >
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-sky-400" aria-hidden />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/35">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums muted">
              {percent}%
            </span>
          </div>
          <p className="text-xs muted">Ищем {scan!.currentIp ?? 'телефон'}…</p>
        </div>
      )}
    </div>
  )
}
