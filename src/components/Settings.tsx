import { useState } from 'react'
import type { BridgeState } from '../../electron/types'
import { DEFAULT_SETTINGS } from '../../electron/types'
import { useBridgeActions } from '../hooks/useBridgeActions'
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
  const [openAtLogin, setOpenAtLogin] = useState(state.settings.openAtLogin)
  const [saved, setSaved] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const { busy, copied, findPhone, copy } = useBridgeActions(onState)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const next = await window.happBridge.saveSettings({
        manualIp: manualIp.trim() || null,
        socksPort: parsePort(socksPort, DEFAULT_SETTINGS.socksPort),
        httpPort: parsePort(httpPort, DEFAULT_SETTINGS.httpPort),
        openAtLogin,
      })
      onState(next)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-6 py-5">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-sky-400">
          Happ Bridge
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Статус</h1>
      </header>

      <StatusBadge status={state.status} phoneIp={state.phoneIp} />

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
        disabled={busy}
        onClick={() => void findPhone()}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? 'Ищем…' : 'Найти снова'}
      </button>

      <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={openAtLogin}
          onChange={(e) => setOpenAtLogin(e.target.checked)}
          className="size-4 rounded border-zinc-600 accent-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
        />
        Запускать при входе в macOS
      </label>

      <button
        type="button"
        className="mt-4 text-left text-sm text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
        onClick={() => setAdvanced((v) => !v)}
        aria-expanded={advanced}
      >
        {advanced ? '▾' : '▸'} Расширенные настройки
      </button>

      {advanced && (
        <div className="mt-3 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
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

      <div className="mt-auto flex gap-2 pt-4">
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors duration-150 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.98]"
          onClick={onShowWizard}
        >
          Мастер
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 active:scale-[0.98] disabled:opacity-50"
        >
          {saved ? 'Сохранено' : 'Сохранить'}
        </button>
      </div>
    </div>
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
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-zinc-600">{hint}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 font-mono text-sm text-white outline-none transition-colors duration-150 focus:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-400/50"
      />
    </label>
  )
}
