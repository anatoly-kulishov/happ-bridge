import os from 'node:os'
import { probeSocks5, type SocksAuth } from './relay'

export type DiscoverOptions = {
  socksPort: number
  preferredIps?: string[]
  manualIp?: string | null
  concurrency?: number
  timeoutMs?: number
  signal?: AbortSignal
  /** When false, only probe preferred/manual IPs (tests / narrow reconnect). */
  scanSubnet?: boolean
  /** Happ LAN credentials — probe requires successful SOCKS5 user/pass. */
  auth?: SocksAuth | null
}

/** First hit only (preferred → subnet). Kept for fast reconnect / tests. */
export async function discoverPhone(opts: DiscoverOptions): Promise<string | null> {
  const found = await discoverPhones(opts)
  if (found.length === 0) return null
  return pickPreferredPhone(found, opts.manualIp, opts.preferredIps) ?? found[0]
}

/** All Happ SOCKS5 peers on LAN (and preferred list). */
export async function discoverPhones(opts: DiscoverOptions): Promise<string[]> {
  const {
    socksPort,
    preferredIps = [],
    manualIp,
    concurrency = 64,
    timeoutMs = 350,
    signal,
    scanSubnet = true,
    auth = null,
  } = opts

  const hits: string[] = []
  const hitSet = new Set<string>()
  const probeMs = auth ? Math.max(timeoutMs, 500) : timeoutMs

  const tryOne = async (ip: string, abort?: AbortSignal): Promise<string | null> => {
    if (signal?.aborted || abort?.aborted) return null
    const ok = await probeSocks5(ip, socksPort, probeMs, abort ?? signal, auth)
    if (signal?.aborted || abort?.aborted) return null
    return ok ? ip : null
  }

  const record = (ip: string | null) => {
    if (!ip || hitSet.has(ip)) return
    hitSet.add(ip)
    hits.push(ip)
  }

  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (ip: string | null | undefined) => {
    if (!ip || seen.has(ip)) return
    seen.add(ip)
    ordered.push(ip)
  }

  push(manualIp ?? null)
  for (const ip of preferredIps) push(ip)

  for (const ip of ordered) {
    if (signal?.aborted) return hits
    record(await tryOne(ip, signal))
  }

  if (signal?.aborted) return hits
  if (!scanSubnet) return hits

  const scanned = await scanAllHosts(
    prioritizedHosts(seen),
    tryOne,
    concurrency,
    signal,
  )
  for (const ip of scanned) record(ip)
  return hits
}

/** Prefer manual → listed preferred that are online → null. */
export function pickPreferredPhone(
  online: string[],
  manualIp?: string | null,
  preferredIps?: string[],
): string | null {
  const set = new Set(online)
  if (manualIp && set.has(manualIp)) return manualIp
  for (const ip of preferredIps ?? []) {
    if (set.has(ip)) return ip
  }
  return null
}

/** SSID peer + recent + lastPhone, de-duped order for discovery. */
export function preferredIpsFromSettings(
  settings: {
    ssidPeers: Record<string, string>
    recentPhoneIps: string[]
    lastPhoneIp: string | null
  },
  wifiSsid: string | null,
): string[] {
  const ssidPeer = wifiSsid ? settings.ssidPeers[wifiSsid] : undefined
  const raw = [
    ...(ssidPeer ? [ssidPeer] : []),
    ...settings.recentPhoneIps,
    ...(settings.lastPhoneIp ? [settings.lastPhoneIp] : []),
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const ip of raw) {
    if (seen.has(ip)) continue
    seen.add(ip)
    out.push(ip)
  }
  return out
}

/**
 * Choose which online peer to bind.
 * User-initiated multi-peer with no preference → null (UI must pick).
 */
export function chooseDiscoveredPeer(opts: {
  found: string[]
  manualIp: string | null
  preferredIps: string[]
  currentIp: string | null
  reason: string
}): string | null {
  const { found, manualIp, preferredIps, currentIp, reason } = opts
  return (
    pickPreferredPhone(found, manualIp, preferredIps) ??
    (found.length === 1 ? found[0] : null) ??
    (currentIp && found.includes(currentIp) ? currentIp : null) ??
    (reason === 'user' ? null : found[0] ?? null)
  )
}

export function localIpv4Addresses(): string[] {
  const nets = os.networkInterfaces()
  const result: string[] = []
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        result.push(entry.address)
      }
    }
  }
  return result
}

export function networkFingerprint(localIps = localIpv4Addresses()): string {
  return [...localIps].sort().join(',')
}

/** /24 hosts from local IPv4s, skipping self, .0 and .255. */
export function localSubnetHosts(localIps = localIpv4Addresses()): string[] {
  const hosts: string[] = []
  const seen = new Set<string>()

  for (const ip of localIps) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) continue
    const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`
    for (let i = 1; i <= 254; i++) {
      const host = `${prefix}.${i}`
      if (host === ip || seen.has(host)) continue
      seen.add(host)
      hosts.push(host)
    }
  }

  return hosts
}

/**
 * Prefer DHCP mid-range and common phone leases first (.2-.80, then rest).
 * Skips IPs already probed via preferred list.
 */
export function prioritizedHosts(
  skip = new Set<string>(),
  hosts = localSubnetHosts(),
): string[] {
  const all = hosts.filter((h) => !skip.has(h))
  const hot: string[] = []
  const cold: string[] = []

  for (const host of all) {
    const last = Number(host.split('.')[3])
    if (last >= 2 && last <= 80) hot.push(host)
    else cold.push(host)
  }

  return [...hot, ...cold]
}

/** Parallel scan; aborts in-flight tryOne on first hit. */
export async function scanHosts(
  hosts: string[],
  tryOne: (ip: string, signal?: AbortSignal) => Promise<string | null>,
  concurrency: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (hosts.length === 0) return null
  if (signal?.aborted) return null

  const localAbort = new AbortController()
  const onOuterAbort = () => localAbort.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })

  let index = 0
  let winner: string | null = null

  const worker = async (): Promise<void> => {
    while (!localAbort.signal.aborted && index < hosts.length) {
      const i = index++
      const hit = await tryOne(hosts[i], localAbort.signal)
      if (localAbort.signal.aborted) return
      if (hit && !winner) {
        winner = hit
        localAbort.abort()
        return
      }
    }
  }

  try {
    const n = Math.min(concurrency, hosts.length)
    await Promise.all(Array.from({ length: n }, () => worker()))
  } finally {
    signal?.removeEventListener('abort', onOuterAbort)
  }

  if (signal?.aborted) return null
  return winner
}

/** Parallel scan of entire list; collects every hit (no early abort). */
export async function scanAllHosts(
  hosts: string[],
  tryOne: (ip: string, signal?: AbortSignal) => Promise<string | null>,
  concurrency: number,
  signal?: AbortSignal,
): Promise<string[]> {
  if (hosts.length === 0) return []
  if (signal?.aborted) return []

  const found: string[] = []
  const foundSet = new Set<string>()
  let index = 0

  const worker = async (): Promise<void> => {
    while (!signal?.aborted && index < hosts.length) {
      const i = index++
      const hit = await tryOne(hosts[i], signal)
      if (hit && !foundSet.has(hit)) {
        foundSet.add(hit)
        found.push(hit)
      }
    }
  }

  const n = Math.min(concurrency, hosts.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  if (signal?.aborted) return found
  return found
}
