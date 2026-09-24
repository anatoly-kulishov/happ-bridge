import { useState } from 'react'
import type { BridgeState, DiagnosticCheck } from '../../electron/types'
import { DEFAULT_SETTINGS } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
import { InjectAppsPanel } from './InjectAppsPanel'
import { PeerList } from './PeerList'
import { ProxyCopyButton } from './ProxyCopyButton'
import { StatusBadge } from './StatusBadge'

type Props = {
  state: BridgeState
  onState: (s: BridgeState) => void
  onShowWizard: () => void
}

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
  const { busy, copied, findPhone, copy, diagnose, checkUpdates } =
    useBridgeActions(onState)
  const [saving, setSaving] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [markingHome, setMarkingHome] = useState(false)

  const selectPeer = async (ip: string) => {
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
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
        <header className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-sky-400">
            Happ Bridge
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">
            Статус
          </h1>
        </header>

        <StatusBadge
          status={state.status}
          phoneIp={state.phoneIp}
          lanAuthOn={state.lanAuthOn}
        />

        {state.publicWifiNoAuth && (
          <div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-50">
            <p className="font-medium tracking-tight">Чужая сеть без пароля LAN</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
              {state.wifiSsid
                ? `«${state.wifiSsid}» не в домашних сетях, логин/пароль Happ не заданы.`
                : 'Логин/пароль Happ не заданы.'}{' '}
              В общественном Wi‑Fi сосед может сесть на ваш SOCKS.
            </p>
            {state.wifiSsid && !state.isHomeNetwork && (
              <button
                type="button"
                disabled={markingHome}
                className="mt-2.5 min-h-9 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-50 transition-colors duration-150 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
                onClick={() => void markHome()}
              >
                {markingHome ? 'Сохраняю…' : `Считать «${state.wifiSsid}» домашней`}
              </button>
            )}
          </div>
        )}

        {state.error && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {state.error}
          </p>
        )}

        <PeerList
          peers={state.peers}
          selectedIp={state.phoneIp}
          busy={busy || selecting}
          onSelect={selectPeer}
        />

        <div className="mt-4 space-y-2">
          <ProxyCopyButton
            label="SOCKS5"
            value={state.socksLocal}
            copied={copied === 'socks'}
            onCopy={() => void copy('socks')}
          />
          <ProxyCopyButton
            label="HTTP"
            value={state.httpLocal}
            copied={copied === 'http'}
            onCopy={() => void copy('http')}
          />
        </div>

        <button
          type="button"
          className="mt-2 text-left text-xs text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          onClick={() => setShowPresets((v) => !v)}
          aria-expanded={showPresets}
        >
          {showPresets ? 'Скрыть пресеты' : 'Пресеты для приложений'}
        </button>

        {showPresets && (
          <div className="mt-2 space-y-2">
            <ProxyCopyButton
              label="Telegram"
              value="SOCKS5 · шпаргалка"
              copied={copied === 'telegram'}
              onCopy={() => void copy('telegram')}
            />
            <ProxyCopyButton
              label="Cursor / IDE"
              value="HTTP · шпаргалка"
              copied={copied === 'cursor'}
              onCopy={() => void copy('cursor')}
            />
          </div>
        )}

        <InjectAppsPanel onState={onState} />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void findPhone()}
            className="text-xs text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
          >
            {busy ? 'Ищем…' : 'Найти снова'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void diagnose()}
            className="text-xs text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
          >
            Диагностика
          </button>
        </div>

        {state.diagnostics && state.diagnostics.length > 0 && (
          <DiagnosticsList items={state.diagnostics} />
        )}

        <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={openAtLogin}
            onChange={(e) => setOpenAtLogin(e.target.checked)}
            className="size-4 rounded border-zinc-600 accent-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          />
          Запускать при входе в macOS
        </label>

        <div className="mt-5 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">Пароль Happ (LAN)</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Те же данные, что в Happ. Пароль только в Keychain macOS - в окно не подставляется.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Логин" value={proxyUser} onChange={setProxyUser} placeholder="user" />
            <Field
              label="Пароль"
              value={proxyPassword}
              onChange={(v) => {
                setProxyPassword(v)
                setClearPassword(false)
              }}
              placeholder={state.lanAuthOn ? 'оставлен в Keychain' : '••••'}
              type="password"
            />
          </div>
          {state.lanAuthOn && (
            <button
              type="button"
              className="text-xs text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              onClick={() => {
                setProxyPassword('')
                setClearPassword(true)
              }}
            >
              {clearPassword ? 'Пароль будет удалён при сохранении' : 'Удалить пароль из Keychain'}
            </button>
          )}
          {state.wifiSsid && (
            <p className="text-xs leading-relaxed text-zinc-500">
              Wi‑Fi: <span className="text-zinc-300">{state.wifiSsid}</span>
              {state.isHomeNetwork ? ' · домашняя' : ''}
              {!state.isHomeNetwork && (
                <>
                  {' · '}
                  <button
                    type="button"
                    disabled={markingHome}
                    className="text-sky-400 transition-colors duration-150 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
                    onClick={() => void markHome()}
                  >
                    сделать домашней
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
          <p>{state.update.message}</p>
          <button
            type="button"
            className="mt-1.5 text-sky-400 transition-colors duration-150 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
            onClick={() => void checkUpdates()}
          >
            Проверить обновления
          </button>
        </div>

        <button
          type="button"
          className="mt-4 mb-2 text-left text-sm text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
        >
          {advanced ? '▾' : '▸'} Расширенные настройки
        </button>

        {advanced && (
          <div className="mb-4 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
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
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-zinc-800/80 bg-[var(--hb-bg)] px-6 pb-6 pt-3">
        <button type="button" className="btn-ghost" onClick={onShowWizard}>
          Мастер
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary min-w-[7.5rem]"
        >
          {saved ? 'Сохранено' : saving ? '…' : 'Сохранить'}
        </button>
      </footer>
    </div>
  )
}

function DiagnosticsList({ items }: { items: DiagnosticCheck[] }) {
  return (
    <ul className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
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
