import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Download,
  Save,
  Gauge,
  Home,
  Loader2,
  RefreshCw,
  Plug,
  ShieldAlert,
  Sparkles,
  Wifi,
  Wrench,
} from '../icons'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { BridgeState, DiagnosticCheck, UpdateInfo } from '../../electron/types'
import { DEFAULT_SETTINGS } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
import { AlertBanner, parseBridgeError } from './AlertBanner'
import { BusyIcon } from './BusyIcon'
import { Card } from './Card'
import { PeerList } from './PeerList'
import { ProxyCopyButton } from './ProxyCopyButton'
import { StatusBadge } from './StatusBadge'
import { Switch } from './Switch'

const InjectAppsPanel = lazy(() =>
  import('./InjectAppsPanel').then((m) => ({ default: m.InjectAppsPanel })),
)

type Props = {
  state: BridgeState
  onState: (s: BridgeState) => void
  onShowWizard: () => void
}

const PRESETS: { id: 'telegram' | 'cursor'; label: string; proto: string }[] = [
  { id: 'telegram', label: 'Telegram', proto: 'SOCKS5' },
  { id: 'cursor', label: 'Cursor / IDE', proto: 'HTTP' },
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
  const [showLanPassword, setShowLanPassword] = useState(false)
  const advancedRef = useRef<HTMLDivElement>(null)
  const securityRef = useRef<HTMLDivElement>(null)
  const {
    busy,
    diagnosing,
    checkingUpdates,
    copied,
    findPhone,
    scanPeers,
    scanning,
    copy,
    diagnose,
    checkUpdates,
    installUpdate,
  } = useBridgeActions(onState)

  const scrollToRef = (el: HTMLElement | null) => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' })
  }

  const openPortsSettings = () => {
    setAdvanced(true)
    window.requestAnimationFrame(() => scrollToRef(advancedRef.current))
  }

  const openLanAuthSettings = () => {
    setShowLanPassword(true)
    window.requestAnimationFrame(() => scrollToRef(securityRef.current))
  }
  const [saving, setSaving] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [markingHome, setMarkingHome] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [diagHidden, setDiagHidden] = useState(false)
  const [diagCopied, setDiagCopied] = useState(false)

  const bridgeActive = state.settings.enabled && state.status !== 'disconnected'
  /** Soft-connected: healthy or grace (unstable) — keep peer list / soft rescan. */
  const connected = state.status === 'connected' || state.status === 'unstable'
  const bridgeError = state.error ? parseBridgeError(state.error) : null

  const dirty =
    manualIp.trim() !== (state.settings.manualIp ?? '') ||
    socksPort !== String(state.settings.socksPort) ||
    httpPort !== String(state.settings.httpPort) ||
    proxyUser.trim() !== (state.settings.proxyUser ?? '') ||
    proxyPassword.length > 0 ||
    clearPassword

  const hasUnsaved = dirty && !saved

  useEffect(() => {
    window.__hbDirty = hasUnsaved
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.__hbDirty = false
    }
  }, [hasUnsaved])

  const selectPeer = async (ip: string) => {
    if (ip === state.phoneIp) return
    setSelecting(true)
    try {
      onState(await window.happBridge.selectPhone(ip))
    } finally {
      setSelecting(false)
    }
  }

  const disconnectPeer = async () => {
    setSelecting(true)
    try {
      onState(await window.happBridge.disconnect())
    } finally {
      setSelecting(false)
    }
  }

  /** Full rediscovery when idle; soft list refresh while connected. */
  const rescanPhones = () => {
    if (connected) void scanPeers()
    else void findPhone()
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
    setDiagHidden(false)
    await window.happBridge.copyDiagnostics()
    onState(await window.happBridge.getState())
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
    <div className="app-shell">
      <main className="app-scroll">
        <header className="flex items-start justify-between gap-3 pb-1">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--hb-text)]">
              Happ Bridge
            </h1>
            <p className="mt-0.5 text-xs muted">Локальный мост к Happ на телефоне</p>
          </div>
          {state.wifiSsid && (
            <span
              className={`chip max-w-[9.5rem] ${state.isHomeNetwork ? 'chip-ok' : ''}`}
              title={
                state.isHomeNetwork
                  ? `Wi‑Fi «${state.wifiSsid}» · домашняя сеть`
                  : `Wi‑Fi «${state.wifiSsid}» · можно отметить как домашнюю`
              }
            >
              <Wifi size={11} aria-hidden />
              <span className="truncate">{state.wifiSsid}</span>
            </span>
          )}
        </header>

        <Card elevated>
          <StatusBadge
            status={state.status}
            phoneIp={state.phoneIp}
            lanAuthOn={state.lanAuthOn}
            enabled={state.settings.enabled}
            paused={state.paused}
            scan={state.scan}
          />

          <div className="mt-3 border-t border-[var(--hb-border)] pt-2.5">
            <Switch
              checked={state.settings.enabled}
              onChange={(checked) => void toggleBridge(checked)}
              label="Мост к Happ"
              hint={
                state.settings.enabled
                  ? 'Автопоиск и переподключение включены'
                  : 'Включите, и поиск телефона запустится сам'
              }
              disabled={toggling}
            />
          </div>
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
                  className="btn-secondary btn-sm"
                  title={`Отметить «${state.wifiSsid}» как домашнюю: без предупреждения о публичном Wi‑Fi`}
                  onClick={() => void markHome()}
                >
                  <BusyIcon busy={markingHome} icon={Home} size={14} />
                  {markingHome ? 'Сохраняю…' : `Считать «${state.wifiSsid}» домашней`}
                </button>
              ) : undefined
            }
          >
            {state.wifiSsid
              ? `«${state.wifiSsid}» не в домашних сетях, логин/пароль Happ не заданы.`
              : 'Логин/пароль Happ не заданы.'}{' '}
            В публичной сети сосед может подключиться к вашему SOCKS.
          </AlertBanner>
        )}

        {bridgeError && (
          <AlertBanner
            tone={bridgeError.tone}
            title={bridgeError.title}
            actions={
              <>
                {bridgeError.kind === 'port-in-use' && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    title="Открыть расширенные настройки и сменить порты SOCKS5 / HTTP"
                    onClick={openPortsSettings}
                  >
                    <Wrench size={14} aria-hidden />
                    Сменить порты
                  </button>
                )}
                {bridgeError.kind === 'auth' && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    title="Указать логин и пароль Happ LAN"
                    onClick={openLanAuthSettings}
                  >
                    Указать пароль
                  </button>
                )}
                {bridgeError.kind === 'validation' && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    title="Открыть расширенные настройки"
                    onClick={openPortsSettings}
                  >
                    <Wrench size={14} aria-hidden />
                    Открыть настройки
                  </button>
                )}
                {(bridgeError.kind === 'port-in-use' ||
                  bridgeError.kind === 'generic' ||
                  bridgeError.kind === 'guidance') && (
                  <button
                    type="button"
                    disabled={busy || toggling}
                    className="btn-secondary btn-sm"
                    title="Снова поискать телефон в сети"
                    onClick={() => void findPhone()}
                  >
                    <BusyIcon busy={busy} icon={RefreshCw} size={14} />
                    {busy ? 'Ищем…' : 'Повторить'}
                  </button>
                )}
              </>
            }
          >
            {bridgeError.body}
          </AlertBanner>
        )}

        <Card
          title="Телефоны"
          action={
            <button
              type="button"
              disabled={!state.settings.enabled || scanning || busy || selecting || toggling}
              onClick={() => {
                setDiagHidden(false)
                rescanPhones()
              }}
              title={connected ? 'Обновить список без разрыва' : 'Новый поиск'}
              aria-label={connected ? 'Обновить список' : 'Новый поиск'}
              className="icon-btn icon-btn-sm"
            >
              <BusyIcon busy={busy || scanning} icon={RefreshCw} size={14} />
            </button>
          }
        >
          <PeerList
            peers={state.peers}
            selectedIp={state.phoneIp}
            busy={busy || selecting}
            familiarIps={familiarIps(state)}
            onSelect={selectPeer}
            onDisconnect={disconnectPeer}
            showHeader={false}
            emptyHint={
              busy || scanning
                ? 'Ищем телефоны в сети…'
                : state.paused
                  ? 'Отключено. Выберите телефон или нажмите обновление.'
                  : 'Пока пусто. Нажмите ↻ для поиска.'
            }
          />
          {state.peers.length > 1 && state.status === 'disconnected' && (
            <p className="mt-2 text-xs leading-relaxed muted">
              Несколько телефонов: нажмите нужный IP. Повторный клик по активному отключает.
            </p>
          )}
        </Card>

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
            className="mt-2.5 flex items-center gap-1 text-left text-xs muted transition-colors hover:text-[var(--hb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)]"
            onClick={() => setShowPresets((v) => !v)}
            aria-expanded={showPresets}
            title={showPresets ? 'Скрыть шпаргалки' : 'Показать шпаргалки для приложений'}
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
                  title={
                    bridgeActive
                      ? copied === preset.id
                        ? 'Скопировано'
                        : `Копировать настройки ${preset.label} (${preset.proto})`
                      : 'Сначала подключите мост'
                  }
                  className="chip transition-colors hover:border-[var(--hb-border-strong)] hover:text-[var(--hb-text)] disabled:opacity-45"
                >
                  {copied === preset.id ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                  {preset.label} · {preset.proto}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title="Приложения">
          <Suspense fallback={<p className="text-xs muted">Загрузка…</p>}>
            <InjectAppsPanel onState={onState} showHeader={false} />
          </Suspense>
        </Card>

        <Card
          title="Диагностика"
          action={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={diagnosing || busy}
                onClick={() => void copyDiagnostics()}
                className="icon-btn icon-btn-sm"
                title={diagCopied ? 'Скопировано' : 'Скопировать отчёт'}
                aria-label={diagCopied ? 'Скопировано' : 'Скопировать отчёт'}
              >
                {diagCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button
                type="button"
                disabled={diagnosing || busy}
                onClick={() => {
                  setDiagHidden(false)
                  void diagnose()
                }}
                className="icon-btn icon-btn-sm"
                title={diagnosing ? 'Проверяю…' : 'Запустить диагностику'}
                aria-label={diagnosing ? 'Проверяю…' : 'Запустить диагностику'}
              >
                <BusyIcon busy={diagnosing} icon={Gauge} size={14} />
              </button>
            </div>
          }
        >
          {state.diagnostics && state.diagnostics.length > 0 && !diagHidden && (
            <>
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setDiagHidden(true)}
                  title="Скрыть результаты диагностики"
                  className="text-xs muted transition-colors hover:text-[var(--hb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)]"
                >
                  Скрыть
                </button>
              </div>
              <DiagnosticsList items={state.diagnostics} />
            </>
          )}
          {(!state.diagnostics || state.diagnostics.length === 0 || diagHidden) && (
            <p className="text-xs leading-relaxed muted">
              Кнопка диагностики проверяет сеть. «Отчёт» копирует JSON со снимком состояния и хвостом лога.
            </p>
          )}
        </Card>

        <Card title="Безопасность и сеть">
          <div ref={securityRef} className="scroll-mt-3 space-y-3">
            <Switch
              checked={openAtLogin}
              onChange={(checked) => {
                setOpenAtLogin(checked)
                void window.happBridge.saveSettings({ openAtLogin: checked }).then(onState)
              }}
              label="Запускать при входе в macOS"
            />

            <div className="surface overflow-hidden rounded-[10px]">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--hb-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)]"
                onClick={() => setShowLanPassword((v) => !v)}
                aria-expanded={showLanPassword}
                title={
                  showLanPassword
                    ? 'Свернуть пароль Happ LAN'
                    : 'Логин и пароль из Happ для LAN'
                }
              >
                <span className="flex items-center gap-1.5 text-sm text-[var(--hb-text)]">
                  <ShieldAlert size={14} className="muted" aria-hidden />
                  Пароль Happ (LAN)
                </span>
                <span className="flex items-center gap-2">
                  {state.lanPasswordSet && (
                    <span
                      className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--hb-ok-soft)] text-emerald-300"
                      title="Пароль сохранён в Keychain"
                      aria-label="Пароль задан"
                    >
                      <Check size={12} aria-hidden />
                    </span>
                  )}
                  {showLanPassword ? (
                    <ChevronDown size={14} className="faint" aria-hidden />
                  ) : (
                    <ChevronRight size={14} className="faint" aria-hidden />
                  )}
                </span>
              </button>

              {showLanPassword && (
                <div className="space-y-2 border-t border-[var(--hb-border)] px-3 pb-3 pt-2.5">
                  <p className="text-xs leading-relaxed muted">
                    Те же данные, что в Happ. Пароль хранится только в Keychain macOS.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Логин"
                      name="proxyUser"
                      value={proxyUser}
                      onChange={setProxyUser}
                      placeholder="user…"
                    />
                    <Field
                      label="Пароль"
                      name="proxyPassword"
                      value={proxyPassword}
                      onChange={(v) => {
                        setProxyPassword(v)
                        setClearPassword(false)
                      }}
                      placeholder={state.lanPasswordSet ? 'в Keychain…' : '••••'}
                      type="password"
                    />
                  </div>
                  {state.lanPasswordSet && (
                    <button
                      type="button"
                      className="text-xs muted transition-colors hover:text-[var(--hb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)]"
                      title={
                        clearPassword
                          ? 'Отмечено к удалению. Нажмите «Сохранить»'
                          : 'Удалить пароль LAN из Keychain macOS'
                      }
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
              )}
            </div>

            {state.wifiSsid && (
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--hb-border)] bg-black/15 px-3 py-2.5">
                <span className="text-xs muted">
                  Wi‑Fi: <span className="text-[var(--hb-text)]">{state.wifiSsid}</span>
                </span>
                {state.isHomeNetwork ? (
                  <span
                    className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--hb-ok-soft)] text-emerald-300"
                    title="Домашняя сеть: без предупреждения о публичном Wi‑Fi"
                    aria-label="Домашняя сеть"
                  >
                    <Home size={13} aria-hidden />
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={markingHome}
                    className="inline-flex items-center gap-1 text-xs text-sky-300 transition-colors hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)] disabled:opacity-50"
                    title="Считать текущий Wi‑Fi домашним"
                    onClick={() => void markHome()}
                  >
                    <BusyIcon busy={markingHome} icon={Home} size={12} />
                    {markingHome ? 'Сохраняю…' : 'сделать домашней'}
                  </button>
                )}
              </div>
            )}

            <div ref={advancedRef} className="scroll-mt-3">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[10px] border border-[var(--hb-border)] bg-black/15 px-3 py-2.5 text-left transition-colors hover:bg-[var(--hb-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)]"
                onClick={() => setAdvanced((v) => !v)}
                aria-expanded={advanced}
                title={
                  advanced
                    ? 'Свернуть расширенные настройки'
                    : 'IP вручную и порты SOCKS5 / HTTP'
                }
              >
                <span className="flex items-center gap-1.5 text-sm text-[var(--hb-text)]">
                  <Wrench size={14} className="muted" aria-hidden />
                  Расширенные настройки
                </span>
                {advanced ? (
                  <ChevronDown size={14} className="faint" aria-hidden />
                ) : (
                  <ChevronRight size={14} className="faint" aria-hidden />
                )}
              </button>

              {advanced && (
                <div className="mt-2 space-y-3 rounded-[10px] border border-[var(--hb-border)] bg-black/15 p-3">
                  <Field
                    label="IP телефона вручную"
                    name="manualIp"
                    hint="Если автопоиск не справляется"
                    value={manualIp}
                    onChange={setManualIp}
                    placeholder="192.168.1.6"
                    inputMode="decimal"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Порт SOCKS5"
                      name="socksPort"
                      value={socksPort}
                      onChange={setSocksPort}
                      inputMode="numeric"
                    />
                    <Field
                      label="Порт HTTP"
                      name="httpPort"
                      value={httpPort}
                      onChange={setHttpPort}
                      inputMode="numeric"
                    />
                  </div>
                  <p className="text-xs leading-relaxed muted">
                    После смены портов обновите адрес в приложениях и нажмите «Сохранить».
                  </p>
                </div>
              )}
            </div>

            <UpdateRow
              update={state.update}
              checking={checkingUpdates}
              onCheck={() => void checkUpdates()}
              onInstall={() => void installUpdate()}
            />
          </div>
        </Card>
      </main>

      <footer className="app-footer">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={onShowWizard}
            title="Открыть мастер настройки"
          >
            <Plug size={16} aria-hidden />
            Мастер
          </button>
          {hasUnsaved && (
            <span
              className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-amber-300"
              title="Есть несохранённые изменения"
              aria-label="Есть несохранённые изменения"
            />
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary"
          title={saved ? 'Сохранено' : saving ? 'Сохраняю…' : 'Сохранить настройки'}
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Save size={16} aria-hidden />
          )}
          {saved ? 'Сохранено' : saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </footer>
    </div>
  )
}

function UpdateRow({
  update,
  checking,
  onCheck,
  onInstall,
}: {
  update: UpdateInfo
  checking: boolean
  onCheck: () => void
  onInstall: () => void
}) {
  const downloading = update.status === 'downloading'
  const busy = checking || update.status === 'checking' || downloading
  const percent = downloading ? Math.max(0, Math.min(100, update.progress ?? 0)) : null
  const ready =
    update.status === 'available' &&
    (update.progress === 100 || /скачана/i.test(update.message))
  const errored = update.status === 'error'

  return (
    <div
      className={`space-y-2 rounded-[10px] border px-2.5 py-1.5 ${
        errored
          ? 'border-red-400/25 bg-[var(--hb-danger-soft)]'
          : ready
            ? 'border-emerald-400/25 bg-[var(--hb-ok-soft)]'
            : 'border-[var(--hb-border)] bg-black/15'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs leading-snug ${
              errored ? 'text-red-200' : ready ? 'text-emerald-200' : 'muted'
            }`}
          >
            {update.message}
          </p>
          {percent != null && (
            <div
              className="mt-1.5 flex items-center gap-2"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Скачивание обновления"
            >
              <Loader2 size={12} className="shrink-0 animate-spin text-sky-400" aria-hidden />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/35">
                <div
                  className="h-full rounded-full bg-sky-400 transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums muted">{percent}%</span>
            </div>
          )}
        </div>
        {ready ? (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            title="Установить обновление"
            aria-label="Установить обновление"
            onClick={onInstall}
          >
            <Download size={14} className="text-emerald-300" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className="icon-btn icon-btn-sm"
            title={downloading ? 'Скачиваем…' : busy ? 'Проверяю…' : 'Проверить обновления'}
            aria-label={downloading ? 'Скачиваем…' : busy ? 'Проверяю…' : 'Проверить обновления'}
            onClick={onCheck}
          >
            <BusyIcon busy={busy && !downloading} icon={Sparkles} size={14} />
          </button>
        )}
      </div>
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
  const statusColor = (status: DiagnosticCheck['status']) =>
    status === 'ok' ? 'text-emerald-300' : status === 'warn' ? 'text-amber-300' : 'text-red-300'
  const dotColor = (status: DiagnosticCheck['status']) =>
    status === 'ok' ? 'bg-emerald-400' : status === 'warn' ? 'bg-amber-400' : 'bg-red-400'
  const statusTitle = (status: DiagnosticCheck['status']) =>
    status === 'ok' ? 'OK' : status === 'warn' ? 'Внимание' : 'Ошибка'
  return (
    <ul className="stack stack-2.5 rounded-[10px] border border-[var(--hb-border)] bg-black/20 p-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm" title={`${item.label}: ${item.detail}`}>
          <p className={`flex items-center gap-2 font-medium ${statusColor(item.status)}`}>
            <span
              className={`inline-block size-1.5 shrink-0 rounded-full ${dotColor(item.status)}`}
              title={statusTitle(item.status)}
              aria-label={statusTitle(item.status)}
            />
            {item.label}
          </p>
          <p className="mt-0.5 pl-3.5 text-xs leading-relaxed muted">{item.detail}</p>
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
  name,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
}: {
  label: string
  name?: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  inputMode?: 'text' | 'numeric' | 'decimal'
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--hb-text)]">{label}</span>
      {hint && <span className="mt-0.5 block text-xs muted">{hint}</span>}
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellcheck={false}
        inputMode={inputMode}
        className="field-input"
      />
    </label>
  )
}
