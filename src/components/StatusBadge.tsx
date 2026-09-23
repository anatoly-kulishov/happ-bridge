import type { BridgeStatus } from '../../electron/types'
import { statusPresentation } from '../../electron/types'

export function StatusBadge({
  status,
  phoneIp,
}: {
  status: BridgeStatus
  phoneIp: string | null
}) {
  const item = statusPresentation(status, phoneIp)

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ${item.badgeClass}`}
      role="status"
      aria-live="polite"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`} />
      {item.label}
    </div>
  )
}
