import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  type IconProps,
} from '../icons'
import type { ReactNode } from 'react'

export type AlertTone = 'danger' | 'warning' | 'success'

type IconComp = (props: IconProps) => React.ReactNode

type Props = {
  tone?: AlertTone
  title: string
  children?: ReactNode
  actions?: ReactNode
  icon?: IconComp
}

function defaultIcon(tone: AlertTone): IconComp {
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
  const Glyph = Icon ?? defaultIcon(tone)
  const toneHint =
    tone === 'danger'
      ? 'Ошибка'
      : tone === 'warning'
        ? 'Внимание'
        : 'Успешно'
  return (
    <div className={`alert alert-${tone}`} role="alert" title={title}>
      <div className="alert-grid">
        <span className="alert-icon" title={toneHint} aria-hidden>
          <Glyph size={18} />
        </span>
        <div className="alert-main">
          <p className="alert-title">{title}</p>
          {children ? <div className="alert-body">{children}</div> : null}
          {actions ? <div className="alert-actions">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

export type BridgeErrorKind =
  | 'port-in-use'
  | 'permission'
  | 'auth'
  | 'validation'
  | 'guidance'
  | 'wake-phone'
  | 'generic'

export type ParsedBridgeError = {
  kind: BridgeErrorKind
  title: string
  body: string
  /** Suggested banner tone for this classification. */
  tone: AlertTone
  port?: string
}

/** Split backend Russian error strings into title / body / actionable kind. */
export function parseBridgeError(error: string): ParsedBridgeError {
  const trimmed = error.trim()
  if (!trimmed) {
    return {
      kind: 'generic',
      title: 'Сообщение об ошибке пусто',
      body: '',
      tone: 'warning',
    }
  }

  const portBusy = /Порт\s+(\d+|прокси)\s+уже занят/i.exec(trimmed)
  if (portBusy) {
    const port = portBusy[1] === 'прокси' ? undefined : portBusy[1]
    return {
      kind: 'port-in-use',
      title: port ? `Порт ${port} занят` : 'Порт прокси занят',
      body: 'Скорее всего запущена другая копия Happ Bridge (иконка в строке меню или старая сборка). Закройте её через меню → Выход или смените порты ниже.',
      tone: 'danger',
      port,
    }
  }

  if (/Полный доступ к диску|нет доступа/i.test(trimmed)) {
    return {
      kind: 'permission',
      title: 'Нет доступа к файлам',
      body: trimmed,
      tone: 'warning',
    }
  }
  if (/Локальная сеть|Local Network/i.test(trimmed)) {
    return {
      kind: 'permission',
      title: 'Нет доступа к локальной сети',
      body: trimmed,
      tone: 'warning',
    }
  }

  if (/логин\/пароль LAN|пароль LAN/i.test(trimmed) && /Happ/i.test(trimmed)) {
    return {
      kind: 'auth',
      title: 'Нужен пароль Happ LAN',
      body: trimmed,
      tone: 'warning',
    }
  }

  if (/^Некорректный IP$/i.test(trimmed)) {
    return {
      kind: 'validation',
      title: 'Некорректный IP',
      body: 'Проверьте адрес телефона в расширенных настройках.',
      tone: 'warning',
    }
  }

  if (/SSID не определён/i.test(trimmed)) {
    return {
      kind: 'validation',
      title: 'Wi‑Fi не определён',
      body: trimmed,
      tone: 'warning',
    }
  }

  if (/не отмечена как домашняя|автоподключение отключено/i.test(trimmed)) {
    return {
      kind: 'guidance',
      title: 'Автоподключение отключено',
      body: trimmed,
      tone: 'warning',
    }
  }

  if (/Найдено\s+\d+\s+прокси/i.test(trimmed) || /Выберите телефон в списке/i.test(trimmed)) {
    return {
      kind: 'guidance',
      title: 'Выберите телефон',
      body: trimmed,
      tone: 'warning',
    }
  }

  if (/другой сети \(VPN/i.test(trimmed) || /Дождитесь.*VPN/i.test(trimmed)) {
    return {
      kind: 'guidance',
      title: 'Телефон в другой сети',
      body: trimmed,
      tone: 'warning',
    }
  }

  if (/в сети, но Happ не отвечает/i.test(trimmed)) {
    return {
      kind: 'wake-phone',
      title: 'Happ не отвечает на телефоне',
      body: trimmed,
      tone: 'warning',
    }
  }

  return {
    kind: 'generic',
    title: 'Не удалось подключиться',
    body: trimmed,
    tone: 'danger',
  }
}
