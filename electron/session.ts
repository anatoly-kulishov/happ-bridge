import { Notification } from 'electron'
import { discoverPhone } from './discover'
import { ProxyRelay, probePort } from './relay'
import { loadSettings, saveSettings } from './store'
import type { AppSettings, BridgeState, BridgeStatus } from './types'

export type ConnectReason = 'startup' | 'user' | 'watchdog-lost' | 'watchdog-idle'

type SessionHooks = {
  onChange: () => void
  applyOpenAtLogin: (enabled: boolean) => void
}

const WATCH_MS = 8000

export class BridgeSession {
  private settings = loadSettings()
  private status: BridgeStatus = 'searching'
  private phoneIp: string | null = null
  private errorMessage: string | null = null
  private discoverAbort: AbortController | null = null
  private connectInFlight: Promise<boolean> | null = null
  private watchRunning = false
  private disposed = false

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
      socksLocal: `127.0.0.1:${this.settings.socksPort}`,
      httpLocal: `127.0.0.1:${this.settings.httpPort}`,
      settings: this.settings,
      error: this.errorMessage,
    }
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
    return this.getState()
  }

  startWatch(): void {
    if (this.watchRunning) return
    this.watchRunning = true
    void this.watchLoop()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.discoverAbort?.abort()
    if (this.connectInFlight) await this.connectInFlight.catch(() => false)
    await this.relay.stop()
  }

  private async runConnect(reason: ConnectReason): Promise<boolean> {
    this.discoverAbort?.abort()
    this.discoverAbort = new AbortController()
    this.errorMessage = null
    this.setStatus('searching')

    try {
      const found = await discoverPhone({
        socksPort: this.settings.socksPort,
        preferredIp: this.settings.lastPhoneIp,
        manualIp: this.settings.manualIp,
        signal: this.discoverAbort.signal,
      })

      if (!found) {
        await this.relay.stop()
        this.phoneIp = null
        this.setStatus('disconnected')
        if (reason === 'user' || reason === 'watchdog-lost') {
          notify(
            'Телефон не найден',
            'Проверьте Wi‑Fi и тумблер «Разрешить LAN подключение» в Happ.',
          )
        }
        return false
      }

      await this.relay.start(found)
      this.phoneIp = found
      this.settings = { ...this.settings, lastPhoneIp: found }
      saveSettings(this.settings)
      this.setStatus('connected')
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
    while (!this.disposed) {
      await sleep(WATCH_MS)
      if (this.disposed || this.connectInFlight) continue

      if (this.status === 'connected' && this.phoneIp) {
        const ok = await probePort(this.phoneIp, this.settings.socksPort, 500)
        if (!ok) {
          await this.relay.stop()
          this.phoneIp = null
          this.setStatus('disconnected')
          notify('Связь с телефоном потеряна', 'Ищем телефон в сети…')
          await this.connect('watchdog-lost')
        }
        continue
      }

      if (this.status === 'disconnected') {
        await this.connect('watchdog-idle')
      }
    }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
