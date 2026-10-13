import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { BridgeState } from '../electron/types'
import { Loader2 } from './icons'
import { Settings } from './components/Settings'

const Wizard = lazy(() =>
  import('./components/Wizard').then((m) => ({ default: m.Wizard })),
)

function Boot() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 text-sm muted">
      <Loader2 size={22} className="animate-spin text-sky-400" />
      Загрузка…
    </div>
  )
}

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

  if (!state) return <Boot />

  const showWizard = forceWizard || !state.settings.wizardDone

  if (showWizard) {
    return (
      <Suspense fallback={<Boot />}>
        <Wizard
          state={state}
          onDone={async () => {
            await window.happBridge.finishWizard()
            setForceWizard(false)
            await refresh()
          }}
          onDismiss={
            state.settings.wizardDone || forceWizard
              ? () => setForceWizard(false)
              : undefined
          }
          onState={setState}
        />
      </Suspense>
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
