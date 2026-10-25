import { useCallback, useState } from 'react'
import type { CopyPreset } from '../../electron/presets'
import type { BridgeState } from '../../electron/types'

export function useBridgeActions(onState: (s: BridgeState) => void) {
  const [busy, setBusy] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
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

  const [scanning, setScanning] = useState(false)
  const scanPeers = useCallback(async () => {
    setScanning(true)
    try {
      onState(await window.happBridge.scanPeers())
    } finally {
      setScanning(false)
    }
  }, [onState])

  const copy = useCallback(async (kind: CopyPreset) => {
    await window.happBridge.copy(kind)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1500)
  }, [])

  const diagnose = useCallback(async () => {
    setDiagnosing(true)
    try {
      const state = await window.happBridge.diagnose()
      onState(state)
      return state
    } finally {
      setDiagnosing(false)
    }
  }, [onState])

  const checkUpdates = useCallback(async () => {
    setCheckingUpdates(true)
    try {
      const state = await window.happBridge.checkUpdates()
      onState(state)
      return state
    } finally {
      setCheckingUpdates(false)
    }
  }, [onState])

  const installUpdate = useCallback(async () => {
    await window.happBridge.installUpdate()
  }, [])

  const [testingIp, setTestingIp] = useState(false)
  const testPhone = useCallback(async (ip: string) => {
    setTestingIp(true)
    try {
      return await window.happBridge.testPhone(ip)
    } finally {
      setTestingIp(false)
    }
  }, [])

  const [applyingManualIp, setApplyingManualIp] = useState(false)
  const applyManualIp = useCallback(
    async (ip: string) => {
      setApplyingManualIp(true)
      try {
        const state = await window.happBridge.applyManualIp(ip)
        onState(state)
        return state
      } finally {
        setApplyingManualIp(false)
      }
    },
    [onState],
  )

  return {
    busy,
    diagnosing,
    checkingUpdates,
    copied,
    findPhone,
    scanPeers,
    scanning,
    copy,
    diagnose,
    checkUpdates,
    installUpdate,
    testingIp,
    testPhone,
    applyingManualIp,
    applyManualIp,
  }
}
