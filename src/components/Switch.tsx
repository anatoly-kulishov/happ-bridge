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
            ? `${labelText} — включено, нажмите чтобы выключить`
            : `${labelText} — выключено, нажмите чтобы включить`
      }
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 rounded-[10px] px-1 py-1.5 text-left transition-colors hover:bg-[var(--hb-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hb-ring)] disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--hb-text)]">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-snug muted">{hint}</span> : null}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${
          checked
            ? 'border-sky-400/40 bg-sky-500/25'
            : 'border-[var(--hb-border-strong)] bg-black/30'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[calc(100%-4px)] aspect-square rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--hb-ease)] ${
            checked ? 'translate-x-[1.35rem]' : 'translate-x-0'
          }`}
        />
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
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${
        checked
          ? 'border-sky-400/40 bg-sky-500/25'
          : 'border-[var(--hb-border-strong)] bg-black/30'
      } ${className}`}
      {...rest}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-[calc(100%-4px)] aspect-square rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--hb-ease)] ${
          checked ? 'translate-x-[1.35rem]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
