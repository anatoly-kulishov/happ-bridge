import type { ButtonHTMLAttributes } from 'react'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  disabled?: boolean
  hint?: React.ReactNode
}

export function Switch({ checked, onChange, label, disabled, hint }: Props) {
  const labelText =
    typeof label === 'string' ? label : checked ? 'Включено' : 'Выключено'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={
        hint && typeof hint === 'string'
          ? `${labelText}: ${hint}`
          : checked
            ? `${labelText}: включено. Нажмите, чтобы выключить`
            : `${labelText}: выключено. Нажмите, чтобы включить`
      }
      onClick={() => onChange(!checked)}
      className="switch"
    >
      <span className="min-w-0">
        <span className="switch-label">{label}</span>
        {hint ? <span className="switch-hint">{hint}</span> : null}
      </span>
      <span className={`switch-track${checked ? ' switch-track-on' : ''}`} aria-hidden>
        <span className="switch-thumb" />
      </span>
    </button>
  )
}

type SwitchRawProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean
}

export function SwitchRaw({ checked, className = '', ...rest }: SwitchRawProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch-track${checked ? ' switch-track-on' : ''} ${className}`.trim()}
      {...rest}
    >
      <span className="switch-thumb" aria-hidden />
    </button>
  )
}
