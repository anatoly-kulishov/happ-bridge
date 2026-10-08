import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Save,
  Gauge,
  Home,
  RefreshCw,
  Search,
  Plug,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { BridgeState, DiagnosticCheck } from '../../electron/types'
import { DEFAULT_SETTINGS } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
import { AlertBanner, parseBridgeError } from './AlertBanner'
import { Card } from './Card'
import { InjectAppsPanel } from './InjectAppsPanel'
import { PeerList } from './PeerList'
import { ProxyCopyButton } from './ProxyCopyButton'
import { StatusBadge } from './StatusBadge'
import { Switch } from './Switch'

type Props = {
  state: BridgeState
  onState: (s: BridgeState) => void
  onShowWizard: () => void
}

const PRESETS: { id: 'telegram' | 'cursor'; label: string; icon: React.ElementType; proto: string }[] = [
  { id: 'telegram', label: 'Telegram', icon: Copy, proto: 'SOCKS5' },
  { id: 'cursor', label: 'Cursor / IDE', icon: Copy, proto: 'HTTP' },
]

export function Settings({ state, onState, onShowWizard }: Props) {
  const [manualIp, setManualIp] = useState(state.settings.manualIp ?? '')
  const [socksPort, setSocksPort] = useState(String(state.settings.socksPort))
  const [httpPort, setHttpPort] = useState(String(state.settings.httpPort))
  const [proxyUser, setProxyUser] = useState(state.settings.proxyUser ?? '')
  const [proxyPassword, setProxyPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [openAtLogin, setOpenAtLogin] = useState(state.settings.openAtLogin)
  const [saved, setSaved] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const advancedRef = useRef<HTMLDivElement>(null)
  const { busy, copied, findPhone, scanPeers, scanning, copy, diagnose, checkUpdates } =
    useBridgeActions(onState)

  const openPortsSettings = () => {
    setAdvanced(true)
    window.requestAnimationFrame(() => {
      advancedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
  const [saving, setSaving] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [markingHome, setMarkingHome] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [diagHidden, setDiagHidden] = useState(false)
  const [diagCopied, setDiagCopied] = useState(false)

  const bridgeActive = state.settings.enabled && state.status !== 'disconnected'
  const connected = state.status === 'connected'
  const bridgeError = state.error ? parseBridgeError(state.error) : null

  const dirty =
    manualIp.trim() !== (state.settings.manualIp ?? '') ||
    socksPort !== String(state.settings.socksPort) ||
    httpPort !== String(state.settings.httpPort) ||
    proxyUser.trim() !== (state.settings.proxyUser ?? '') ||
    proxyPassword.length > 0 ||
    clearPassword

  const selectPeer = async (ip: string) => {
    if (ip === state.phoneIp) return
    setSelecting(true)
    try {
      onState(await window.happBridge.selectPhone(ip))
    } finally {
      setSelecting(false)
    }
  }

  const markHome = async () => {
    setMarkingHome(true)
    try {
      onState(await window.happBridge.markHomeNetwork())
    } finally {
      setMarkingHome(false)
    }
  }

  const toggleBridge = async (on: boolean) => {
    setToggling(true)
    try {
      onState(await window.happBridge.setEnabled(on))
    } finally {
      setToggling(false)
    }
  }

  const copyDiagnostics = async () => {
    await window.happBridge.copyDiagnostics()
    setDiagCopied(true)
    window.setTimeout(() => setDiagCopied(false), 1500)
  }

  const save = async () => {
    setSaving(true)
    try {
      const user = proxyUser.trim() || null
      const patch: Parameters<typeof window.happBridge.saveSettings>[0] = {
        manualIp: manualIp.trim() || null,
        socksPort: parsePort(socksPort, DEFAULT_SETTINGS.socksPort),
        httpPort: parsePort(httpPort, DEFAULT_SETTINGS.httpPort),
        proxyUser: user,
        openAtLogin,
      }
      if (proxyPassword.length > 0) {
        patch.proxyPassword = proxyPassword
      } else if (clearPassword) {
        patch.proxyPassword = null
      }
      const next = await window.happBridge.saveSettings(patch)
      onState(next)
      setProxyPassword('')
      setClearPassword(false)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pt-5 pb-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Happ Bridge</h1>
            <p className="text-xs text-zinc-500">Мост к Happ SOCKS5/HTTP</p>
          </div>
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? 'bg-emerald-400' : state.settings.enabled ? 'bg-amber-400' : 'bg-zinc-500'
            }`}
            title={connected ? 'Подключено' : state.settings.enabled ? 'Поиск' : 'Выключено'}
          />
        </header>

        <Card title="Соединение">
          <StatusBadge
            status={state.status}
            phoneIp={state.phoneIp}
            lanAuthOn={state.lanAuthOn}
            enabled={state.settings.enabled}
            paused={state.paused}
            scan={state.scan}
          />

          <div className="mt-3">
            <Switch
              checked={state.settings.enabled}
              onChange={(checked) => void toggleBridge(checked)}
              label="Мост к Happ"
              disabled={toggling}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || toggling}
              onClick={() => {
                setDiagHidden(false)
                void findPhone()
              }}
              className="btn-secondary flex items-center gap-1.5 text-xs"
            >
              <Search size={14} />
              {busy ? 'Ищем…' : state.settings.enabled ? 'Найти снова' : 'Включить и найти'}
            </button>
          </div>

          {!state.settings.enabled && (
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              Автопоиск выключен. Включите мост или выберите IP в списке ниже.
            </p>
          )}
          {state.settings.enabled && state.status === 'disconnected' && state.peers.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              {state.peers.length > 1
                ? 'Найдено несколько телефонов — выберите нужный в списке.'
                : 'Телефон найден — нажмите «выбрать» в списке.'}
            </p>
          )}
        </Card>

        {state.publicWifiNoAuth && (
          <AlertBanner
            tone="warning"
            icon={ShieldAlert}
            title="Чужая сеть без пароля LAN"
            actions={
              state.wifiSsid && !state.isHomeNetwork ? (
                <button
                  type="button"
                  disabled={markingHome}
                  className="flex h-8 items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
                  onClick={() => void markHome()}
                >
                  <Home size={14} />
                  {markingHome ? 'Сохраняю…' : `Считать «${state.wifiSsid}» домашней`}
                </button>
              ) : undefined
            }
          >
            {state.wifiSsid
              ? `«${state.wifiSsid}» не в домашних сетях, логин/пароль Happ не заданы.`
              : 'Логин/пароль Happ не заданы.'}{' '}
            В общественном Wi‑Fi сосед может сесть на ваш SOCKS.
          </AlertBanner>
        )}

        {bridgeError && (
          <AlertBanner
            tone="danger"
            title={bridgeError.title}
            actions={
              <>
                {bridgeError.kind === 'port-in-use' && (
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 text-xs font-medium text-red-50 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                    onClick={openPortsSettings}
                  >
                    <Wrench size={14} />
                    Сменить порты
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy || toggling}
                  className="flex h-8 items-center gap-1 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 text-xs font-medium text-red-50 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
                  onClick={() => void findPhone()}
                >
                  <RefreshCw size={14} />
                  Повторить
                </button>
              </>
            }
          >
            {bridgeError.body}
          </AlertBanner>
        )}

        {state.peers.length > 0 && (
          <Card title="Телефоны в сети">
            <PeerList
              peers={state.peers}
              selectedIp={state.phoneIp}
              busy={busy || selecting}
              familiarIps={familiarIps(state)}
              onRefresh={() => void scanPeers()}
              refreshing={scanning}
              onSelect={selectPeer}
              showHeader={false}
            />
          </Card>
        )}

        <Card title="Адреса прокси">
          <div className="space-y-2">
            <ProxyCopyButton
              label="SOCKS5"
              value={state.socksLocal}
              copied={copied === 'socks'}
              disabled={!bridgeActive}
              onCopy={() => void copy('socks')}
            />
            <ProxyCopyButton
              label="HTTP"
              value={state.httpLocal}
              copied={copied === 'http'}
              disabled={!bridgeActive}
              onCopy={() => void copy('http')}
            />
          </div>

          <button
            type="button"
            className="mt-2 flex items-center gap-1 text-left text-xs text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
            onClick={() => setShowPresets((v) => !v)}
            aria-expanded={showPresets}
          >
            {showPresets ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Шпаргалки для приложений
          </button>

          {showPresets && (
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!bridgeActive}
                  onClick={() => void copy(preset.id)}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
                >
                  {copied === preset.id ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                  {preset.label} · {preset.proto}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title="Приложения">
          <InjectAppsPanel onState={onState} showHeader={false} />
        </Card>

        <Card
          title="Диагностика"
          action={
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDiagHidden(false)
                void diagnose()
              }}
              className="flex h-7 items-center gap-1 rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
            >
              <Gauge size={13} />
              {busy ? '…' : 'Запустить'}
            </button>
          }
        >
          {state.diagnostics && state.diagnostics.length > 0 && !diagHidden && (
            <>
              <div className="mb-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void copyDiagnostics()}
                  className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                >
                  {diagCopied ? <Check size={12} /> : <Copy size={12} />}
                  {diagCopied ? 'Скопировано' : 'Скопировать отчёт'}
                </button>
                <button
                  type="button"
                  onClick={() => setDiagHidden(true)}
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                >
                  Скрыть
                </button>
              </div>
              <DiagnosticsList items={state.diagnostics} />
            </>
          )}
          {(!state.diagnostics || state.diagnostics.length === 0 || diagHidden) && (
            <p className="text-xs text-zinc-500">
              Проверит Wi‑Fi, доступность Happ, локальный мост и статус подключения.
            </p>
          )}
        </Card>

        <Card title="Безопасность и сеть">
          <div className="space-y-3">
            <Switch
              checked={openAtLogin}
              onChange={(checked) => {
                setOpenAtLogin(checked)
                void window.happBridge.saveSettings({ openAtLogin: checked }).then(onState)
              }}
              label="Запускать при входе в macOS"
            />

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-sm font-medium text-zinc-200">Пароль Happ (LAN)</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                Те же данные, что в Happ. Пароль хранится только в Keychain macOS.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Логин" value={proxyUser} onChange={setProxyUser} placeholder="user" />
                <Field
                  label="Пароль"
                  value={proxyPassword}
                  onChange={(v) => {
                    setProxyPassword(v)
                    setClearPassword(false)
                  }}
                  placeholder={state.lanPasswordSet ? 'в Keychain' : '••••'}
                  type="password"
                />
              </div>
              {state.lanAuthOn && (
                <button
                  type="button"
                  className="mt-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                  onClick={() => {
                    setProxyPassword('')
                    setClearPassword(true)
                  }}
                >
                  {clearPassword
                    ? 'Пароль будет удалён при сохранении'
                    : 'Удалить пароль из Keychain'}
                </button>
              )}
            </div>

            {state.wifiSsid && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                <span className="text-xs text-zinc-500">
                  Wi‑Fi: <span className="text-zinc-300">{state.wifiSsid}</span>
                </span>
                {state.isHomeNetwork ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <Home size={12} />
                    домашняя
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={markingHome}
                    className="inline-flex items-center gap-1 text-xs text-sky-400 transition-colors hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
                    onClick={() => void markHome()}
                  >
                    <Home size={12} />
                    сделать домашней
                  </button>
                )}
              </div>
            )}

            <div ref={advancedRef}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-left transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                onClick={() => setAdvanced((v) => !v)}
                aria-expanded={advanced}
              >
                <span className="flex items-center gap-1.5 text-sm text-zinc-300">
                  <Wrench size={14} />
                  Расширенные настройки
                </span>
                {advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {advanced && (
                <div className="mt-2 space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <Field
                    label="IP телефона вручную"
                    hint="Если автопоиск не справляется"
                    value={manualIp}
                    onChange={setManualIp}
                    placeholder="192.168.1.6"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Порт SOCKS5" value={socksPort} onChange={setSocksPort} />
                    <Field label="Порт HTTP" value={httpPort} onChange={setHttpPort} />
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    После смены портов обновите адрес в приложениях (Telegram, Cursor, Firefox…) и
                    нажмите «Сохранить».
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
              <span className="text-xs text-zinc-400">{state.update.message}</span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-sky-400 transition-colors hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                onClick={() => void checkUpdates()}
              >
                <Sparkles size={12} />
                Проверить
              </button>
            </div>
          </div>
        </Card>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-zinc-800/80 bg-[var(--hb-bg)] px-5 pb-5 pt-3">
        <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={onShowWizard}>
          <Plug size={16} />
          Мастер
        </button>
        {dirty && !saved && (
          <span className="group relative flex items-center" title="Несохранённые изменения">
            <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-300" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-amber-200/90 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              Несохранённые изменения
            </span>
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary flex min-w-[7.5rem] items-center justify-center gap-1.5"
        >
          <Save size={16} />
          {saved ? 'Сохранено' : saving ? '…' : 'Сохранить'}
        </button>
      </footer>
    </div>
  )
}

function familiarIps(state: BridgeState): string[] {
  const ssidPeer = state.wifiSsid
    ? state.settings.ssidPeers[state.wifiSsid]
    : undefined
  return [
    ...(state.settings.lastPhoneIp ? [state.settings.lastPhoneIp] : []),
    ...(ssidPeer ? [ssidPeer] : []),
    ...state.settings.recentPhoneIps,
  ]
}

function DiagnosticsList({ items }: { items: DiagnosticCheck[] }) {
  return (
    <ul className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <p
            className={`flex items-center gap-2 font-medium ${
              item.ok ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            <span
              className={`inline-block size-1.5 shrink-0 rounded-full ${
                item.ok ? 'bg-emerald-400' : 'bg-red-400'
              }`}
              aria-hidden
            />
            {item.label}
          </p>
          <p className="mt-0.5 pl-3.5 text-xs leading-relaxed text-zinc-500">
            {item.detail}
          </p>
        </li>
      ))}
    </ul>
  )
}

function parsePort(raw: string, fallback: number): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback
  return n
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password'
}) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-zinc-600">{hint}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 font-mono text-sm text-white outline-none transition-colors duration-150 focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-400/50"
      />
    </label>
  )
}