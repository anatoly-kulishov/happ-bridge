import { Loader2, type LucideIcon } from 'lucide-react'

type Props = {
  busy: boolean
  icon: LucideIcon
  size?: number
  className?: string
}

/** Swap a button icon for a spinner while the action is in flight. */
export function BusyIcon({ busy, icon: Icon, size = 14, className = '' }: Props) {
  if (busy) {
    return <Loader2 size={size} className={`animate-spin ${className}`.trim()} aria-hidden />
  }
  return <Icon size={size} className={className || undefined} aria-hidden />
}
