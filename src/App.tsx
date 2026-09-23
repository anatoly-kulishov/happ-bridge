import { useCallback, useEffect, useState } from 'react'
import type { BridgeState } from '../electron/types'
import { Wizard } from './components/Wizard'
import { Settings } from './components/Settings'

export default function App() {
  const [state, setState] = useState<BridgeState | null>(null)
  const [forceWizard, setForceWizard] = useState(false)

  useEffect(() => {
    void window.happBridge.getState().then(setState)
    return window.happBridge.onState(setState)
  }, [])

  const refresh = useCallback(async () => {
    setState(await window.happBridge.getState())
  }, [])

  if (!state) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        Загрузка…
      </div>
    )
  }

  const showWizard = forceWizard || !state.settings.wizardDone

  if (showWizard) {
    return (
      <Wizard
        state={state}
        onDone={async () => {
          await window.happBridge.finishWizard()
          setForceWizard(false)
          await refresh()
        }}
        onState={setState}
      />
    )
  }

  return (
    <Settings
      state={state}
      onState={setState}
      onShowWizard={() => setForceWizard(true)}
    />
  )
}
