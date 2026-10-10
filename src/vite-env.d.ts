/// <reference types="vite/client" />

import type { HappBridgeApi } from '../electron/preload'

declare global {
  interface Window {
    happBridge: HappBridgeApi
    /** Unsaved settings flag for Electron close/hide confirm. */
    __hbDirty?: boolean
  }
}

export {}
