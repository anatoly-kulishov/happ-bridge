import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppSettings } from './types'
import { isIpv4 } from './types'

const execFileAsync = promisify(execFile)

const FALLBACK_WIFI_IFACES = ['en0', 'en1', 'en2']

/** Hardware ports labeled Wi‑Fi / AirPort from `networksetup -listallhardwareports`. */
export async function wifiHardwareDevices(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports'])
    const devices: string[] = []
    const blocks = stdout.split(/\n\n+/)
    for (const block of blocks) {
      const isWifi = /Hardware Port:\s*(Wi-?Fi|AirPort)\b/i.test(block)
      if (!isWifi) continue
      const m = /^Device:\s*(\S+)/m.exec(block)
      if (m?.[1]) devices.push(m[1])
    }
    return devices.length > 0 ? devices : [...FALLBACK_WIFI_IFACES]
  } catch {
    return [...FALLBACK_WIFI_IFACES]
  }
}

async function ssidFromIface(iface: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('networksetup', [
      '-getairportnetwork',
      iface,
    ])
    const m = /^Current Wi-Fi Network:\s*(.+)$/i.exec(stdout.trim())
    if (m?.[1]) return m[1].trim()
  } catch {
    // wrong iface / not associated
  }
  return null
}

/** Current Wi‑Fi SSID on macOS, or null if not on Wi‑Fi / Location denied. */
export async function currentWifiSsid(): Promise<string | null> {
  const ifaces = await wifiHardwareDevices()
  const seen = new Set<string>()
  for (const iface of ifaces) {
    if (seen.has(iface)) continue
    seen.add(iface)
    const ssid = await ssidFromIface(iface)
    if (ssid) return ssid
  }
  return null
}

export function isHomeSsid(ssid: string | null, homeSsids: string[]): boolean {
  return Boolean(ssid && homeSsids.includes(ssid))
}

/** No LAN auth on a known Wi‑Fi that is not marked home (or no home list yet). */
export function shouldWarnPublicNoAuth(opts: {
  ssid: string | null
  homeSsids: string[]
  hasAuth: boolean
}): boolean {
  if (opts.hasAuth || !opts.ssid) return false
  if (opts.homeSsids.length === 0) return true
  return !isHomeSsid(opts.ssid, opts.homeSsids)
}

/** Bind phone IP to SSID only — does not change home trust. */
export function rememberSsidPeer(
  settings: AppSettings,
  ssid: string | null,
  ip: string,
): Pick<AppSettings, 'ssidPeers'> {
  if (!ssid || !isIpv4(ip)) return { ssidPeers: settings.ssidPeers }
  return { ssidPeers: { ...settings.ssidPeers, [ssid]: ip } }
}

export function addHomeSsid(settings: AppSettings, ssid: string): AppSettings {
  const trimmed = ssid.trim()
  if (!trimmed || settings.homeSsids.includes(trimmed)) return settings
  return {
    ...settings,
    homeSsids: [...settings.homeSsids, trimmed].slice(0, 16),
  }
}

/** Derived Wi‑Fi / LAN-auth flags for BridgeState. */
export function wifiBridgeFlags(
  ssid: string | null,
  settings: Pick<AppSettings, 'homeSsids'>,
  hasAuth: boolean,
): {
  wifiSsid: string | null
  isHomeNetwork: boolean
  lanAuthOn: boolean
  publicWifiNoAuth: boolean
} {
  return {
    wifiSsid: ssid,
    isHomeNetwork: isHomeSsid(ssid, settings.homeSsids),
    lanAuthOn: hasAuth,
    publicWifiNoAuth: shouldWarnPublicNoAuth({
      ssid,
      homeSsids: settings.homeSsids,
      hasAuth,
    }),
  }
}
