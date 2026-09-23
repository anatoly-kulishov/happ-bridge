import { useEffect, useState } from 'react'
import type {
  InjectTarget,
  InjectTargetInfo,
} from '../../electron/inject'
import type { BridgeState } from '../../electron/types'

const ALL: InjectTarget[] = ['cursor', 'webstorm', 'firefox']

type Props = {
  onState: (s: BridgeState) => void
}

export function InjectAppsPanel({ onState }: Props) {
  const [targets, setTargets] = useState<InjectTarget[]>([])
  const [status, setStatus] = useState<InjectTargetInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)

  const refresh = async () => {
    setStatus(await window.happBridge.injectStatus())
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
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-sm font-medium text-zinc-200">Прописать в приложения</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Выберите приложения и нажмите «Прописать» (127.0.0.1) или «Откатить»
        (прямой IP телефона). Автоподмены нет — только вручную.
      </p>

      <ul className="mt-3 space-y-2">
        {ALL.map((id) => {
          const info = byId[id]
          const available = info?.available ?? false
          const applied = info?.applied ?? false
          return (
            <li key={id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id={`inject-${id}`}
                checked={targets.includes(id)}
                disabled={!available || busy}
                onChange={() => toggle(id)}
                className="mt-0.5 size-4 rounded border-zinc-600 accent-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              />
              <label htmlFor={`inject-${id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="text-zinc-200">
                  {info?.label ?? id}
                  {applied && (
                    <span className="ml-1.5 text-xs text-emerald-400">прописано</span>
                  )}
                  {!available && (
                    <span className="ml-1.5 text-xs text-zinc-600">не найден</span>
                  )}
                </span>
                {info?.detail && (
                  <span className="mt-0.5 block truncate text-xs text-zinc-600" title={info.detail}>
                    {info.detail}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center gap-3">
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
          className="shrink-0 text-xs text-zinc-500 transition-colors duration-150 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
          onClick={() => void run('revert')}
        >
          Откатить
        </button>
      </div>

      {log && (
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-zinc-950/80 px-2.5 py-2 text-xs leading-relaxed text-zinc-400">
          {log}
        </pre>
      )}
    </div>
  )
}
