export type BridgeStatus = 'connected' | 'searching' | 'disconnected'

export type InjectTargetId = 'cursor' | 'webstorm' | 'firefox'

export type AppSettings = {
  lastPhoneIp: string | null
  recentPhoneIps: string[]
  socksPort: number
  httpPort: number
  openAtLogin: boolean
  /** When false, never connect / reconnect to Happ until user turns it on. */
  enabled: boolean
  wizardDone: boolean
  manualIp: string | null
  /** Happ LAN SOCKS/HTTP login (optional). */
  proxyUser: string | null
  /**
   * Happ LAN password (in-memory / Keychain).
   * Never persisted in settings.json — see store.ts.
   */
  proxyPassword: string | null
  /** SSIDs treated as trusted / home (no public-Wi‑Fi warning). */
  homeSsids: string[]
  /** Last chosen phone IP per Wi‑Fi SSID. */
  ssidPeers: Record<string, string>
  /** Kept for old configs; inject is manual only. */
  seamlessAppProxy: boolean
  /** Last inject selection (unused for auto). */
  injectTargets: InjectTargetId[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  lastPhoneIp: null,
  recentPhoneIps: [],
  socksPort: 10808,
  httpPort: 10809,
  openAtLogin: true,
  enabled: true,
  wizardDone: false,
  manualIp: null,
  proxyUser: null,
  proxyPassword: null,
  homeSsids: [],
  ssidPeers: {},
  seamlessAppProxy: false,
  injectTargets: [],
}

export type DiagnosticCheck = {
  id: string
  ok: boolean
  label: string
  detail: string
}

export type UpdateInfo = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'dev'
  message: string
  version?: string
}

export type BridgeState = {
  status: BridgeStatus
  phoneIp: string | null
  /** Online Happ proxies found on the last scan (may be several people). */
  peers: string[]
  socksLocal: string
  httpLocal: string
  settings: AppSettings
  error: string | null
  diagnostics: DiagnosticCheck[] | null
  update: UpdateInfo
  /** Current Wi‑Fi SSID if known. */
  wifiSsid: string | null
  /** Current SSID is in homeSsids. */
  isHomeNetwork: boolean
  /** LAN user/pass configured. */
  lanAuthOn: boolean
  /** No LAN auth while on non-home Wi‑Fi. */
  publicWifiNoAuth: boolean
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

/** Tray tooltip + optional status-line for LAN auth / public Wi‑Fi. */
export function traySecurityPresentation(opts: {
  tip: string
  lanAuthOn: boolean
  publicWifiNoAuth: boolean
}): { tip: string; menuLabel: string | null; cacheKey: string } {
  const { lanAuthOn, publicWifiNoAuth } = opts
  const tip = publicWifiNoAuth
    ? `${opts.tip} · нет LAN-пароля вне дома`
    : lanAuthOn
      ? `${opts.tip} · LAN auth`
      : opts.tip
  const menuLabel = lanAuthOn
    ? 'LAN auth · вкл'
    : publicWifiNoAuth
      ? '⚠ Нет пароля LAN (чужая сеть)'
      : null
  return {
    tip,
    menuLabel,
    cacheKey: `${lanAuthOn ? 1 : 0}|${publicWifiNoAuth ? 1 : 0}`,
  }
}

export function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  let socksPort = clampPort(raw.socksPort, DEFAULT_SETTINGS.socksPort)
  let httpPort = clampPort(raw.httpPort, DEFAULT_SETTINGS.httpPort)
  if (socksPort === httpPort) {
    httpPort =
      socksPort === DEFAULT_SETTINGS.httpPort
        ? DEFAULT_SETTINGS.socksPort
        : DEFAULT_SETTINGS.httpPort
    if (socksPort === httpPort) httpPort = socksPort === 65535 ? socksPort - 1 : socksPort + 1
  }
  const lastPhoneIp = ipv4OrNull(raw.lastPhoneIp)
  const recentPhoneIps = normalizeIpList(raw.recentPhoneIps, lastPhoneIp)
  return {
    lastPhoneIp,
    recentPhoneIps,
    socksPort,
    httpPort,
    openAtLogin:
      typeof raw.openAtLogin === 'boolean' ? raw.openAtLogin : DEFAULT_SETTINGS.openAtLogin,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled,
    wizardDone:
      typeof raw.wizardDone === 'boolean' ? raw.wizardDone : DEFAULT_SETTINGS.wizardDone,
    manualIp: ipv4OrNull(raw.manualIp),
    proxyUser: stringOrNull(raw.proxyUser),
    proxyPassword: credentialOrNull(raw.proxyPassword),
    homeSsids: normalizeSsidList(raw.homeSsids),
    ssidPeers: normalizeSsidPeers(raw.ssidPeers),
    seamlessAppProxy:
      typeof raw.seamlessAppProxy === 'boolean'
        ? raw.seamlessAppProxy
        : DEFAULT_SETTINGS.seamlessAppProxy,
    injectTargets: normalizeInjectTargets(raw.injectTargets),
  }
}

export function rememberPhoneIp(
  settings: AppSettings,
  ip: string,
): Pick<AppSettings, 'lastPhoneIp' | 'recentPhoneIps'> {
  if (!isIpv4(ip)) {
    return {
      lastPhoneIp: settings.lastPhoneIp,
      recentPhoneIps: settings.recentPhoneIps,
    }
  }
  const recent = [ip, ...settings.recentPhoneIps.filter((x) => x !== ip)].slice(0, 8)
  return { lastPhoneIp: ip, recentPhoneIps: recent }
}

/** SOCKS5 user/pass when a real login or non-empty password is set. */
export function socksAuthFromSettings(
  s: Pick<AppSettings, 'proxyUser' | 'proxyPassword'>,
): { user: string; pass: string } | null {
  const user = s.proxyUser
  const pass = s.proxyPassword
  const userOk = typeof user === 'string' && user.length > 0
  const passOk = typeof pass === 'string' && pass.length > 0
  if (!userOk && !passOk) return null
  return { user: user ?? '', pass: pass ?? '' }
}

/** Settings safe to send to the renderer (no Keychain secret). */
export function publicSettings(settings: AppSettings): AppSettings {
  return { ...settings, proxyPassword: null }
}

function normalizeSsidList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const s = item.trim()
    if (s.length === 0 || out.includes(s)) continue
    out.push(s)
    if (out.length >= 16) break
  }
  return out
}

function normalizeSsidPeers(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const ssid = k.trim()
    if (!ssid || typeof v !== 'string' || !isIpv4(v.trim())) continue
    out[ssid] = v.trim()
  }
  return out
}

function normalizeIpList(value: unknown, lastPhoneIp: string | null): string[] {
  const fromArray = Array.isArray(value)
    ? value.filter((x): x is string => typeof x === 'string' && isIpv4(x.trim()))
    : []
  const merged = [
    ...fromArray.map((x) => x.trim()),
    ...(lastPhoneIp ? [lastPhoneIp] : []),
  ]
  return [...new Set(merged)].slice(0, 8)
}

/** Reject bool/string coercion (true→1) and non-integers. */
function clampPort(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  if (value < 1 || value > 65535) return fallback
  return value
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Password: empty string → null (no auth).
 * Whitespace-only is kept so a set password cannot silently disable anti-spoof.
 */
function credentialOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0) return null
  return value
}

export function isIpv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const n = Number(part)
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === part
  })
}

function ipv4OrNull(value: unknown): string | null {
  const s = stringOrNull(value)
  return s && isIpv4(s) ? s : null
}

const INJECT_IDS: InjectTargetId[] = ['cursor', 'webstorm', 'firefox']

function normalizeInjectTargets(value: unknown): InjectTargetId[] {
  if (!Array.isArray(value)) return []
  const out: InjectTargetId[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    if ((INJECT_IDS as string[]).includes(item) && !out.includes(item as InjectTargetId)) {
      out.push(item as InjectTargetId)
    }
  }
  return out
}
