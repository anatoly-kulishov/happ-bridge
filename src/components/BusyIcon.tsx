import { Loader2, type IconProps } from '../icons'

type IconComp = (props: IconProps) => React.ReactNode

type Props = {
  busy: boolean
  icon: IconComp
  size?: number
  className?: string
}

/** Swap a button icon for a spinner while the action is in flight. */
export function BusyIcon({ busy, icon: Icon, size = 14, className = '' }: Props) {
  if (busy) {
    return <Loader2 size={size} className={`animate-spin ${className}`.trim()} />
  }
  return <Icon size={size} className={className || undefined} />
}
