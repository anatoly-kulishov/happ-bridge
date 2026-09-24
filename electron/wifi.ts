import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppSettings } from './types'
import { isIpv4 } from './types'

const execFileAsync = promisify(execFile)

/** Current Wi‑Fi SSID on macOS, or null if not on Wi‑Fi. */
export async function currentWifiSsid(): Promise<string | null> {
  for (const iface of ['en0', 'en1', 'en2']) {
    try {
      const { stdout } = await execFileAsync('networksetup', [
        '-getairportnetwork',
        iface,
      ])
      const m = /^Current Wi-Fi Network:\s*(.+)$/i.exec(stdout.trim())
      if (m?.[1]) return m[1].trim()
    } catch {
      // wrong iface
    }
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
