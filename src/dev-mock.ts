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
          { id: 'wifi', status: 'ok' as const, label: 'Wi‑Fi / локальная сеть', detail: 'Компьютер в сети: 192.168.0.10' },
          { id: 'happ', status: 'ok' as const, label: 'Happ на телефоне', detail: 'Happ отвечает на 192.168.0.244:10808 (логин ок)' },
          { id: 'auth', status: 'ok' as const, label: 'Пароль LAN', detail: 'Не задан. В Happ можно включить логин/пароль для LAN.' },
          { id: 'relay', status: 'ok' as const, label: 'Локальный мост', detail: 'Мост работает: сквозная проверка 127.0.0.1:10808 прошла' },
          { id: 'bridge', status: 'ok' as const, label: 'Статус моста', detail: 'Подключено к 192.168.0.244' },
          { id: 'inject', status: 'ok' as const, label: 'Прописка в приложения', detail: 'прописано: Cursor, WebStorm' },
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
          message: 'Найдена версия 1.2.0. Скачиваем… 0%',
          version: '1.2.0',
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
            message: `Скачиваем 1.2.0… ${progress}%`,
            version: '1.2.0',
            progress,
          },
        }
        broadcast(state)
      }
      state = {
        ...state,
        update: {
          status: 'available',
          message: 'Версия 1.2.0 скачана — перезапустите приложение для установки.',
          version: '1.2.0',
          progress: 100,
        },
      }
      broadcast(state)
      return clone(state)
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
          message: `${id} — прописано`,
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
          message: `${id} — откатлено`,
        })),
      }
    },
    injectRelaunchOffer: async (targets: InjectTarget[]) => {
      return {
        restarted: false,
        results: targets.map((id) => ({ id, ok: true, message: `${id} — нужен перезапуск` })),
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