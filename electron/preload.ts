import { contextBridge, ipcRenderer } from 'electron'
import type {
  InjectBatchResult,
  InjectTarget,
  InjectTargetInfo,
} from './inject'
import type { CopyPreset } from './presets'
import type { AppSettings, BridgeState } from './types'

const api = {
  getState: (): Promise<BridgeState> => ipcRenderer.invoke('bridge:getState'),
  findPhone: (): Promise<{ ok: boolean; state: BridgeState }> =>
    ipcRenderer.invoke('bridge:findPhone'),
  selectPhone: (ip: string): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:selectPhone', ip),
  copy: (kind: CopyPreset): Promise<string> =>
    ipcRenderer.invoke('bridge:copy', kind),
  saveSettings: (patch: Partial<AppSettings>): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:saveSettings', patch),
  finishWizard: (): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:finishWizard'),
  markHomeNetwork: (): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:markHomeNetwork'),
  diagnose: (): Promise<BridgeState> => ipcRenderer.invoke('bridge:diagnose'),
  checkUpdates: (): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:checkUpdates'),
  injectStatus: (): Promise<InjectTargetInfo[]> =>
    ipcRenderer.invoke('bridge:injectStatus'),
  injectApply: (targets: InjectTarget[]): Promise<InjectBatchResult> =>
    ipcRenderer.invoke('bridge:injectApply', targets),
  injectRevert: (targets: InjectTarget[]): Promise<InjectBatchResult> =>
    ipcRenderer.invoke('bridge:injectRevert', targets),
  injectRelaunchOffer: (
    targets: InjectTarget[],
  ): Promise<{
    restarted: boolean
    results: { id: InjectTarget; ok: boolean; message: string }[]
  }> => ipcRenderer.invoke('bridge:injectRelaunchOffer', targets),
  onState: (cb: (state: BridgeState) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: BridgeState) => cb(state)
    ipcRenderer.on('bridge:state', handler)
    return () => ipcRenderer.removeListener('bridge:state', handler)
  },
}

contextBridge.exposeInMainWorld('happBridge', api)

export type HappBridgeApi = typeof api
