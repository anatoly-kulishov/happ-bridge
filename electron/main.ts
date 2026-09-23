import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from 'electron'
import path from 'node:path'
import { BridgeSession } from './session'
import { statusPresentation } from './types'
import type { AppSettings, BridgeStatus } from './types'

const isDev = !app.isPackaged

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false
let session: BridgeSession | null = null

function broadcast(): void {
  if (!session) return
  const state = session.getState()
  mainWindow?.webContents.send('bridge:state', state)
  syncTray(state.status, state.phoneIp, state.socksLocal, state.httpLocal)
}

function createWindow(show = true): void {
  if (mainWindow) {
    if (show) {
      mainWindow.show()
      mainWindow.focus()
    }
    return
  }

  mainWindow = new BrowserWindow({
    width: 440,
    height: 620,
    resizable: false,
    show,
    title: 'Happ Bridge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload uses contextBridge only; sandbox stays off for vite-plugin-electron path resolution
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function trayIcon(color: 'green' | 'yellow' | 'red'): Electron.NativeImage {
  const file = `tray-${color}.png`
  const candidates = [
    path.join(__dirname, '../resources', file),
    path.join(process.resourcesPath, file),
  ]
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  return nativeImage.createEmpty()
}

function syncTray(
  status: BridgeStatus,
  phoneIp: string | null,
  socksLocal: string,
  httpLocal: string,
): void {
  if (!tray || !session) return
  const ui = statusPresentation(status, phoneIp)
  tray.setImage(trayIcon(ui.tone))
  tray.setToolTip(ui.trayTip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: ui.label, enabled: false },
      { type: 'separator' },
      {
        label: `Скопировать SOCKS5 (${socksLocal})`,
        click: () => clipboard.writeText(socksLocal),
      },
      {
        label: `Скопировать HTTP (${httpLocal})`,
        click: () => clipboard.writeText(httpLocal),
      },
      { type: 'separator' },
      {
        label: 'Найти снова',
        click: () => {
          void session?.connect('user').then(() => broadcast())
        },
      },
      { label: 'Настройки…', click: () => createWindow(true) },
      { type: 'separator' },
      {
        label: 'Выйти',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
}

function createTray(): void {
  if (!session) return
  tray = new Tray(trayIcon('yellow'))
  const state = session.getState()
  syncTray(state.status, state.phoneIp, state.socksLocal, state.httpLocal)
}

function applyOpenAtLogin(enabled: boolean): void {
  if (isDev) return
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
}

function registerIpc(): void {
  ipcMain.handle('bridge:getState', () => session!.getState())

  ipcMain.handle('bridge:findPhone', async () => {
    const ok = await session!.connect('user')
    return { ok, state: session!.getState() }
  })

  ipcMain.handle('bridge:copy', (_e, kind: 'socks' | 'http') => {
    const state = session!.getState()
    const text = kind === 'socks' ? state.socksLocal : state.httpLocal
    clipboard.writeText(text)
    return text
  })

  ipcMain.handle('bridge:saveSettings', async (_e, patch: Partial<AppSettings>) => {
    return session!.updateSettings(patch)
  })

  ipcMain.handle('bridge:finishWizard', () => session!.markWizardDone())
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.hide()

  session = new BridgeSession({
    onChange: broadcast,
    applyOpenAtLogin,
  })

  registerIpc()
  createTray()
  applyOpenAtLogin(session.getState().settings.openAtLogin)

  if (!session.getState().settings.wizardDone) createWindow(true)

  await session.connect('startup')
  session.startWatch()
})

app.on('before-quit', async () => {
  isQuitting = true
  await session?.dispose()
})

app.on('window-all-closed', () => {
  // tray process stays alive
})
