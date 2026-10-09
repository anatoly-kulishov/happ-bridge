import net from 'node:net'
import os from 'node:os'
import { probeSocks5, type SocksAuth } from './relay'
import { log } from './log'

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
  /** Probed-hosts progress for UI (done, total, current IPv4). */
  onProgress?: (done: number, total: number, currentIp: string) => void
}

/** First hit only (preferred → subnet). Kept for fast reconnect / tests. */
export async function discoverPhone(opts: DiscoverOptions): Promise<string | null> {
  const found = await discoverPhones(opts)
  if (found.length === 0) return null
  return pickPreferredPhone(found, opts.manualIp, opts.preferredIps) ?? found[0]
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, timeoutMs)
    socket.connect(port, host, () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.on('error', () => { clearTimeout(timer); socket.destroy(); resolve(false) })
    socket.on('timeout', () => { clearTimeout(timer); socket.destroy(); resolve(false) })
  })
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
    onProgress,
  } = opts

  const hits: string[] = []
  const hitSet = new Set<string>()
  const probeMs = auth ? Math.max(timeoutMs, 500) : timeoutMs

  // Prefer recent/last/ssid peers before manualIp: a stale manual address with a
  // long timeout used to delay every reconnect even when the phone was already found.
  const ordered = orderedDiscoverIps(manualIp, preferredIps)

  // Only scan /24s where we actually expect phones (recent/manual), not every
  // secondary iface (USB tether / hotspot / VPN) — dual-/24 scans were ~510 hosts
  // and made "no phone found" loops last many minutes.
  const hosts = scanSubnet
    ? prioritizedHosts(new Set(ordered), localSubnetHosts(undefined, ordered))
    : []
  let probed = 0
  const total = ordered.length + hosts.length
  const tryOne = async (ip: string, abort?: AbortSignal): Promise<string | null> => {
    if (signal?.aborted || abort?.aborted) return null
    const start = Date.now()
    const ok = await probeSocks5(ip, socksPort, probeMs, abort ?? signal, auth)
    probed += 1
    onProgress?.(probed, total, ip)
    if (ok) {
      log('discover', 'HIT ip=%s rtt=%dms', ip, Date.now() - start)
    } else {
      if (ordered.includes(ip)) log('discover', 'UDP probe failed ip=%s rtt=%dms, trying TCP…', ip, Date.now() - start)
      const tcpOk = await probeTcp(ip, socksPort, 1000)
      if (tcpOk) log('discover', 'TCP fallback HIT ip=%s', ip)
      if (signal?.aborted || abort?.aborted) return null
      return tcpOk ? ip : null
    }
    if (signal?.aborted || abort?.aborted) return null
    return ok ? ip : null
  }

  const record = (ip: string | null) => {
    if (!ip || hitSet.has(ip)) return
    hitSet.add(ip)
    hits.push(ip)
  }

  // Abort remaining preferred probes once any preferred IP answers — do not wait
  // for a dead manualIp's full timeout when another peer already replied.
  const preferredAbort = new AbortController()
  const onOuterAbort = () => preferredAbort.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  const orderedResults = ordered.map(async (ip) => {
    const hit = await tryOne(ip, preferredAbort.signal)
    if (hit) preferredAbort.abort()
    return hit
  })
  const subnetScan =
    scanSubnet ? scanAllHosts(hosts, tryOne, concurrency, signal) : Promise.resolve<string[]>([])

  try {
    const [scannedOrdered, scannedSubnet] = await Promise.all([
      Promise.all(orderedResults),
      subnetScan,
    ])
    for (const ip of scannedOrdered) record(ip)
    for (const ip of scannedSubnet) record(ip)
  } finally {
    signal?.removeEventListener('abort', onOuterAbort)
  }
  return hits
}

/** Preferred (recent) first, then manualIp last if not already listed. */
export function orderedDiscoverIps(
  manualIp: string | null | undefined,
  preferredIps: string[] = [],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (ip: string | null | undefined) => {
    if (!ip || seen.has(ip)) return
    seen.add(ip)
    out.push(ip)
  }
  for (const ip of preferredIps) push(ip)
  push(manualIp ?? null)
  return out
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
 * Preference / single peer / current → auto. Otherwise null (UI picks).
 */
export function chooseDiscoveredPeer(opts: {
  found: string[]
  manualIp: string | null
  preferredIps: string[]
  currentIp: string | null
}): string | null {
  const { found, manualIp, preferredIps, currentIp } = opts
  return (
    pickPreferredPhone(found, manualIp, preferredIps) ??
    (found.length === 1 ? found[0] : null) ??
    (currentIp && found.includes(currentIp) ? currentIp : null)
  )
}

/** Node may report family as `'IPv4'` or numeric `4` depending on version. */
export function isIpv4Family(family: string | number): boolean {
  return family === 'IPv4' || family === 4
}

export function localIpv4Addresses(
  nets: NodeJS.Dict<os.NetworkInterfaceInfo[]> | undefined = os.networkInterfaces(),
): string[] {
  const result: string[] = []
  for (const entries of Object.values(nets ?? {})) {
    if (!entries) continue
    for (const entry of entries) {
      if (isIpv4Family(entry.family) && !entry.internal) {
        result.push(entry.address)
      }
    }
  }
  return result
}

/** Poll until a non-internal IPv4 appears (cold boot / wake), or timeout. */
export async function waitForLocalIpv4(opts?: {
  timeoutMs?: number
  pollMs?: number
  signal?: AbortSignal
}): Promise<string[]> {
  const timeoutMs = opts?.timeoutMs ?? 25_000
  const pollMs = opts?.pollMs ?? 500
  const signal = opts?.signal
  const deadline = Date.now() + timeoutMs

  for (;;) {
    if (signal?.aborted) return localIpv4Addresses()
    const ips = localIpv4Addresses()
    if (ips.length > 0) return ips
    if (Date.now() >= deadline) return ips
    await sleepMs(Math.min(pollMs, Math.max(0, deadline - Date.now())), signal)
  }
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Stable LAN fingerprint. Prefer addresses on the phone's /24 so VPN / iPhone
 * USB / hotspot interfaces do not trigger false network-change reconnects.
 */
export function networkFingerprint(
  localIps = localIpv4Addresses(),
  phoneIp?: string | null,
): string {
  let ips = localIps
  if (phoneIp) {
    const parts = phoneIp.split('.')
    if (parts.length === 4) {
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`
      const sameSubnet = localIps.filter((ip) => ip.startsWith(prefix))
      if (sameSubnet.length > 0) ips = sameSubnet
    }
  }
  return [...ips].sort().join(',')
}

/** How long probe failures may last before LOST (iPhone Wi‑Fi power-save blips). */
export const LOST_AFTER_MS = 45_000

/** True when phone silence has lasted long enough to declare LOST. */
export function shouldDeclareLost(opts: {
  firstFailAt: number | null
  now?: number
  lostAfterMs?: number
}): boolean {
  if (opts.firstFailAt == null) return false
  const now = opts.now ?? Date.now()
  const lostAfterMs = opts.lostAfterMs ?? LOST_AFTER_MS
  return now - opts.firstFailAt >= lostAfterMs
}

/**
 * /24 hosts from local IPv4s, skipping self, .0 and .255.
 * When `focusIps` is set (recent/manual phones), only scan local interfaces that
 * share a /24 with those IPs — ignore unrelated tether/VPN subnets.
 */
export function localSubnetHosts(
  localIps = localIpv4Addresses(),
  focusIps: string[] = [],
): string[] {
  const focusPrefixes = new Set<string>()
  for (const ip of focusIps) {
    const parts = ip.split('.')
    if (parts.length !== 4) continue
    focusPrefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
  }

  let scanLocals = localIps
  if (focusPrefixes.size > 0) {
    const matching = localIps.filter((ip) => {
      const parts = ip.split('.')
      if (parts.length !== 4) return false
      return focusPrefixes.has(`${parts[0]}.${parts[1]}.${parts[2]}`)
    })
    if (matching.length > 0) scanLocals = matching
  }

  const hosts: string[] = []
  const seen = new Set<string>()

  for (const ip of scanLocals) {
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
