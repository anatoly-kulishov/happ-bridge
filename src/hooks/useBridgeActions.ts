import { useCallback, useState } from 'react'
import type { CopyPreset } from '../../electron/presets'
import type { BridgeState } from '../../electron/types'

export function useBridgeActions(onState: (s: BridgeState) => void) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<CopyPreset | null>(null)

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

  const copy = useCallback(async (kind: CopyPreset) => {
    await window.happBridge.copy(kind)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1500)
  }, [])

  const diagnose = useCallback(async () => {
    setBusy(true)
    try {
      const state = await window.happBridge.diagnose()
      onState(state)
      return state
    } finally {
      setBusy(false)
    }
  }, [onState])

  const checkUpdates = useCallback(async () => {
    const state = await window.happBridge.checkUpdates()
    onState(state)
    return state
  }, [onState])

  return { busy, copied, findPhone, copy, diagnose, checkUpdates }
}
