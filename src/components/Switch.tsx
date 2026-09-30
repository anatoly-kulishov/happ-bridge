import type { ButtonHTMLAttributes } from 'react'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
    >
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
          checked
            ? 'border-sky-500/50 bg-sky-500/20'
            : 'border-zinc-700 bg-zinc-900'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[calc(100%-4px)] aspect-square rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
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
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
        checked
          ? 'border-sky-500/50 bg-sky-500/20'
          : 'border-zinc-700 bg-zinc-900'
      } ${className}`}
      {...rest}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-[calc(100%-4px)] aspect-square rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}