import { app } from 'electron'
import { log } from './log'
import {
  resolveAppBundlePath,
  spawnMacUpdateInstaller,
} from './macUpdateInstall'
import type { UpdateInfo } from './types'

type UpdateHooks = {
  onChange: (info: UpdateInfo) => void
}

type ProgressEvt = {
  percent: number
  transferred: number
  total: number
}

type DownloadedEvt = {
  version: string
  downloadedFile: string
}

// ponytail: event surface is untyped; full AppUpdater import pulls heavy CJS types into ESM build
type AutoUpdater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  autoRunAppAfterInstall: boolean
  disableDifferentialDownload: boolean
  checkForUpdates: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, listener: (...args: any[]) => void) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once: (event: string, listener: (...args: any[]) => void) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener: (event: string, listener: (...args: any[]) => void) => void
}

export type UpdaterApi = {
  check: () => Promise<UpdateInfo>
  getInfo: () => UpdateInfo
  canInstall: () => boolean
  /** Apply downloaded ZIP (mac: replace .app after exit). true ⇒ process should exit. */
  install: () => Promise<boolean>
}

export function createUpdater(hooks: UpdateHooks): UpdaterApi {
  let info: UpdateInfo = {
    status: app.isPackaged ? 'idle' : 'dev',
    message: app.isPackaged
      ? 'Обновления через GitHub Releases'
      : 'В режиме разработки автообновление отключено',
  }
  let autoUpdater: AutoUpdater | null = null
  let downloadedZip: string | null = null
  let downloadedVersion: string | undefined

  const emit = (next: UpdateInfo) => {
    info = next
    hooks.onChange(next)
  }

  const loadUpdater = async (): Promise<AutoUpdater> => {
    if (autoUpdater) return autoUpdater
    // Dynamic import so dev/selfcheck does not require electron-updater at typecheck of scripts.
    // electron-updater is CJS; in native-ESM build the named export isn't promoted by
    // cjs-module-lexer, so read it off `default` when the named one is absent.
    const mod = await import('electron-updater')
    const resolved =
      (mod.default as { autoUpdater?: AutoUpdater })?.autoUpdater ??
      (mod as { autoUpdater?: AutoUpdater }).autoUpdater
    if (!resolved) {
      throw new Error('autoUpdater не найден: несовместимый экспорт electron-updater')
    }
    resolved.autoDownload = true
    // Do NOT feed Squirrel.Mac: unsigned builds (identity: "-") fail ShipIt replace.
    // We apply the ZIP ourselves in install().
    resolved.autoInstallOnAppQuit = false
    resolved.autoRunAppAfterInstall = false
    // macOS: blockmap differential hangs at 0% when asar/blockmap mismatch; full ZIP.
    resolved.disableDifferentialDownload = true
    autoUpdater = resolved
    return resolved
  }

  const mapError = (raw: string, downloadVersion?: string): UpdateInfo => {
    let message = 'Не удалось проверить обновления. Попробуйте позже.'
    if (/404|latest-mac\.yml/i.test(raw)) {
      message =
        'Обновления временно недоступны: релиз ещё публикуется или файл манифеста не найден. Попробуйте через пару минут.'
    } else if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
      message = 'Нет сети. Проверьте подключение и нажмите «Проверить» ещё раз.'
    } else if (/checksum|sha512|ERR_CHECKSUM/i.test(raw)) {
      message =
        'Файл обновления повреждён или манифест не совпадает. Попробуйте позже или скачайте .dmg вручную.'
    } else if (/EACCES|permission|отказать|denied/i.test(raw)) {
      message =
        'Нет прав на замену приложения. Поставьте обновление из .dmg или перенесите Happ Bridge в «Программы».'
    }
    return {
      status: 'error',
      message,
      version: downloadVersion,
    }
  }

  return {
    getInfo: () => info,
    canInstall: () => Boolean(downloadedZip),
    install: async () => {
      if (!downloadedZip) {
        log('updater', 'install: no downloaded zip')
        return false
      }
      if (process.platform !== 'darwin') {
        // Non-mac fallback: stock quitAndInstall (unused in this product).
        if (!autoUpdater) return false
        autoUpdater.quitAndInstall(false, true)
        return true
      }

      emit({
        status: 'available',
        message: 'Устанавливаю обновление…',
        version: downloadedVersion,
        progress: 100,
      })

      try {
        const appPath = resolveAppBundlePath(process.execPath)
        log('updater', 'install: zip=%s app=%s', downloadedZip, appPath)
        spawnMacUpdateInstaller({
          zipPath: downloadedZip,
          appPath,
          log: (msg) => log('updater', '%s', msg),
        })
        // Detached script waits for our exit, then replaces + open.
        app.exit(0)
        return true
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        log('updater', 'install failed: %s', raw)
        emit({
          status: 'error',
          message:
            /прав|permission|EACCES|\.app/i.test(raw)
              ? raw
              : `Не удалось установить обновление: ${raw}. Поставьте .dmg вручную.`,
          version: downloadedVersion,
        })
        return false
      }
    },
    check: async () => {
      if (!app.isPackaged) {
        emit({
          status: 'dev',
          message: 'В режиме разработки автообновление отключено',
        })
        return info
      }

      emit({ status: 'checking', message: 'Проверяем обновления…' })

      try {
        const updater = await loadUpdater()

        return await new Promise<UpdateInfo>((resolve) => {
          let settled = false
          let downloadVersion: string | undefined

          const finishCheck = (next: UpdateInfo) => {
            if (settled) return
            settled = true
            emit(next)
            resolve(next)
          }

          const detachCheckListeners = () => {
            updater.removeListener('update-available', onAvailable)
            updater.removeListener('update-not-available', onNot)
          }

          const detachDownloadListeners = () => {
            updater.removeListener('download-progress', onProgress)
            updater.removeListener('update-downloaded', onDownloaded)
            updater.removeListener('error', onError)
          }

          let lastProgressAt = 0
          let lastProgressPct = -1
          const onProgress = (p: ProgressEvt) => {
            const percent = Math.max(0, Math.min(100, Math.round(p.percent)))
            const now = Date.now()
            if (
              percent < 100 &&
              percent === lastProgressPct &&
              now - lastProgressAt < 500
            ) {
              return
            }
            if (percent < 100 && now - lastProgressAt < 400 && percent - lastProgressPct < 2) {
              return
            }
            lastProgressAt = now
            lastProgressPct = percent
            const ver = downloadVersion ? ` ${downloadVersion}` : ''
            emit({
              status: 'downloading',
              message: `Скачиваем${ver}… ${percent}%`,
              version: downloadVersion,
              progress: percent,
            })
          }

          const onDownloaded = (u: DownloadedEvt) => {
            detachDownloadListeners()
            downloadedZip = u.downloadedFile
            downloadedVersion = u.version
            log('updater', 'downloaded: version=%s file=%s', u.version, u.downloadedFile)
            emit({
              status: 'available',
              message: `Версия ${u.version} скачана. Нажмите «Установить».`,
              version: u.version,
              progress: 100,
            })
          }

          const onAvailable = (u: { version: string }) => {
            downloadVersion = u.version
            detachCheckListeners()
            finishCheck({
              status: 'downloading',
              message: `Найдена версия ${u.version}. Скачиваем… 0%`,
              version: u.version,
              progress: 0,
            })
          }

          const onNot = () => {
            detachCheckListeners()
            detachDownloadListeners()
            downloadedZip = null
            downloadedVersion = undefined
            finishCheck({
              status: 'not-available',
              message: `У вас актуальная версия ${app.getVersion()}`,
              version: app.getVersion(),
            })
          }

          const onError = (err: Error) => {
            detachCheckListeners()
            detachDownloadListeners()
            const raw = err.message || ''
            log('updater', 'error: %s', raw)
            const next = mapError(raw, downloadVersion)
            if (!settled) finishCheck(next)
            else emit(next)
          }

          detachCheckListeners()
          detachDownloadListeners()

          updater.once('update-available', onAvailable)
          updater.once('update-not-available', onNot)
          updater.on('error', onError)
          updater.on('download-progress', onProgress)
          updater.on('update-downloaded', onDownloaded)

          void updater.checkForUpdates().catch((err: Error) => onError(err))
        })
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        log('updater', 'catch: %s', raw)
        emit(mapError(raw))
        return info
      }
    },
  }
}
