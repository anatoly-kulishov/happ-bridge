import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  applyInject,
  injectStatus,
  relaunchInjectApps,
  revertInject,
  type InjectTarget,
} from './inject'
import { presetText, type CopyPreset } from './presets'
import { BridgeSession } from './session'
import { statusPresentation } from './types'
import type { AppSettings, BridgeStatus } from './types'
import { createUpdater } from './updater'

const isDev = !app.isPackaged

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false
let session: BridgeSession | null = null
let lastTrayKey = ''
let quitCleanupDone = false

function broadcast(): void {
  if (!session) return
  const state = session.getState()
  mainWindow?.webContents.send('bridge:state', state)
  syncTray(state)
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
    width: 460,
    height: 680,
    resizable: false,
    show,
    title: 'Happ Bridge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
  const file2x = `tray-${color}@2x.png`
  const bases = [
    path.join(__dirname, '../resources'),
    process.resourcesPath,
  ]

  for (const base of bases) {
    const p1 = path.join(base, file)
    const p2 = path.join(base, file2x)
    if (!fs.existsSync(p1) && !fs.existsSync(p2)) continue

    if (fs.existsSync(p1) && fs.existsSync(p2)) {
      const img = nativeImage.createFromPath(p1)
      img.addRepresentation({
        scaleFactor: 2.0,
        width: 36,
        height: 36,
        buffer: fs.readFileSync(p2),
      })
      if (!img.isEmpty()) return img
    }

    const img = nativeImage.createFromPath(fs.existsSync(p1) ? p1 : p2)
    if (!img.isEmpty()) return img
  }

  return fallbackTrayIcon(color)
}

/** Always-visible status LED if pack paths break. */
function fallbackTrayIcon(color: 'green' | 'yellow' | 'red'): Electron.NativeImage {
  const hex =
    color === 'green' ? '#34d399' : color === 'yellow' ? '#fbbf24' : '#f87171'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="12" fill="${hex}"/></svg>`
  const img = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  )
  return img
}

function syncTray(state: {
  status: BridgeStatus
  phoneIp: string | null
  socksLocal: string
  httpLocal: string
  settings: AppSettings
}): void {
  if (!tray || !session) return
  const ui = statusPresentation(state.status, state.phoneIp)
  const key = `${state.status}|${state.phoneIp ?? ''}|${state.socksLocal}|${state.httpLocal}`
  if (key === lastTrayKey) return
  lastTrayKey = key

  tray.setImage(trayIcon(ui.tone))
  tray.setToolTip(ui.trayTip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: ui.label, enabled: false },
      { type: 'separator' },
      {
        label: `Скопировать SOCKS5 (${state.socksLocal})`,
        click: () => clipboard.writeText(state.socksLocal),
      },
      {
        label: `Скопировать HTTP (${state.httpLocal})`,
        click: () => clipboard.writeText(state.httpLocal),
      },
      { type: 'separator' },
      {
        label: 'Найти снова',
        click: () => {
          void session?.connect('user').then(() => broadcast())
        },
      },
      {
        label: 'Диагностика',
        click: () => {
          void session?.diagnose().then(() => {
            broadcast()
            createWindow(true)
          })
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
  if (tray) return
  tray = new Tray(trayIcon('yellow'))
  // macOS: left-click already opens setContextMenu. Do not also show the window
  // (that stacked dropdown + desktop UI). Window opens from «Настройки…».
  tray.setIgnoreDoubleClickEvents(true)
  lastTrayKey = ''
  syncTray(session.getState())
}

function applyOpenAtLogin(enabled: boolean): void {
  if (isDev) return
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
}

function registerIpc(updater: ReturnType<typeof createUpdater>): void {
  ipcMain.handle('bridge:getState', () => session!.getState())

  ipcMain.handle('bridge:findPhone', async () => {
    const ok = await session!.connect('user')
    return { ok, state: session!.getState() }
  })

  ipcMain.handle('bridge:selectPhone', async (_e, ip: string) => {
    return session!.selectPhone(ip)
  })

  ipcMain.handle('bridge:copy', (_e, kind: CopyPreset) => {
    const state = session!.getState()
    const text = presetText(kind, state.settings.socksPort, state.settings.httpPort)
    clipboard.writeText(text)
    return text
  })

  ipcMain.handle('bridge:saveSettings', async (_e, patch: Partial<AppSettings>) => {
    return session!.updateSettings(patch)
  })

  ipcMain.handle('bridge:finishWizard', () => session!.markWizardDone())

  ipcMain.handle('bridge:diagnose', async () => session!.diagnose())

  ipcMain.handle('bridge:checkUpdates', async () => {
    const info = await updater.check()
    session!.setUpdateInfo(info)
    return session!.getState()
  })

  ipcMain.handle('bridge:injectStatus', () => {
    const s = session!.getState()
    return injectStatus(injectPortsFromState(s), undefined, injectBackupPath())
  })

  ipcMain.handle('bridge:injectApply', async (_e, targets: InjectTarget[]) => {
    const s = session!.getState()
    return applyInject(
      targets,
      injectPortsFromState(s),
      undefined,
      injectBackupPath(),
    )
  })

  ipcMain.handle('bridge:injectRevert', async (_e, targets: InjectTarget[]) => {
    const s = session!.getState()
    return revertInject(
      targets,
      injectPortsFromState(s),
      undefined,
      injectBackupPath(),
    )
  })

  ipcMain.handle('bridge:injectRelaunchOffer', async (_e, targets: InjectTarget[]) => {
    const labels = targets
      .map((id) => (id === 'cursor' ? 'Cursor' : id === 'webstorm' ? 'WebStorm' : 'Firefox'))
      .join(', ')
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Перезапустить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      message: 'Перезапустить приложения?',
      detail: `${labels}\n\nЧтобы подтянуть новый прокси, нужен полный перезапуск (не просто окно).`,
    })
    if (response !== 0) return { restarted: false as const, results: [] }
    const results = await relaunchInjectApps(targets)
    return { restarted: true as const, results }
  })
}

function injectBackupPath(): string {
  return path.join(app.getPath('userData'), 'inject-backups.json')
}

function injectPortsFromState(s: {
  phoneIp: string | null
  settings: AppSettings
}): { socksPort: number; httpPort: number; phoneIp: string | null } {
  return {
    socksPort: s.settings.socksPort,
    httpPort: s.settings.httpPort,
    phoneIp: s.phoneIp ?? s.settings.manualIp ?? s.settings.lastPhoneIp ?? null,
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.hide()

  const updater = createUpdater({
    onChange: (info) => session?.setUpdateInfo(info),
  })

  session = new BridgeSession({
    onChange: broadcast,
    applyOpenAtLogin,
  })
  session.setUpdateInfo(updater.getInfo())

  registerIpc(updater)
  createTray()
  applyOpenAtLogin(session.getState().settings.openAtLogin)

  if (!session.getState().settings.wizardDone) createWindow(true)

  await session.connect('startup')
  session.startWatch()

  if (!isDev) void updater.check()
})

app.on('before-quit', (event) => {
  if (quitCleanupDone) return
  event.preventDefault()
  isQuitting = true

  void (async () => {
    try {
      await session?.dispose()
    } finally {
      quitCleanupDone = true
      app.quit()
    }
  })()
})

app.on('window-all-closed', () => {
  // tray process stays alive
})
