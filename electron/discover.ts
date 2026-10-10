import net from 'node:net'
import os from 'node:os'
import { probeSocks5, trackAbortSocket, type SocksAuth } from './relay'
import { log } from './log'

export type DiscoverOptions = {
  socksPort: number
  preferredIps?: string[]
  manualIp?: string | null
  concurrency?: number
  timeoutMs?: number
  /** Probe timeout for the bulk subnet sweep (not preferred IPs). Cold boot
   * gives preferred IPs a long timeout to catch a sleepy phone, but the sweep
   * must stay fast so a missed phone doesn't stall the retry cycle. */
  sweepTimeoutMs?: number
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

/** Whether the host accepts TCP connections (kernel-accept — the earliest sign
 * a sleeping phone is waking). A bare accept does not mean Happ answers yet.
 * Abort-aware: cancelled probes settle fast and never report a hit. Uses the
 * shared single-listener-per-signal tracker to avoid MaxListenersExceeded. */
export function probeTcp(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }
    const socket = new net.Socket()
    let settled = false
    const untrack = trackAbortSocket(signal, socket)
    const timer = setTimeout(() => done(false), timeoutMs)
    function done(ok: boolean) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      untrack()
      socket.destroy()
      resolve(ok)
    }
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
    socket.on('timeout', () => done(false))
    // destroy() on abort emits 'close' (not always 'error') — settle fast.
    socket.on('close', () => done(false))
    socket.connect(port, host)
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
    sweepTimeoutMs,
    signal,
    scanSubnet = true,
    auth = null,
    onProgress,
  } = opts

  const hits: string[] = []
  const hitSet = new Set<string>()
  // Preferred/manual IPs deserve a long probe (a sleepy phone answers slow);
  // the sweep stays quick so a failed find doesn't stall the retry cycle.
  const probeMs = auth ? Math.max(timeoutMs, 500) : timeoutMs
  const sweepMs = auth
    ? Math.max(sweepTimeoutMs ?? 500, 500)
    : (sweepTimeoutMs ?? 350)

  // Prefer recent/last/ssid peers before manualIp: a stale manual address with a
  // long timeout used to delay every reconnect even when the phone was already found.
  const ordered = orderedDiscoverIps(manualIp, preferredIps)
  const orderedSet = new Set(ordered)

  // Only scan /24s where we actually expect phones (recent/manual), not every
  // secondary iface (USB tether / hotspot / VPN) — dual-/24 scans were ~510 hosts
  // and made "no phone found" loops last many minutes.
  const hosts = scanSubnet
    ? prioritizedHosts(new Set(ordered), localSubnetHosts(undefined, ordered))
    : []
  const livePreferred = livePreferredIps(ordered)
  const stalePreferred = ordered.filter((ip) => !livePreferred.includes(ip))
  let probed = 0
  let total = ordered.length + hosts.length
  if (stalePreferred.length > 0) {
    log('discover', 'preferred off-net (stale, not routed): %o — sweep %d hosts / total %d',
      stalePreferred, hosts.length, total)
  } else {
    log('discover', 'probe scope: preferred=%d (live=%d) sweep=%d total=%d',
      ordered.length, livePreferred.length, hosts.length, total)
  }
  const discoverStart = Date.now()
  const tryOne = async (ip: string, abort?: AbortSignal): Promise<string | null> => {
    if (signal?.aborted || abort?.aborted) return null
    const start = Date.now()
    const hostMs = orderedSet.has(ip) ? probeMs : sweepMs
    const ok = await probeSocks5(ip, socksPort, hostMs, abort ?? signal, auth)
    probed += 1
    onProgress?.(probed, total, ip)
    if (ok) {
      log('discover', 'HIT ip=%s rtt=%dms', ip, Date.now() - start)
    } else {
      if (ordered.includes(ip)) log('discover', 'UDP probe failed ip=%s rtt=%dms, trying TCP…', ip, Date.now() - start)
      const tcpOk = await probeTcp(ip, socksPort, 1000, abort ?? signal)
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

    // Focused miss + other live ifaces (late VPN): one fallback sweep of the
    // interfaces that focus skipped. Preferred/manual were already probed above.
    if (hits.length === 0 && scanSubnet && !signal?.aborted) {
      const extraHosts = prioritizedHosts(
        new Set([...ordered, ...hosts]),
        unfocusedSubnetHosts(ordered),
      )
      if (extraHosts.length > 0) {
        total += extraHosts.length
        log(
          'discover',
          'focused miss — fallback sweep %d hosts on other iface(s)',
          extraHosts.length,
        )
        const scannedExtra = await scanAllHosts(extraHosts, tryOne, concurrency, signal)
        for (const ip of scannedExtra) record(ip)
      }
    }
  } finally {
    signal?.removeEventListener('abort', onOuterAbort)
  }
  log('discover', 'done probed=%d hosts=%d hits=%o in %dms', probed, total, hits, Date.now() - discoverStart)
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

/** Local IPv4 endpoint with its real netmask length (CIDR host bits, e.g. 24/16/23). */
export type LocalIpInfo = { address: string; maskBits: number }

function ipv4Parts(ip: string): number[] | null {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  return p
}

/** True when two IPv4s belong to the same network given a CIDR mask length. */
export function sameNetwork(a: string, b: string, maskBits: number): boolean {
  const pa = ipv4Parts(a)
  const pb = ipv4Parts(b)
  if (!pa || !pb) return false
  const bits = Math.min(Math.max(maskBits, 0), 32)
  const ma = (((pa[0] << 24) | (pa[1] << 16) | (pa[2] << 8) | pa[3]) >>> 0)
  const mb = (((pb[0] << 24) | (pb[1] << 16) | (pb[2] << 8) | pb[3]) >>> 0)
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0)
  return (ma & mask) === (mb & mask)
}

/** Dotted netmask → CIDR host bits (255.255.255.0 → 24). */
function netmaskToBits(netmask: string | undefined): number | null {
  if (!netmask) return null
  const parts = netmask.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null
  let bits = 0
  for (let i = 0; i < 4; i++) {
    const n = parts[i]
    for (let b = 7; b >= 0; b--) {
      if (n & (1 << b)) bits++
    }
  }
  return bits
}

/** Real netmask/cidr for a local address (from os.networkInterfaces), or null if unknown. */
export function maskBitsOf(
  address: string,
  nets: NodeJS.Dict<os.NetworkInterfaceInfo[]> | undefined = os.networkInterfaces(),
): number | null {
  for (const entries of Object.values(nets ?? {})) {
    if (!entries) continue
    for (const entry of entries) {
      if (!isIpv4Family(entry.family) || entry.internal) continue
      if (entry.address !== address) continue
      const m = /\/(\d+)$/.exec(entry.cidr ?? '')
      if (m) return Number(m[1])
      return netmaskToBits(entry.netmask)
    }
  }
  return null
}

/** All hosts in a subnet (CIDR host bits) except the given self address. */
export function subnetHostsFor(ip: string, maskBits: number): string[] {
  const p = ipv4Parts(ip)
  if (!p || maskBits < 0 || maskBits > 32) return []
  const base = (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0)
  const mask = maskBits === 0 ? 0 : ((0xffffffff << (32 - maskBits)) >>> 0)
  const network = base & mask
  const width = 1 << (32 - maskBits)
  const hosts: string[] = []
  // skip network address (host 0) and broadcast (host last)
  for (let i = 1; i < width - 1; i++) {
    const addr = (network + i) >>> 0
    hosts.push(`${addr >>> 24}.${(addr >>> 16) & 0xff}.${(addr >>> 8) & 0xff}.${addr & 0xff}`)
  }
  return hosts
}

/** Normalize mixed string[] / LocalIpInfo[] inputs, resolving real masks for bare addresses. */
function normLocals(locals: Array<string | LocalIpInfo>): LocalIpInfo[] {
  return locals.map((l) => {
    if (typeof l === 'string') return { address: l, maskBits: maskBitsOf(l) ?? 24 }
    return l
  })
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

/**
 * After first IPv4: if preferred/manual peers exist but none share a live local
 * subnet (typical late OpenVPN / utun), keep polling until a covering iface
 * appears or `routeTimeoutMs` elapses. Does not replace FAST_RECOVERY_WINDOW —
 * covers "VPN later than ~60s" so netPoll/discover can see the route.
 */
export async function waitForPhoneRoute(opts?: {
  preferredIps?: string[]
  /** Wait for first IPv4 (same as waitForLocalIpv4). */
  ipv4TimeoutMs?: number
  /** Extra wait for a route covering preferred IPs. */
  routeTimeoutMs?: number
  pollMs?: number
  signal?: AbortSignal
}): Promise<string[]> {
  const pollMs = opts?.pollMs ?? 500
  const signal = opts?.signal
  const preferred = (opts?.preferredIps ?? []).filter((ip) => ipv4Parts(ip) !== null)

  await waitForLocalIpv4({
    timeoutMs: opts?.ipv4TimeoutMs ?? 25_000,
    pollMs,
    signal,
  })
  if (signal?.aborted || preferred.length === 0) return localIpv4Addresses()
  if (livePreferredIps(preferred).length > 0) return localIpv4Addresses()

  const routeTimeoutMs = opts?.routeTimeoutMs ?? 45_000
  const deadline = Date.now() + routeTimeoutMs
  log('discover', 'waitForPhoneRoute: preferred off-route, waiting up to %dms…', routeTimeoutMs)
  while (!signal?.aborted && Date.now() < deadline) {
    await sleepMs(Math.min(pollMs, Math.max(0, deadline - Date.now())), signal)
    if (signal?.aborted) break
    if (livePreferredIps(preferred).length > 0) {
      log('discover', 'waitForPhoneRoute: route up localIps=%o', localIpv4Addresses())
      return localIpv4Addresses()
    }
  }
  return localIpv4Addresses()
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
 * Stable LAN fingerprint over all non-internal IPv4s. Includes VPN/utun so a
 * late OpenVPN connect after reboot triggers netPoll reconnect (phone-/24
 * filtering previously hid utun when the remembered peer was on Wi‑Fi).
 */
export function networkFingerprint(localIps = localIpv4Addresses()): string {
  return [...localIps].sort().join(',')
}

/** How long probe failures may last before LOST (phone Wi‑Fi power-save blips). */
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
 * Preferred IPs that belong to a live non-internal local subnet (using the real
 * netmask, not a hardcoded /24), in order. Filters stale addresses from old
 * networks (e.g. a phone previously seen on a VPN subnet that is down now) so
 * recovery polling does not burn time on hosts that cannot be routed from the
 * current interfaces. When the VPN is up its utun IPv4 is a live interface, so
 * a VPN-routable phone is still kept. A peer anywhere in the same /16, /23 etc.
 * is kept, not just same-/24.
 */
export function livePreferredIps(
  preferredIps: string[],
  localIps: Array<string | LocalIpInfo> = localIpv4Addresses(),
): string[] {
  const locals = normLocals(localIps)
  const out: string[] = []
  for (const ip of preferredIps) {
    if (ipv4Parts(ip) === null) continue
    if (locals.some((li) => sameNetwork(ip, li.address, li.maskBits))) out.push(ip)
  }
  return out
}

// Cap the broad-sweep host list. On a /24 that is 254 hosts; /23 → 510; /22 →
// 1022. Subnets wider than this are not swept exhaustively (a /16 sweep would
// be ~65k hosts / minutes). Phones on such broad nets are still covered by the
// netmask-aware livePreferredIps recovery poll.
export const MAX_SUBNET_HOSTS = 1024

/**
 * Hosts on the real local subnets (netmask-aware), skipping self, .0 and .255.
 * When `focusIps` is set (recent/manual phones), only scan local interfaces that
 * share a mask with those IPs — ignore unrelated tether/VPN subnets. Subnets
 * broader than MAX_SUBNET_HOSTS fall back to their own /24 to avoid a sweep DoS.
 */
export function localSubnetHosts(
  localIps: Array<string | LocalIpInfo> = localIpv4Addresses(),
  focusIps: string[] = [],
): string[] {
  let scanLocals = normLocals(localIps)

  if (focusIps.length > 0) {
    const matching = scanLocals.filter((li) =>
      focusIps.some((f) => ipv4Parts(f) !== null && sameNetwork(f, li.address, li.maskBits)),
    )
    if (matching.length > 0) scanLocals = matching
  }

  const hosts: string[] = []
  const seen = new Set<string>()

  for (const li of scanLocals) {
    // Decide up front (before building a potentially huge array) whether the real
    // subnet fits under the cap; wider nets fall back to the local /24 to avoid a
    // sweep DoS while the netmask-aware livePreferredIps poll still covers them.
    const width = li.maskBits >= 32 ? 2 : 1 << (32 - li.maskBits)
    const maskBits =
      width <= MAX_SUBNET_HOSTS + 2 ? li.maskBits : 24
    for (const host of subnetHostsFor(li.address, maskBits)) {
      if (host === li.address || seen.has(host)) continue
      seen.add(host)
      hosts.push(host)
    }
  }

  return hosts
}

/**
 * Hosts on live local ifaces that a focused scan would skip (e.g. late VPN /
 * utun while recent peers are on Wi‑Fi). Empty when focus matches nothing
 * (focused path already sweeps all locals) or every iface is in focus.
 */
export function unfocusedSubnetHosts(
  focusIps: string[],
  localIps: Array<string | LocalIpInfo> = localIpv4Addresses(),
): string[] {
  if (focusIps.length === 0) return []
  const locals = normLocals(localIps)
  const matching = locals.filter((li) =>
    focusIps.some((f) => ipv4Parts(f) !== null && sameNetwork(f, li.address, li.maskBits)),
  )
  if (matching.length === 0 || matching.length >= locals.length) return []
  const skipped = locals.filter(
    (li) => !matching.some((m) => m.address === li.address && m.maskBits === li.maskBits),
  )
  return localSubnetHosts(skipped, [])
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
