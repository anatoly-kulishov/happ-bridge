import type { ReactNode, SVGProps } from 'react'

/** Tiny inline icons — replaces lucide-react (~tens of KB) with ~2KB total. */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function I({ size = 16, className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export function Loader2(p: IconProps) {
  return (
    <I {...p}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </I>
  )
}

export function Check(p: IconProps) {
  return (
    <I {...p}>
      <path d="M20 6 9 17l-5-5" />
    </I>
  )
}

export function Copy(p: IconProps) {
  return (
    <I {...p}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16V4a2 2 0 0 1 2-2h12" />
    </I>
  )
}

export function Ban(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </I>
  )
}

export function Save(p: IconProps) {
  return (
    <I {...p}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7H7v7" />
      <path d="M7 3v4h8" />
    </I>
  )
}

export function Plug(p: IconProps) {
  return (
    <I {...p}>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-12 0V8Z" />
    </I>
  )
}

export function Wifi(p: IconProps) {
  return (
    <I {...p}>
      <path d="M12 20h.01" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <path d="M5 12.859a10 10 0 0 1 14 0" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </I>
  )
}

export function Download(p: IconProps) {
  return (
    <I {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </I>
  )
}

export function Sparkles(p: IconProps) {
  return (
    <I {...p}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </I>
  )
}

export function RefreshCw(p: IconProps) {
  return (
    <I {...p}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </I>
  )
}

export function RefreshCcw(p: IconProps) {
  return (
    <I {...p}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </I>
  )
}

export function Search(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </I>
  )
}

export function X(p: IconProps) {
  return (
    <I {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </I>
  )
}

export function Home(p: IconProps) {
  return (
    <I {...p}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </I>
  )
}

export function Wrench(p: IconProps) {
  return (
    <I {...p}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </I>
  )
}

export function Gauge(p: IconProps) {
  return (
    <I {...p}>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </I>
  )
}

export function ShieldAlert(p: IconProps) {
  return (
    <I {...p}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </I>
  )
}

export function ShieldCheck(p: IconProps) {
  return (
    <I {...p}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </I>
  )
}

export function ChevronDown(p: IconProps) {
  return (
    <I {...p}>
      <path d="m6 9 6 6 6-6" />
    </I>
  )
}

export function ChevronRight(p: IconProps) {
  return (
    <I {...p}>
      <path d="m9 18 6-6-6-6" />
    </I>
  )
}

export function CirclePlus(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </I>
  )
}

export function History(p: IconProps) {
  return (
    <I {...p}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </I>
  )
}

export function Unplug(p: IconProps) {
  return (
    <I {...p}>
      <path d="m19 5 3-3" />
      <path d="m2 22 3-3" />
      <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />
      <path d="m7.5 13.5 6 6" />
      <path d="M12 18l6.3-6.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0L12 6" />
    </I>
  )
}

export function AlertTriangle(p: IconProps) {
  return (
    <I {...p}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </I>
  )
}

export function CheckCircle2(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </I>
  )
}

export function CircleAlert(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </I>
  )
}

export function Info(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </I>
  )
}

export function MousePointer2(p: IconProps) {
  return (
    <I {...p}>
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.721a2 2 0 0 0-1.377 1.377l-1.72 6.124a.5.5 0 0 1-.947.063z" />
    </I>
  )
}

export function Code2(p: IconProps) {
  return (
    <I {...p}>
      <path d="m18 16 4-4-4-4" />
      <path d="m6 8-4 4 4 4" />
      <path d="m14.5 4-5 16" />
    </I>
  )
}

export function AppWindow(p: IconProps) {
  return (
    <I {...p}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M10 4v4" />
      <path d="M2 8h20" />
      <path d="M6 4v4" />
    </I>
  )
}
