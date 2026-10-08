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
import { resolveInjectIcons, type InjectIconMap } from './appIcons'
import {
  applyInject,
  injectStatus,
  relaunchInjectApps,
  revertInject,
  type InjectTarget,
  type InjectTargetInfo,
} from './inject'
import { presetText, type CopyPreset } from './presets'
import { BridgeSession } from './session'
import { socksAuthFromSettings, statusPresentation, traySecurityPresentation } from './types'
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

function trayIcon(color: 'green' | 'yellow' | 'red' | 'grey'): Electron.NativeImage {
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
  const key = `${state.status}|${state.phoneIp ?? ''}|${sec.cacheKey}|${enabled ? 1 : 0}|${state.paused ? 1 : 0}`
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

  ipcMain.handle('bridge:scanPeers', async () => session!.scanPeers())

  ipcMain.handle('bridge:copyDiagnostics', () => {
    const s = session!.getState()
    if (!s.diagnostics || s.diagnostics.length === 0) return ''
    const lines: string[] = [`Happ Bridge ${app.getVersion()}`, new Date().toISOString()]
    const head: string[] = [`Статус: ${s.status}${s.phoneIp ? ` · ${s.phoneIp}` : ''}`]
    if (s.wifiSsid) {
      head.push(`SSID: ${s.wifiSsid}${s.isHomeNetwork ? ' (домашняя)' : ' (чужая)'}`)
    }
    head.push(`мост: ${s.socksLocal} / ${s.httpLocal}`)
    if (s.peers.length > 0) head.push(`найдено телефонов: ${s.peers.length}`)
    if (s.paused) head.push('bridged отключён пользователем')
    if (s.error) head.push(`ошибка: ${s.error}`)
    lines.push(head.join(' · '), '')
    for (const d of s.diagnostics) {
      const label = d.status === 'ok' ? 'OK' : d.status === 'warn' ? 'WARN' : 'ERR'
      lines.push(`${label} ${d.label}\n  ${d.detail}`)
    }
    const text = lines.join('\n')
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
    const info = await updater.check()
    session!.setUpdateInfo(info)
    return session!.getState()
  })

  const injectStatusWithIcons = async (): Promise<InjectTargetInfo[]> => {
    const status = injectStatus(undefined, injectBackupPath())
    const icons = await resolveInjectIcons().catch((): InjectIconMap => ({}))
    return status.map((t) => ({ ...t, icon: icons[t.id] ?? null }))
  }

  ipcMain.handle('bridge:injectStatus', () => injectStatusWithIcons())

  ipcMain.handle('bridge:injectApply', async (_e, targets: InjectTarget[]) => {
    const s = session!.getState()
    const result = await applyInject(
      targets,
      injectPortsFromState(s),
      undefined,
      injectBackupPath(),
    )
    const icons = await resolveInjectIcons().catch((): InjectIconMap => ({}))
    return {
      ...result,
      status: result.status.map((t) => ({ ...t, icon: icons[t.id] ?? null })),
    }
  })

  ipcMain.handle('bridge:injectRevert', async (_e, targets: InjectTarget[]) => {
    const s = session!.getState()
    const result = await revertInject(
      targets,
      injectPortsFromState(s),
      undefined,
      injectBackupPath(),
    )
    const icons = await resolveInjectIcons().catch((): InjectIconMap => ({}))
    return {
      ...result,
      status: result.status.map((t) => ({ ...t, icon: icons[t.id] ?? null })),
    }
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
  if (process.platform === 'darwin') app.dock?.hide()

  const updater = createUpdater({
    onChange: (info) => session?.setUpdateInfo(info),
  })

  session = await BridgeSession.create({
    onChange: broadcast,
    applyOpenAtLogin,
  })
  session.setUpdateInfo(updater.getInfo())

  registerIpc(updater)
  createTray()
  applyOpenAtLogin(session.getState().settings.openAtLogin)

  powerMonitor.on('suspend', () => session?.onSuspend())
  powerMonitor.on('resume', () => session?.onResume())

  if (!session.getState().settings.wizardDone || isDev) createWindow(true)

  if (session.getState().settings.enabled) {
    await session.connect('startup')
  }
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
