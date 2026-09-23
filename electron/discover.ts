import os from 'node:os'
import { probePort } from './relay'

export type DiscoverOptions = {
  socksPort: number
  preferredIp?: string | null
  manualIp?: string | null
  concurrency?: number
  timeoutMs?: number
  signal?: AbortSignal
}

/** Order: manual IP → last known IP → scan local /24 subnets. */
export async function discoverPhone(opts: DiscoverOptions): Promise<string | null> {
  const {
    socksPort,
    preferredIp,
    manualIp,
    concurrency = 64,
    timeoutMs = 350,
    signal,
  } = opts

  const tryOne = async (ip: string): Promise<string | null> => {
    if (signal?.aborted) return null
    const ok = await probePort(ip, socksPort, timeoutMs)
    return ok ? ip : null
  }

  const ordered: string[] = []
  if (manualIp) ordered.push(manualIp)
  if (preferredIp && preferredIp !== manualIp) ordered.push(preferredIp)

  for (const ip of ordered) {
    const hit = await tryOne(ip)
    if (hit) return hit
  }

  return scanHosts(localSubnetHosts(), tryOne, concurrency, signal)
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

async function scanHosts(
  hosts: string[],
  tryOne: (ip: string) => Promise<string | null>,
  concurrency: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (hosts.length === 0) return null

  const localAbort = new AbortController()
  const onOuterAbort = () => localAbort.abort()
  signal?.addEventListener('abort', onOuterAbort, { once: true })

  let index = 0
  let winner: string | null = null

  const worker = async (): Promise<void> => {
    while (!localAbort.signal.aborted && index < hosts.length) {
      const i = index++
      const hit = await tryOne(hosts[i])
      if (hit && !winner) {
        winner = hit
        localAbort.abort()
        return
      }
    }
  }

  const n = Math.min(concurrency, hosts.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  signal?.removeEventListener('abort', onOuterAbort)
  return winner
}
