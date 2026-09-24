import type { BridgeStatus } from '../../electron/types'
import { statusPresentation } from '../../electron/types'

export function StatusBadge({
  status,
  phoneIp,
  lanAuthOn = false,
  enabled = true,
}: {
  status: BridgeStatus
  phoneIp: string | null
  lanAuthOn?: boolean
  enabled?: boolean
}) {
  const item = enabled
    ? statusPresentation(status, phoneIp)
    : {
        label: 'Мост выключен',
        badgeClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
        dotClass: 'bg-zinc-400',
      }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ${item.badgeClass}`}
        role="status"
        aria-live="polite"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`} aria-hidden />
        {item.label}
      </div>
      {lanAuthOn && enabled && (
        <span className="inline-flex items-center rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-200">
          LAN auth
        </span>
      )}
    </div>
  )
}
