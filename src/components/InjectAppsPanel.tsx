import { AppWindow, CheckCircle2, Code2, MousePointer2, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  InjectTarget,
  InjectTargetInfo,
} from '../../electron/inject'
import type { BridgeState } from '../../electron/types'

const ALL: InjectTarget[] = ['cursor', 'webstorm', 'firefox']

const targetMeta: Record<
  InjectTarget,
  { label: string; icon: React.ElementType }
> = {
  cursor: { label: 'Cursor', icon: MousePointer2 },
  webstorm: { label: 'WebStorm', icon: Code2 },
  firefox: { label: 'Firefox', icon: AppWindow },
}

/** Short status when the target cannot be selected. */
function shortUnavailable(detail?: string): string {
  if (!detail) return 'не найдено'
  if (/нет доступа/i.test(detail)) return 'нет доступа'
  if (/откройте Firefox/i.test(detail)) return 'нет профиля'
  if (/не установлен/i.test(detail)) return 'не установлено'
  if (/не найден/i.test(detail)) return 'не найдено'
  return 'не найдено'
}

type Props = {
  onState: (s: BridgeState) => void
  /** When the panel is wrapped in a card with its own title, hide the internal header. */
  showHeader?: boolean
}

export function InjectAppsPanel({ onState, showHeader = true }: Props) {
  const [targets, setTargets] = useState<InjectTarget[]>([])
  const [status, setStatus] = useState<InjectTargetInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setStatus(await window.happBridge.injectStatus())
      setLog(null)
    } catch (err) {
      setStatus([])
      setLog(
        err instanceof Error
          ? `Не удалось проверить приложения: ${err.message}`
          : 'Не удалось проверить приложения',
      )
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const toggle = (id: InjectTarget) => {
    setTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const run = async (mode: 'apply' | 'revert') => {
    if (targets.length === 0) {
      setLog('Выберите хотя бы одно приложение')
      return
    }
    setBusy(true)
    setLog(null)
    try {
      const result =
        mode === 'apply'
          ? await window.happBridge.injectApply(targets)
          : await window.happBridge.injectRevert(targets)
      setStatus(result.status)
      const lines = result.results.map(
        (r) => `${r.ok ? 'OK' : 'ERR'} ${r.message}`,
      )

      const okIds = result.results.filter((r) => r.ok).map((r) => r.id)
      if (okIds.length > 0) {
        const offer = await window.happBridge.injectRelaunchOffer(okIds)
        if (offer.restarted) {
          for (const r of offer.results) {
            lines.push(`${r.ok ? 'OK' : 'ERR'} ${r.message}`)
          }
        } else {
          lines.push('Перезапуск отложен — сделайте позже вручную')
        }
      }

      setLog(lines.join('\n'))
      onState(await window.happBridge.getState())
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const byId = Object.fromEntries(status.map((s) => [s.id, s])) as Partial<
    Record<InjectTarget, InjectTargetInfo>
  >

  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Прописать в приложения
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="flex h-7 items-center gap-1 rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
          >
            <RefreshCcw size={13} />
            Обновить статус
          </button>
        </div>
      )}
      {showHeader && (
        <p className="text-xs leading-relaxed text-zinc-500">
          Выберите приложения и нажмите «Прописать» (127.0.0.1) или «Откатить»
          (прямой IP телефона). Автоподмены нет — только вручную.
        </p>
      )}

      <ul className="space-y-1.5">
        {ALL.map((id) => {
          const info = byId[id]
          const available = info?.available ?? false
          const applied = info?.applied ?? false
          const selected = targets.includes(id)
          const Icon = targetMeta[id].icon
          return (
            <li
              key={id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                selected && available
                  ? 'border-sky-500/30 bg-sky-500/10'
                  : 'border-zinc-800 bg-zinc-900/60'
              }`}
            >
              <input
                type="checkbox"
                id={`inject-${id}`}
                checked={selected}
                disabled={!available || busy}
                onChange={() => toggle(id)}
                className="size-4 rounded border-zinc-600 accent-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              />
              <label
                htmlFor={`inject-${id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                title={info?.detail ?? targetMeta[id].label}
              >
                {info?.icon ? (
                  <img
                    src={info.icon}
                    alt=""
                    className="h-[18px] w-[18px] shrink-0 rounded-[4px]"
                  />
                ) : (
                  <Icon size={18} className="shrink-0 text-zinc-400" />
                )}
                <span className="truncate text-sm text-zinc-200">
                  {targetMeta[id].label}
                </span>
                {applied && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 size={12} />
                    прописано
                  </span>
                )}
                {available && /нет доступа/i.test(info?.detail ?? '') && (
                  <span className="shrink-0 text-xs text-amber-500">нет доступа</span>
                )}
                {!available && (
                  <span className="shrink-0 text-xs text-zinc-600">
                    {shortUnavailable(info?.detail)}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          className="btn-primary flex-1"
          onClick={() => void run('apply')}
        >
          {busy ? '…' : 'Прописать'}
        </button>
        <button
          type="button"
          disabled={busy}
          className="btn-secondary"
          onClick={() => void run('revert')}
        >
          Откатить
        </button>
      </div>

      {log && (
        <pre className="whitespace-pre-wrap rounded-md bg-zinc-950/80 px-2.5 py-2 text-xs leading-relaxed text-zinc-400">
          {log}
        </pre>
      )}
    </div>
  )
}