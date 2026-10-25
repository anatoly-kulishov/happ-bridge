import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  Tray,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { InjectIconMap } from './appIcons'
import type { InjectTarget, InjectTargetInfo } from './inject'
import { presetText, type CopyPreset } from './presets'
import { BridgeSession } from './session'
import { socksAuthFromSettings, statusPresentation, traySecurityPresentation } from './types'
import type { AppSettings, BridgeStatus } from './types'
import { createUpdater } from './updater'
import { log, logFilePath, readLogTail } from './log'

const isDev = !app.isPackaged

// Cap V8 heap early — menu-bar utility on weak Macs.
if (!isDev) {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192')
}

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false
let session: BridgeSession | null = null
let lastTrayKey = ''
let quitCleanupDone = false
let updater: ReturnType<typeof createUpdater> | null = null
let quitInFlight: Promise<void> | null = null

/** Dispose session, then quit (or apply a pending update if requested). */
function quitApp(opts?: { installUpdate?: boolean }): Promise<void> {
  if (quitCleanupDone) {
    app.quit()
    return Promise.resolve()
  }
  if (quitInFlight) return quitInFlight
  isQuitting = true
  const wantUpdate = Boolean(opts?.installUpdate && updater?.canInstall())
  quitInFlight = (async () => {
    try {
      await session?.dispose()
    } finally {
      if (wantUpdate && updater) {
        // Mark cleanup done so before-quit does not preventDefault around app.exit.
        quitCleanupDone = true
        const applied = await updater.install()
        if (applied) return
        // Install failed: stay alive so the user sees the error banner.
        isQuitting = false
        quitCleanupDone = false
        quitInFlight = null
        broadcast()
        return
      }
      // The CLI env block is intentionally kept: it is guarded in the shell rc
      // (`/dev/tcp` probe) so a stale block is inert when the listener is down.
      quitCleanupDone = true
      app.quit()
    }
  })()
  return quitInFlight
}

function pushStateToRenderer(): void {
  if (!session || !mainWindow || mainWindow.isDestroyed()) return
  // Hidden menu-bar panel: skip IPC so Chromium/React stay cold.
  if (!mainWindow.isVisible()) return
  mainWindow.webContents.send('bridge:state', session.getState())
}

function broadcast(): void {
  if (!session) return
  const state = session.getState()
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.webContents.send('bridge:state', state)
  }
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
      backgroundThrottling: true,
      spellcheck: false,
      v8CacheOptions: 'code',
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Catch up UI after hide — broadcasts while hidden were skipped.
  mainWindow.on('show', () => pushStateToRenderer())

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    const win = mainWindow
    if (!win) return
    void (async () => {
      try {
        const dirty = await win.webContents.executeJavaScript(
          'Boolean(window.__hbDirty)',
        )
        if (dirty) {
          const { response } = await dialog.showMessageBox(win, {
            type: 'warning',
            buttons: ['Скрыть', 'Отмена'],
            defaultId: 1,
            cancelId: 1,
            message: 'Есть несохранённые изменения',
            detail: 'При скрытии окна изменения не сохранятся. Нажмите «Сохранить» в панели, если нужно.',
          })
          if (response === 1) return
        }
      } catch {
        // Renderer may be mid-reload; hide anyway.
      }
      if (!isQuitting) win.hide()
    })()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const trayIconCache = new Map<string, Electron.NativeImage>()

function trayIcon(color: 'green' | 'yellow' | 'red' | 'grey'): Electron.NativeImage {
  const hit = trayIconCache.get(color)
  if (hit) return hit

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
      if (!img.isEmpty()) {
        trayIconCache.set(color, img)
        return img
      }
    }

    const img = nativeImage.createFromPath(fs.existsSync(p1) ? p1 : p2)
    if (!img.isEmpty()) {
      trayIconCache.set(color, img)
      return img
    }
  }

  const fallback = fallbackTrayIcon(color)
  trayIconCache.set(color, fallback)
  return fallback
}

/** Always-visible status LED if pack paths break. */
function fallbackTrayIcon(color: 'green' | 'yellow' | 'red' | 'grey'): Electron.NativeImage {
  const fill =
    color === 'green'
      ? '#34d399'
      : color === 'yellow'
        ? '#fbbf24'
        : color === 'grey'
          ? '#71717a'
          : '#f87171'
  const stroke =
    color === 'grey'
      ? '#71717a'
      : color === 'green'
        ? '#16a34a'
        : color === 'yellow'
          ? '#d97706'
          : '#dc2626'
  const isRing = color === 'grey'
  const r = 9
  const cx = 18
  const cy = 18
  const sw = 3

  const svg = isRing
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw}"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw}"/></svg>`

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  return nativeImage.createFromDataURL(dataUrl)
}

function syncTray(state: {
  status: BridgeStatus
  phoneIp: string | null
  socksLocal: string
  httpLocal: string
  lanAuthOn: boolean
  publicWifiNoAuth: boolean
  paused: boolean
  settings: { enabled: boolean }
}): void {
  if (!tray || !session) return
  const ui = statusPresentation(state.status, state.phoneIp)
  const sec = traySecurityPresentation({
    tip: ui.trayTip,
    lanAuthOn: state.lanAuthOn,
    publicWifiNoAuth: state.publicWifiNoAuth,
  })
  const enabled = state.settings.enabled
  const active = enabled && state.status !== 'disconnected'
  const neutral = !enabled || state.paused
  const tip = !enabled
    ? 'Happ Bridge · мост выключен'
    : state.paused
      ? 'Happ Bridge · отключено вами'
      : sec.tip
  const key = `${state.status}|${state.phoneIp ?? ''}|${sec.cacheKey}|${enabled ? 1 : 0}|${state.paused ? 1 : 0}|${updater?.canInstall() ? 1 : 0}`
  if (key === lastTrayKey) return
  lastTrayKey = key

  tray.setImage(trayIcon(neutral ? 'grey' : ui.tone))
  tray.setToolTip(tip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: !enabled
          ? 'Мост выключен'
          : state.paused
            ? 'Отключено вами'
            : ui.label,
        enabled: false,
      },
      ...(sec.menuLabel && enabled
        ? [{ label: sec.menuLabel, enabled: false as const }]
        : []),
      ...(enabled && state.phoneIp
        ? [{ label: `Телефон: ${state.phoneIp}`, enabled: false as const }]
        : []),
      { type: 'separator' },
      {
        label: `Скопировать SOCKS5 (${state.socksLocal})`,
        enabled: active,
        click: () => clipboard.writeText(state.socksLocal),
      },
      {
        label: `Скопировать HTTP (${state.httpLocal})`,
        enabled: active,
        click: () => clipboard.writeText(state.httpLocal),
      },
      { type: 'separator' },
      {
        label: enabled ? 'Отключить мост' : 'Включить мост',
        click: () => {
          void session?.setEnabled(!enabled).then(() => broadcast())
        },
      },
      { label: 'Настройки…', click: () => createWindow(true) },
      { type: 'separator' },
      {
        label: updater?.canInstall() ? 'Установить обновление и выйти' : 'Выйти',
        click: () => {
          void quitApp({ installUpdate: updater?.canInstall() })
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

function registerIpc(): void {
  ipcMain.handle('bridge:getState', () => session!.getState())

  ipcMain.handle('bridge:findPhone', async () => {
    const ok = await session!.connect('user')
    return { ok, state: session!.getState() }
  })

  ipcMain.handle('bridge:scanPeers', async () => session!.scanPeers())

  ipcMain.handle('bridge:copyDiagnostics', async () => {
    const os = await import('node:os')
    // Fresh checks so the report is useful even if the user never pressed «Запустить».
    await session!.diagnose()
    const s = session!.getState()
    const debug = session!.getDebugSnapshot()
    const stateForDebug = {
      capturedAt: new Date().toISOString(),
      app: { version: app.getVersion() },
      runtime: {
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
        macOS: os.release(),
        uptime: os.uptime(),
        cpus: os.cpus().length,
      },
      bridge: {
        status: s.status,
        phoneIp: s.phoneIp,
        peers: s.peers,
        socksLocal: s.socksLocal,
        httpLocal: s.httpLocal,
        enabled: s.settings.enabled,
        wizardDone: s.settings.wizardDone,
        paused: s.paused,
        error: s.error,
        wifiSsid: s.wifiSsid,
        isHomeNetwork: s.isHomeNetwork,
        lanPasswordSet: s.lanPasswordSet,
        scan: s.scan,
      },
      settings: {
        socksPort: s.settings.socksPort,
        httpPort: s.settings.httpPort,
        manualIp: s.settings.manualIp,
        lastPhoneIp: s.settings.lastPhoneIp,
        recentPhoneIps: s.settings.recentPhoneIps,
        ssidPeers: s.settings.ssidPeers,
        homeSsids: s.settings.homeSsids,
        openAtLogin: s.settings.openAtLogin,
      },
      debug,
      diagnostics: s.diagnostics,
      update: s.update,
      log: {
        path: logFilePath(),
        tail: readLogTail(250),
      },
    }
    const text = JSON.stringify(stateForDebug, null, 2)
    clipboard.writeText(text)
    return text
  })

  ipcMain.handle('bridge:disconnect', async () => session!.disconnect())

  ipcMain.handle('bridge:setEnabled', async (_e, enabled: boolean) => {
    return session!.setEnabled(Boolean(enabled))
  })

  ipcMain.handle('bridge:selectPhone', async (_e, ip: string) => {
    return session!.selectPhone(ip)
  })

  ipcMain.handle('bridge:testPhone', async (_e, ip: string) => {
    return session!.testPhone(ip)
  })

  ipcMain.handle('bridge:applyManualIp', async (_e, ip: string) => {
    return session!.applyManualIp(ip)
  })

  ipcMain.handle('bridge:copy', (_e, kind: CopyPreset) => {
    const state = session!.getState()
    const text = presetText(
      kind,
      state.settings.socksPort,
      state.settings.httpPort,
      socksAuthFromSettings(state.settings),
    )
    clipboard.writeText(text)
    return text
  })

  ipcMain.handle('bridge:saveSettings', async (_e, patch: Partial<AppSettings>) => {
    return session!.updateSettings(patch)
  })

  ipcMain.handle('bridge:finishWizard', () => session!.markWizardDone())

  ipcMain.handle('bridge:markHomeNetwork', () => session!.markCurrentNetworkHome())

  ipcMain.handle('bridge:diagnose', async () => session!.diagnose())

  ipcMain.handle('bridge:checkUpdates', async () => {
    const info = await updater!.check()
    session!.setUpdateInfo(info)
    return session!.getState()
  })

  ipcMain.handle('bridge:installUpdate', async () => {
    void quitApp({ installUpdate: true })
  })

  // inject/appIcons stay out of cold start — loaded on first inject IPC.
  type InjectMod = typeof import('./inject')

  async function withInject<T>(
    run: (inject: InjectMod, icons: InjectIconMap) => Promise<T> | T,
  ): Promise<T> {
    const [inject, { resolveInjectIcons }] = await Promise.all([
      import('./inject'),
      import('./appIcons'),
    ])
    const icons = await resolveInjectIcons().catch((): InjectIconMap => ({}))
    return run(inject, icons)
  }

  const withIcons = (status: InjectTargetInfo[], icons: InjectIconMap): InjectTargetInfo[] =>
    status.map((t) => ({ ...t, icon: icons[t.id] ?? null }))

  ipcMain.handle('bridge:injectStatus', () =>
    withInject(({ injectStatus }, icons) => withIcons(injectStatus(undefined, injectBackupPath()), icons)),
  )

  ipcMain.handle('bridge:injectApply', async (_e, targets: InjectTarget[]) =>
    withInject(async ({ applyInject }, icons) => {
      const result = await applyInject(
        targets,
        injectPortsFromState(session!.getState()),
        undefined,
        injectBackupPath(),
      )
      return { ...result, status: withIcons(result.status, icons) }
    }),
  )

  ipcMain.handle('bridge:injectRevert', async (_e, targets: InjectTarget[]) =>
    withInject(async ({ revertInject }, icons) => {
      const result = await revertInject(
        targets,
        injectPortsFromState(session!.getState()),
        undefined,
        injectBackupPath(),
      )
      return { ...result, status: withIcons(result.status, icons) }
    }),
  )

  ipcMain.handle('bridge:injectRelaunchOffer', async (_e, targets: InjectTarget[]) => {
    const { INJECT_APPS, relaunchInjectApps } = await import('./inject')
    const labels = targets.map((id) => INJECT_APPS[id].label).join(', ')
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Перезапустить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      message: 'Перезапустить приложения?',
      detail: `${labels}\n\nЧтобы применить новый прокси, нужен полный перезапуск приложения, а не только окна.`,
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
}): {
  socksPort: number
  httpPort: number
  phoneIp: string | null
  proxyUser: string | null
  proxyPassword: string | null
} {
  return {
    socksPort: s.settings.socksPort,
    httpPort: s.settings.httpPort,
    phoneIp: s.phoneIp ?? s.settings.manualIp ?? s.settings.lastPhoneIp ?? null,
    proxyUser: s.settings.proxyUser,
    proxyPassword: s.settings.proxyPassword,
  }
}

app.whenReady().then(async () => {
  log('main', 'app ready: version=%s electron=%s node=%s darwin=%s',
    app.getVersion(), process.versions.electron, process.versions.node, process.platform)
  if (process.platform === 'darwin') app.dock?.hide()

  updater = createUpdater({
    onChange: (info) => {
      session?.setUpdateInfo(info)
      // Refresh tray label when download finishes («Установить…»).
      if (session) syncTray(session.getState())
    },
  })

  session = await BridgeSession.create({
    onChange: broadcast,
    applyOpenAtLogin,
  })
  session.setUpdateInfo(updater.getInfo())

  registerIpc()
  createTray()
  applyOpenAtLogin(session.getState().settings.openAtLogin)

  powerMonitor.on('suspend', () => session?.onSuspend())
  powerMonitor.on('resume', () => session?.onResume())

  if (!session.getState().settings.wizardDone || isDev) createWindow(true)

  if (session.getState().settings.enabled) {
    await session.connect('startup')
  }
  session.startWatch()

  // Defer electron-updater load — keeps cold start lean on weak Macs.
  if (!isDev) {
    setTimeout(() => {
      void updater?.check()
    }, 45_000)
  }
})

app.on('before-quit', (event) => {
  if (quitCleanupDone) return
  event.preventDefault()
  void quitApp()
})

app.on('window-all-closed', () => {
  // tray process stays alive
})
