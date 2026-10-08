import { AlertTriangle, CheckCircle2, CircleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type AlertTone = 'danger' | 'warning' | 'success'

type Props = {
  tone?: AlertTone
  title: string
  children?: ReactNode
  actions?: ReactNode
  icon?: LucideIcon
}

const toneClass: Record<AlertTone, { box: string; icon: string; title: string; body: string }> = {
  danger: {
    box: 'border-red-500/35 bg-red-500/10',
    icon: 'text-red-300',
    title: 'text-red-50',
    body: 'text-red-100/75',
  },
  warning: {
    box: 'border-amber-500/35 bg-amber-500/10',
    icon: 'text-amber-300',
    title: 'text-amber-50',
    body: 'text-amber-100/75',
  },
  success: {
    box: 'border-emerald-500/35 bg-emerald-500/10',
    icon: 'text-emerald-300',
    title: 'text-emerald-50',
    body: 'text-emerald-100/75',
  },
}

function defaultIcon(tone: AlertTone): LucideIcon {
  switch (tone) {
    case 'warning':
      return AlertTriangle
    case 'success':
      return CheckCircle2
    case 'danger':
      return CircleAlert
    default: {
      const _exhaustive: never = tone
      return _exhaustive
    }
  }
}

/** Structured alert used for connection errors and network warnings. */
export function AlertBanner({
  tone = 'danger',
  title,
  children,
  actions,
  icon: Icon,
}: Props) {
  const t = toneClass[tone]
  const Glyph = Icon ?? defaultIcon(tone)
  return (
    <div className={`rounded-xl border p-3 ${t.box}`} role="alert">
      <div className="flex items-start gap-2.5">
        <Glyph size={18} className={`mt-0.5 shrink-0 ${t.icon}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium tracking-tight ${t.title}`}>{title}</p>
          {children && (
            <div className={`mt-1 text-xs leading-relaxed ${t.body}`}>{children}</div>
          )}
          {actions && <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  )
}

export type BridgeErrorKind = 'port-in-use' | 'permission' | 'generic'

export type ParsedBridgeError = {
  kind: BridgeErrorKind
  title: string
  body: string
  port?: string
}

/** Split backend Russian error strings into title / body / actionable kind. */
export function parseBridgeError(error: string): ParsedBridgeError {
  const portBusy = /Порт\s+(\d+|прокси)\s+уже занят/i.exec(error)
  if (portBusy) {
    const port = portBusy[1] === 'прокси' ? undefined : portBusy[1]
    return {
      kind: 'port-in-use',
      title: port ? `Порт ${port} занят` : 'Порт прокси занят',
      body: 'Скорее всего запущена другая копия Happ Bridge (иконка в строке меню или старая сборка). Закройте её через меню → Выход, либо смените порты ниже.',
      port,
    }
  }
  if (/Полный доступ к диску|нет доступа/i.test(error)) {
    return {
      kind: 'permission',
      title: 'Нет доступа к файлам',
      body: error,
    }
  }
  if (/Локальная сеть|Local Network/i.test(error)) {
    return {
      kind: 'permission',
      title: 'Нет доступа к локальной сети',
      body: error,
    }
  }
  return {
    kind: 'generic',
    title: 'Не удалось подключиться',
    body: error,
  }
}
