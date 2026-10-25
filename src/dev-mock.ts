import type {
  InjectBatchResult,
  InjectTarget,
  InjectTargetInfo,
} from '../electron/inject'
import type { BridgeState } from '../electron/types'
import { DEFAULT_SETTINGS } from '../electron/types'

const baseState: BridgeState = {
  status: 'connected',
  phoneIp: '192.168.0.244',
  peers: ['192.168.0.244'],
  socksLocal: '127.0.0.1:10808',
  httpLocal: '127.0.0.1:10809',
  settings: {
    ...DEFAULT_SETTINGS,
    wizardDone: true,
    enabled: true,
    openAtLogin: true,
    socksPort: 10808,
    httpPort: 10809,
    manualIp: null,
    proxyUser: null,
    proxyPassword: null,
    homeSsids: ['HomeBox'],
    ssidPeers: {},
    lastPhoneIp: '192.168.0.244',
    recentPhoneIps: ['192.168.0.244'],
    seamlessAppProxy: false,
    injectTargets: [],
  },
  error: null,
  diagnostics: null,
  update: {
    status: 'idle',
    message: 'Обновления через GitHub Releases',
  },
  wifiSsid: 'HomeBox',
  isHomeNetwork: true,
  lanAuthOn: false,
  publicWifiNoAuth: false,
  paused: false,
  lanPasswordSet: false,
  scan: null,
}

let state: BridgeState = { ...baseState }

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

const injectTargetsInfo: InjectTargetInfo[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    available: true,
    applied: false,
    path: '/Users/demo/Library/Application Support/Cursor/User/settings.json',
    detail: '/Users/demo/Library/Application Support/Cursor/User/settings.json',
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    available: false,
    applied: false,
    path: null,
    detail: 'Не найдена папка WebStorm',
  },
  {
    id: 'firefox',
    label: 'Firefox',
    available: true,
    applied: false,
    path: '/Users/demo/Library/Application Support/Firefox/Profiles/…',
    detail: '/Users/demo/Library/Application Support/Firefox/Profiles/…',
  },
  {
    id: 'codex',
    label: 'CLI / Терминал',
    available: true,
    applied: true,
    path: '/Users/demo/.bash_profile',
    detail: '~/.bash_profile — env для всех CLI (codex, claude, curl…)',
  },
]

export function installDevMock() {
  if (typeof window === 'undefined') return
  if ('happBridge' in window) return

  const listeners = new Set<(s: BridgeState) => void>()
  const broadcast = (s: BridgeState) => listeners.forEach((cb) => cb(clone(s)))

  const api = {
    getState: async (): Promise<BridgeState> => clone(state),
    findPhone: async (): Promise<{ ok: boolean; state: BridgeState }> => {
      state = { ...state, status: 'searching', scan: { done: 0, total: 64 } }
      broadcast(state)
      await delay(1200)
      state = {
        ...state,
        status: 'connected',
        phoneIp: '192.168.0.244',
        peers: ['192.168.0.244'],
        scan: null,
      }
      broadcast(state)
      return { ok: true, state: clone(state) }
    },
    scanPeers: async (): Promise<BridgeState> => {
      state = { ...state, scan: { done: 0, total: 64 } }
      broadcast(state)
      await delay(800)
      state = { ...state, peers: ['192.168.0.244'], scan: null }
      broadcast(state)
      return clone(state)
    },
    copyDiagnostics: async (): Promise<string> => 'mock diagnostics',
    disconnect: async (): Promise<BridgeState> => {
      state = { ...state, status: 'disconnected', phoneIp: null }
      broadcast(state)
      return clone(state)
    },
    setEnabled: async (enabled: boolean): Promise<BridgeState> => {
      state = {
        ...state,
        settings: { ...state.settings, enabled },
        status: enabled ? 'searching' : 'disconnected',
        paused: !enabled,
        phoneIp: enabled ? state.phoneIp : null,
      }
      if (enabled) {
        state = { ...state, scan: { done: 0, total: 64 } }
        broadcast(state)
        await delay(800)
        state = { ...state, status: 'connected', phoneIp: '192.168.0.244', scan: null }
      }
      broadcast(state)
      return clone(state)
    },
    selectPhone: async (ip: string): Promise<BridgeState> => {
      state = { ...state, status: 'connected', phoneIp: ip, peers: [ip] }
      broadcast(state)
      return clone(state)
    },
    testPhone: async (ip: string) => {
      await delay(600)
      const silent = ip.endsWith('.13')
      return {
        ok: !silent,
        authCheck: silent ? ('unreachable' as const) : ('ok' as const),
        tcp: !ip.endsWith('.12'),
        ip,
        socksPort: state.settings.socksPort,
      }
    },
    applyManualIp: async (ip: string): Promise<BridgeState> => {
      state = {
        ...state,
        status: 'connected',
        phoneIp: ip,
        peers: [ip],
        settings: { ...state.settings, enabled: true, manualIp: ip },
      }
      broadcast(state)
      return clone(state)
    },
    copy: async (kind: string): Promise<string> => {
      void kind
      return 'copied'
    },
    saveSettings: async (patch: Partial<BridgeState['settings']>): Promise<BridgeState> => {
      state = { ...state, settings: { ...state.settings, ...patch } }
      broadcast(state)
      return clone(state)
    },
    finishWizard: async (): Promise<BridgeState> => {
      state = { ...state, settings: { ...state.settings, wizardDone: true } }
      broadcast(state)
      return clone(state)
    },
    markHomeNetwork: async (): Promise<BridgeState> => {
      state = { ...state, isHomeNetwork: true }
      broadcast(state)
      return clone(state)
    },
    diagnose: async (): Promise<BridgeState> => {
      state = {
        ...state,
        diagnostics: [
          { id: 'ports', status: 'ok' as const, label: 'Локальные порты', detail: 'SOCKS 127.0.0.1:10808 · HTTP 127.0.0.1:10809 слушают' },
          { id: 'cli', status: 'ok' as const, label: 'CLI / Терминал', detail: 'Прописан в ~/.bash_profile: новые терминалы и OpenCode ходят через мост (socks5://127.0.0.1:10808)' },
          { id: 'apps', status: 'warn' as const, label: 'Приложения', detail: 'Не прописано ни одно приложение. В карточке «Приложения» нажмите «Прописать» у нужного — иначе оно ходит напрямую.' },
          { id: 'network', status: 'ok' as const, label: 'Wi‑Fi / сеть', detail: 'Mac в сети: 192.168.0.10 · Wi‑Fi: HomeBox · домашняя сеть' },
          { id: 'phone', status: 'ok' as const, label: 'Телефон (TCP)', detail: 'TCP 192.168.0.244:10808 отвечает — телефон в этой сети и порт открыт' },
          { id: 'happ', status: 'fail' as const, label: 'Happ (SOCKS5)', detail: 'Телефон отвечает по TCP, но Happ молчит на 192.168.0.244:10808. Обычно он спит: разблокируйте телефон, откройте Happ и нажмите «Повторить».', action: 'retry' as const },
          { id: 'relay', status: 'warn' as const, label: 'Сквозная проверка', detail: 'Телефон не подключён — порт работает в режиме fail-open: трафик приложений идёт напрямую через Mac, а не через телефон.' },
        ],
      }
      broadcast(state)
      return clone(state)
    },
    checkUpdates: async (): Promise<BridgeState> => {
      state = {
        ...state,
        update: { status: 'checking', message: 'Проверяем обновления…' },
      }
      broadcast(state)
      await delay(400)
      state = {
        ...state,
        update: {
          status: 'downloading',
          message: 'Найдена версия 1.2.1. Скачиваем… 0%',
          version: '1.2.1',
          progress: 0,
        },
      }
      broadcast(state)
      for (const progress of [18, 42, 67, 91, 100]) {
        await delay(250)
        state = {
          ...state,
          update: {
            status: 'downloading',
            message: `Скачиваем 1.2.1… ${progress}%`,
            version: '1.2.1',
            progress,
          },
        }
        broadcast(state)
      }
      state = {
        ...state,
        update: {
          status: 'available',
          message: 'Версия 1.2.1 скачана. Нажмите «Установить».',
          version: '1.2.1',
          progress: 100,
        },
      }
      broadcast(state)
      return clone(state)
    },
    installUpdate: async (): Promise<void> => {
      state = {
        ...state,
        update: {
          status: 'not-available',
          message: 'У вас актуальная версия 1.2.1',
          version: '1.2.1',
        },
      }
      broadcast(state)
    },
    injectStatus: async (): Promise<InjectTargetInfo[]> => clone(injectTargetsInfo),
    injectApply: async (targets: InjectTarget[]): Promise<InjectBatchResult> => {
      return {
        status: injectTargetsInfo.map((t) => ({
          ...t,
          applied: targets.includes(t.id) ? true : t.applied,
        })),
        results: targets.map((id) => ({
          id,
          ok: true,
          message: `${id}: прописано`,
        })),
      }
    },
    injectRevert: async (targets: InjectTarget[]): Promise<InjectBatchResult> => {
      return {
        status: injectTargetsInfo.map((t) => ({
          ...t,
          applied: targets.includes(t.id) ? false : t.applied,
        })),
        results: targets.map((id) => ({
          id,
          ok: true,
          message: `${id}: откачено`,
        })),
      }
    },
    injectRelaunchOffer: async (targets: InjectTarget[]) => {
      return {
        restarted: false,
        results: targets.map((id) => ({ id, ok: true, message: `${id}: нужен перезапуск` })),
      }
    },
    onState: (cb: (s: BridgeState) => void): (() => void) => {
      listeners.add(cb)
      cb(clone(state))
      return () => listeners.delete(cb)
    },
  }

  Object.assign(window, { happBridge: api })
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}