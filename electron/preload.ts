import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, BridgeState } from './types'

const api = {
  getState: (): Promise<BridgeState> => ipcRenderer.invoke('bridge:getState'),
  findPhone: (): Promise<{ ok: boolean; state: BridgeState }> =>
    ipcRenderer.invoke('bridge:findPhone'),
  copy: (kind: 'socks' | 'http'): Promise<string> =>
    ipcRenderer.invoke('bridge:copy', kind),
  saveSettings: (patch: Partial<AppSettings>): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:saveSettings', patch),
  finishWizard: (): Promise<BridgeState> =>
    ipcRenderer.invoke('bridge:finishWizard'),
  onState: (cb: (state: BridgeState) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: BridgeState) => cb(state)
    ipcRenderer.on('bridge:state', handler)
    return () => ipcRenderer.removeListener('bridge:state', handler)
  },
}

contextBridge.exposeInMainWorld('happBridge', api)

export type HappBridgeApi = typeof api
