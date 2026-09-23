import { useCallback, useState } from 'react'
import type { BridgeState } from '../../electron/types'

export function useBridgeActions(onState: (s: BridgeState) => void) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'socks' | 'http' | null>(null)

  const findPhone = useCallback(async () => {
    setBusy(true)
    try {
      const { state } = await window.happBridge.findPhone()
      onState(state)
      return state
    } finally {
      setBusy(false)
    }
  }, [onState])

  const copy = useCallback(async (kind: 'socks' | 'http') => {
    await window.happBridge.copy(kind)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1500)
  }, [])

  return { busy, copied, findPhone, copy }
}
