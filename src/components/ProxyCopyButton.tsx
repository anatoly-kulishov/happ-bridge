import { Check, Copy, Ban } from '../icons'

type Props = {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  disabled?: boolean
}

export function ProxyCopyButton({ label, value, copied, onCopy, disabled }: Props) {
  const action = disabled
    ? 'Мост не подключён, адрес пока не работает'
    : copied
      ? `${label}: скопировано`
      : `Копировать ${label}${value ? ` · ${value}` : ''}`
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onCopy}
      disabled={disabled}
      aria-label={action}
      title={action}
      className="copy-btn"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs muted">{label}</span>
        <span className={`mt-0.5 block truncate mono-sm ${disabled ? 'faint' : ''}`}>
          {disabled ? 'нет' : value}
        </span>
      </span>
      <span
        className={`copy-btn-icon${disabled ? ' copy-btn-icon-off' : copied ? ' copy-btn-icon-ok' : ''}`}
        title={disabled ? 'Недоступно' : copied ? 'Скопировано' : 'Копировать'}
        aria-hidden
      >
        {disabled ? <Ban size={15} /> : copied ? <Check size={15} /> : <Copy size={15} />}
      </span>
    </button>
  )
}
