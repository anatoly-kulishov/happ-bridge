import { Notification } from 'electron'
import { runDiagnostics } from './diagnostics'
import {
  discoverPhones,
  networkFingerprint,
  pickPreferredPhone,
} from './discover'
import { ProxyRelay, probeSocks5 } from './relay'
import { loadSettings, saveSettings } from './store'
import { isIpv4, rememberPhoneIp } from './types'
import type {
  AppSettings,
  BridgeState,
  BridgeStatus,
  DiagnosticCheck,
  UpdateInfo,
} from './types'

export type ConnectReason =
  | 'startup'
  | 'user'
  | 'watchdog-lost'
  | 'watchdog-idle'
  | 'network-change'

type SessionHooks = {
  onChange: () => void
  applyOpenAtLogin: (enabled: boolean) => void
  onFirstConnect?: () => void
}

const BASE_WATCH_MS = 8000
const MAX_IDLE_MS = 120_000
const PROBE_FAILS_NEEDED = 3
const TRAFFIC_FRESH_MS = 15_000

export class BridgeSession {
  private settings = loadSettings()
  private status: BridgeStatus = 'searching'
  private phoneIp: string | null = null
  private peers: string[] = []
  private errorMessage: string | null = null
  private diagnostics: DiagnosticCheck[] | null = null
  private updateInfo: UpdateInfo = {
    status: 'idle',
    message: 'Обновления через GitHub Releases',
  }
  private discoverAbort: AbortController | null = null
  private watchAbort: AbortController | null = null
  private connectInFlight: Promise<boolean> | null = null
  private watchRunning = false
  private disposed = false
  private netPoll: ReturnType<typeof setInterval> | null = null
  private probeFails = 0
  private idleDelayMs = BASE_WATCH_MS
  private idleFailStreak = 0
  private lastNetFp = networkFingerprint()
  private announcedFirstConnect = false
  private lastLostNotifyAt = 0

  private readonly relay: ProxyRelay
  private readonly hooks: SessionHooks

  constructor(hooks: SessionHooks) {
    this.hooks = hooks
    this.relay = new ProxyRelay(
      { socksPort: this.settings.socksPort, httpPort: this.settings.httpPort },
      (err) => {
        this.errorMessage = err.message
        this.setStatus('disconnected')
      },
    )
  }

  getState(): BridgeState {
    return {
      status: this.status,
      phoneIp: this.phoneIp,
      peers: [...this.peers],
      socksLocal: `127.0.0.1:${this.settings.socksPort}`,
      httpLocal: `127.0.0.1:${this.settings.httpPort}`,
      settings: this.settings,
      error: this.errorMessage,
      diagnostics: this.diagnostics,
      update: this.updateInfo,
    }
  }

  setUpdateInfo(info: UpdateInfo): void {
    this.updateInfo = info
    this.hooks.onChange()
  }

  getRelay(): ProxyRelay {
    return this.relay
  }

  async connect(reason: ConnectReason): Promise<boolean> {
    if (this.connectInFlight) {
      this.discoverAbort?.abort()
      await this.connectInFlight.catch(() => false)
    }

    const run = this.runConnect(reason)
    this.connectInFlight = run
    try {
      return await run
    } finally {
      if (this.connectInFlight === run) this.connectInFlight = null
    }
  }

  /** Switch to a peer from the last scan (or force-connect if still reachable). */
  async selectPhone(ip: string): Promise<BridgeState> {
    if (!isIpv4(ip)) {
      this.errorMessage = 'Некорректный IP'
      this.hooks.onChange()
      return this.getState()
    }

    this.errorMessage = null
    const ok = await probeSocks5(ip, this.settings.socksPort, 600)
    if (!ok) {
      this.errorMessage = `Happ не отвечает на ${ip}`
      this.hooks.onChange()
      return this.getState()
    }

    if (!this.peers.includes(ip)) {
      this.peers = [...this.peers, ip]
    }

    await this.relay.start(ip)
    this.phoneIp = ip
    this.probeFails = 0
    this.idleDelayMs = BASE_WATCH_MS
    this.idleFailStreak = 0
    this.settings = {
      ...this.settings,
      ...rememberPhoneIp(this.settings, ip),
      manualIp: ip,
    }
    saveSettings(this.settings)
    this.setStatus('connected')
    if (this.settings.wizardDone) this.announceReady()
    return this.getState()
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<BridgeState> {
    const prev = this.settings
    this.settings = { ...this.settings, ...patch }
    saveSettings(this.settings)
    this.hooks.applyOpenAtLogin(this.settings.openAtLogin)

    const portsChanged =
      this.settings.socksPort !== prev.socksPort ||
      this.settings.httpPort !== prev.httpPort

    if (portsChanged) {
      await this.relay.stop()
      this.relay.setPorts({
        socksPort: this.settings.socksPort,
        httpPort: this.settings.httpPort,
      })
    }

    const needsReconnect =
      this.settings.wizardDone &&
      (portsChanged || patch.manualIp !== undefined)

    if (needsReconnect) {
      await this.connect('user')
    } else {
      this.hooks.onChange()
    }

    return this.getState()
  }

  markWizardDone(): BridgeState {
    this.settings = { ...this.settings, wizardDone: true }
    saveSettings(this.settings)
    this.hooks.applyOpenAtLogin(this.settings.openAtLogin)
    this.hooks.onChange()
    if (this.status === 'connected') this.announceReady()
    return this.getState()
  }

  async diagnose(): Promise<BridgeState> {
    this.diagnostics = await runDiagnostics({
      settings: this.settings,
      phoneIp: this.phoneIp,
      relay: this.relay,
      statusConnected: this.status === 'connected',
    })
    this.hooks.onChange()
    return this.getState()
  }

  onNetworkMaybeChanged(): void {
    const fp = networkFingerprint()
    if (fp === this.lastNetFp) return
    this.lastNetFp = fp
    this.idleDelayMs = BASE_WATCH_MS
    this.idleFailStreak = 0
    void this.connect('network-change')
  }

  startWatch(): void {
    if (this.watchRunning) return
    this.watchRunning = true
    this.watchAbort = new AbortController()
    this.lastNetFp = networkFingerprint()
    // Single owner of network fingerprint (was duplicated in main setInterval).
    this.netPoll = setInterval(() => this.onNetworkMaybeChanged(), 3000)
    void this.watchLoop()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.discoverAbort?.abort()
    this.watchAbort?.abort()
    if (this.netPoll) {
      clearInterval(this.netPoll)
      this.netPoll = null
    }
    if (this.connectInFlight) await this.connectInFlight.catch(() => false)
    await this.relay.stop()
  }

  private async runConnect(reason: ConnectReason): Promise<boolean> {
    this.discoverAbort?.abort()
    this.discoverAbort = new AbortController()
    this.errorMessage = null
    this.setStatus('searching')

    try {
      const preferredIps = [
        ...this.settings.recentPhoneIps,
        ...(this.settings.lastPhoneIp ? [this.settings.lastPhoneIp] : []),
      ]

      const found = await discoverPhones({
        socksPort: this.settings.socksPort,
        preferredIps,
        manualIp: this.settings.manualIp,
        signal: this.discoverAbort.signal,
      })

      this.peers = found

      if (found.length === 0) {
        await this.relay.stop()
        this.phoneIp = null
        this.setStatus('disconnected')
        if (reason === 'user' || reason === 'watchdog-lost' || reason === 'network-change') {
          this.notifyFail(reason)
        }
        if (reason === 'watchdog-idle') this.bumpIdleBackoff()
        return false
      }

      const chosen =
        pickPreferredPhone(found, this.settings.manualIp, preferredIps) ??
        (found.length === 1 ? found[0] : null) ??
        (this.phoneIp && found.includes(this.phoneIp) ? this.phoneIp : null) ??
        (reason === 'user' ? null : found[0])

      if (!chosen) {
        await this.relay.stop()
        this.phoneIp = null
        this.setStatus('disconnected')
        this.errorMessage =
          found.length > 1
            ? `Найдено ${found.length} прокси. Выберите телефон в списке.`
            : null
        this.hooks.onChange()
        return false
      }

      await this.relay.start(chosen)
      this.phoneIp = chosen
      this.probeFails = 0
      this.idleDelayMs = BASE_WATCH_MS
      this.idleFailStreak = 0
      this.settings = {
        ...this.settings,
        ...rememberPhoneIp(this.settings, chosen),
      }
      saveSettings(this.settings)
      this.setStatus('connected')

      if (this.settings.wizardDone) this.announceReady()
      return true
    } catch (err) {
      if (this.discoverAbort.signal.aborted) return false
      this.errorMessage = err instanceof Error ? err.message : String(err)
      await this.relay.stop()
      this.phoneIp = null
      this.setStatus('disconnected')
      return false
    }
  }

  private async watchLoop(): Promise<void> {
    const signal = this.watchAbort?.signal
    while (!this.disposed) {
      const wait =
        this.status === 'disconnected' ? this.idleDelayMs : BASE_WATCH_MS
      await sleep(wait, signal)
      if (this.disposed || this.connectInFlight) continue

      if (this.status === 'connected' && this.phoneIp) {
        await this.healthCheck()
        continue
      }

      if (this.status === 'disconnected') {
        if (this.peers.length > 1 && !this.settings.manualIp && !this.settings.lastPhoneIp) {
          continue
        }
        await this.connect('watchdog-idle')
      }
    }
  }

  private async healthCheck(): Promise<void> {
    if (!this.phoneIp) return

    const trafficAge = Date.now() - this.relay.lastTrafficMs
    if (this.relay.lastTrafficMs > 0 && trafficAge < TRAFFIC_FRESH_MS) {
      this.probeFails = 0
      return
    }

    const ok = await probeSocks5(this.phoneIp, this.settings.socksPort, 500)
    if (ok) {
      this.probeFails = 0
      return
    }

    this.probeFails += 1
    if (this.probeFails < PROBE_FAILS_NEEDED) return

    this.probeFails = 0
    this.phoneIp = null
    this.relay.setPhoneIp(null)
    this.setStatus('disconnected')
    this.notifyLostOnce()
    await this.connect('watchdog-lost')
  }

  private bumpIdleBackoff(): void {
    this.idleFailStreak += 1
    this.idleDelayMs = Math.min(
      MAX_IDLE_MS,
      BASE_WATCH_MS * 2 ** Math.min(this.idleFailStreak, 4),
    )
  }

  private notifyFail(reason: ConnectReason): void {
    if (reason === 'watchdog-lost') {
      if (Date.now() - this.lastLostNotifyAt < 60_000) return
    }
    notify(
      'Телефон не найден',
      'Проверьте Wi‑Fi и тумблер «Разрешить LAN подключение» в Happ.',
    )
  }

  private notifyLostOnce(): void {
    const now = Date.now()
    if (now - this.lastLostNotifyAt < 60_000) return
    this.lastLostNotifyAt = now
    notify('Связь с телефоном потеряна', 'Ищем телефон в сети…')
  }

  private announceReady(): void {
    if (this.announcedFirstConnect || this.status !== 'connected') return
    this.announcedFirstConnect = true
    notify(
      'Happ Bridge готов',
      'Можно закрыть окно. Адреса в меню строки меню - 127.0.0.1 не меняется.',
    )
    this.hooks.onFirstConnect?.()
  }

  private setStatus(next: BridgeStatus): void {
    this.status = next
    this.hooks.onChange()
  }
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
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
