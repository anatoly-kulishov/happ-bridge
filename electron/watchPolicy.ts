import type { BridgeStatus } from './types'

/** Baseline tick while connecting / unstable. */
export const BASE_WATCH_MS = 3_000
/** Stable connected: slower health ticks (traffic still short-circuits probes). */
export const CONNECTED_WATCH_MS = 5_000
/** Interface fingerprint poll — cheaper than a second health loop. */
export const NET_POLL_MS = 5_000
export const MAX_IDLE_MS = 120_000
/** Cap backoff while LAN IP is up but phone still missing (TCC / phone waking). */
export const SOFT_IDLE_MS = 15_000

/** How long watchLoop should sleep before the next tick. */
export function watchDelayMs(status: BridgeStatus, idleDelayMs: number): number {
  switch (status) {
    case 'disconnected':
      return idleDelayMs
    case 'connected':
      return CONNECTED_WATCH_MS
    case 'searching':
    case 'unstable':
      return BASE_WATCH_MS
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

/** Exponential idle backoff, capped for LAN-up vs offline. */
export function nextIdleDelayMs(failStreak: number, lanUp: boolean): number {
  const cap = lanUp ? SOFT_IDLE_MS : MAX_IDLE_MS
  return Math.min(cap, BASE_WATCH_MS * 2 ** Math.min(failStreak, 4))
}
