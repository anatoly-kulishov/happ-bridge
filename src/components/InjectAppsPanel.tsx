import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  CircleAlert,
  Code2,
  Info,
  Loader2,
  MousePointer2,
  RefreshCcw,
  ShieldAlert,
} from '../icons'
import { useEffect, useState } from 'react'
import type {
  InjectTarget,
  InjectTargetInfo,
} from '../../electron/inject'
import type { BridgeState } from '../../electron/types'
import { BusyIcon } from './BusyIcon'

const ALL: InjectTarget[] = ['cursor', 'webstorm', 'firefox']

const targetMeta: Record<
  InjectTarget,
  { label: string; icon: typeof MousePointer2 }
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
  type Line = { tone: 'ok' | 'err' | 'info' | 'warn'; text: string }
  const [targets, setTargets] = useState<InjectTarget[]>([])
  const [status, setStatus] = useState<InjectTargetInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [busyMode, setBusyMode] = useState<'apply' | 'revert' | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [doc, setDoc] = useState<Line[] | null>(null)

  const refresh = async () => {
    setRefreshing(true)
    try {
      setStatus(await window.happBridge.injectStatus())
      setDoc(null)
    } catch (err) {
      setStatus([])
      setDoc([
        {
          tone: 'err',
          text:
            err instanceof Error
              ? `Не удалось проверить приложения: ${err.message}`
              : 'Не удалось проверить приложения',
        },
      ])
    } finally {
      setRefreshing(false)
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
      setDoc([{ tone: 'warn', text: 'Выберите хотя бы одно приложение' }])
      return
    }
    setBusy(true)
    setBusyMode(mode)
    setDoc(null)
    try {
      const result =
        mode === 'apply'
          ? await window.happBridge.injectApply(targets)
          : await window.happBridge.injectRevert(targets)
      setStatus(result.status)
      const lines: Line[] = result.results.map((r) => ({
        tone: r.ok ? 'ok' : 'err',
        text: r.message,
      }))

      const okIds = result.results.filter((r) => r.ok).map((r) => r.id)
      if (okIds.length > 0) {
        const offer = await window.happBridge.injectRelaunchOffer(okIds)
        if (offer.restarted) {
          for (const r of offer.results) {
            lines.push({ tone: r.ok ? 'ok' : 'err', text: r.message })
          }
        } else {
          lines.push({ tone: 'info', text: 'Перезапуск отложен. Сделайте позже вручную.' })
        }
      }

      setDoc(lines)
      onState(await window.happBridge.getState())
    } catch (err) {
      setDoc([{ tone: 'err', text: err instanceof Error ? err.message : String(err) }])
    } finally {
      setBusy(false)
      setBusyMode(null)
    }
  }

  const byId = Object.fromEntries(status.map((s) => [s.id, s])) as Partial<
    Record<InjectTarget, InjectTargetInfo>
  >

  return (
    <div className="space-y-2.5">
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-label">Прописать в приложения</h2>
          <button
            type="button"
            disabled={busy || refreshing}
            onClick={() => void refresh()}
            className="icon-btn icon-btn-sm"
            title={refreshing ? 'Обновляю статус…' : 'Обновить статус приложений'}
            aria-label="Обновить статус приложений"
          >
            <BusyIcon busy={refreshing} icon={RefreshCcw} size={14} />
          </button>
        </div>
      )}
      {showHeader && (
        <p className="text-xs leading-relaxed muted">
          Выберите приложения и нажмите «Прописать» (127.0.0.1) или «Откатить»
          (прямой IP телефона). Автоподмены нет, только вручную.
        </p>
      )}

      {!showHeader && (
        <p className="text-xs leading-relaxed muted">
          Пропишите 127.0.0.1 в приложения или откатите на IP телефона.
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
            <li key={id}>
              <label
                htmlFor={`inject-${id}`}
                className={`row gap-3${!available ? ' opacity-60' : selected ? ' row-active' : ''}${!available ? ' cursor-not-allowed' : ' cursor-pointer'}`}
                title={info?.detail ?? targetMeta[id].label}
              >
                <input
                  type="checkbox"
                  id={`inject-${id}`}
                  checked={selected}
                  disabled={!available || busy}
                  onChange={() => toggle(id)}
                  className="size-4 rounded border-[var(--hb-border-strong)] accent-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)]"
                />
                {info?.icon ? (
                  <img
                    src={info.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="size-[18px] shrink-0 rounded-[5px]"
                  />
                ) : (
                  <Icon size={18} className="shrink-0 muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--hb-text)]">
                  {targetMeta[id].label}
                </span>
                {applied && (
                  <span
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hb-ok-soft)] text-emerald-300"
                    title="Прокси уже прописан в это приложение"
                    aria-label="Прописано"
                  >
                    <CheckCircle2 size={13} aria-hidden />
                  </span>
                )}
                {available && /нет доступа/i.test(info?.detail ?? '') && (
                  <span
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hb-warn-soft)] text-amber-300"
                    title={info?.detail ?? 'Нет доступа к файлам настроек приложения'}
                    aria-label="Нет доступа"
                  >
                    <ShieldAlert size={12} aria-hidden />
                  </span>
                )}
                {!available && (
                  <span
                    className="text-xs faint"
                    title={info?.detail ?? shortUnavailable(info?.detail)}
                  >
                    нет
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <button
          type="button"
          disabled={busy}
          className="btn-primary"
          title="Прописать 127.0.0.1 в выбранные приложения"
          onClick={() => void run('apply')}
        >
          {busyMode === 'apply' && <Loader2 size={14} className="animate-spin" aria-hidden />}
          <span className="whitespace-nowrap">
            {busyMode === 'apply' ? 'Прописываю…' : 'Прописать'}
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          className="btn-secondary"
          title="Убрать прописку и вернуть прямой IP телефона"
          onClick={() => void run('revert')}
        >
          {busyMode === 'revert' && <Loader2 size={14} className="animate-spin" aria-hidden />}
          <span className="whitespace-nowrap">
            {busyMode === 'revert' ? 'Откатываю…' : 'Откатить'}
          </span>
        </button>
      </div>

      {doc && doc.length > 0 && (
        <ul className="stack stack-1 rounded-[10px] border border-[var(--hb-border)] bg-black/20 px-2.5 py-2">
          {doc.map((line, i) => {
            const tone =
              line.tone === 'ok'
                ? { label: 'Успешно', hint: 'Операция выполнена', Icon: CheckCircle2, cls: 'log-line-ok' }
                : line.tone === 'err'
                  ? {
                      label: 'Ошибка',
                      hint: 'Не удалось выполнить. См. текст справа.',
                      Icon: CircleAlert,
                      cls: 'log-line-err',
                    }
                  : line.tone === 'warn'
                    ? {
                        label: 'Внимание',
                        hint: 'Нужно действие с вашей стороны',
                        Icon: AlertTriangle,
                        cls: 'log-line-warn',
                      }
                    : {
                        label: 'Подсказка',
                        hint: 'Дополнительная информация',
                        Icon: Info,
                        cls: 'log-line-info',
                      }
            const Glyph = tone.Icon
            return (
              <li
                key={i}
                className={`log-line ${tone.cls}`}
                title={`${tone.label}: ${line.text}`}
              >
                <span className="log-line-icon" title={tone.hint} aria-label={tone.label}>
                  <Glyph size={12} aria-hidden />
                </span>
                <span className="log-line-text">{line.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
