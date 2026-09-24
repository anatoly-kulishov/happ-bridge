/// <reference types="vite/client" />

import type { HappBridgeApi } from '../electron/preload'

declare global {
  interface Window {
    happBridge: HappBridgeApi
  }
}

export {}
