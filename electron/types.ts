export type BridgeStatus = 'connected' | 'searching' | 'disconnected'

export type AppSettings = {
  lastPhoneIp: string | null
  socksPort: number
  httpPort: number
  openAtLogin: boolean
  wizardDone: boolean
  manualIp: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  lastPhoneIp: null,
  socksPort: 10808,
  httpPort: 10809,
  openAtLogin: true,
  wizardDone: false,
  manualIp: null,
}

export type BridgeState = {
  status: BridgeStatus
  phoneIp: string | null
  socksLocal: string
  httpLocal: string
  settings: AppSettings
  error: string | null
}

export type StatusTone = 'green' | 'yellow' | 'red'

export type StatusPresentation = {
  tone: StatusTone
  label: string
  trayTip: string
  badgeClass: string
  dotClass: string
}

export function statusPresentation(
  status: BridgeStatus,
  phoneIp: string | null,
): StatusPresentation {
  switch (status) {
    case 'connected':
      return {
        tone: 'green',
        label: phoneIp ? `Подключено · ${phoneIp}` : 'Подключено',
        trayTip: phoneIp ? `Happ Bridge · ${phoneIp}` : 'Happ Bridge · подключено',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        dotClass: 'bg-emerald-400',
      }
    case 'searching':
      return {
        tone: 'yellow',
        label: 'Ищем телефон…',
        trayTip: 'Happ Bridge · ищем телефон…',
        badgeClass: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
        dotClass: 'bg-amber-400',
      }
    case 'disconnected':
      return {
        tone: 'red',
        label: 'Телефон не найден',
        trayTip: 'Happ Bridge · телефон не найден',
        badgeClass: 'bg-red-500/15 text-red-300 border-red-500/30',
        dotClass: 'bg-red-400',
      }
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const socksPort = clampPort(raw.socksPort, DEFAULT_SETTINGS.socksPort)
  const httpPort = clampPort(raw.httpPort, DEFAULT_SETTINGS.httpPort)
  return {
    lastPhoneIp: stringOrNull(raw.lastPhoneIp),
    socksPort,
    httpPort,
    openAtLogin: typeof raw.openAtLogin === 'boolean' ? raw.openAtLogin : DEFAULT_SETTINGS.openAtLogin,
    wizardDone: typeof raw.wizardDone === 'boolean' ? raw.wizardDone : DEFAULT_SETTINGS.wizardDone,
    manualIp: stringOrNull(raw.manualIp),
  }
}

function clampPort(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback
  return n
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
