import { app } from 'electron'
import type { UpdateInfo } from './types'

type UpdateHooks = {
  onChange: (info: UpdateInfo) => void
}

type ProgressEvt = {
  percent: number
  transferred: number
  total: number
}

// ponytail: event surface is untyped; full AppUpdater import pulls heavy CJS types into ESM build
type AutoUpdater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
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

export function createUpdater(hooks: UpdateHooks): {
  check: () => Promise<UpdateInfo>
  getInfo: () => UpdateInfo
  canInstall: () => boolean
  install: () => boolean
} {
  let info: UpdateInfo = {
    status: app.isPackaged ? 'idle' : 'dev',
    message: app.isPackaged
      ? 'Обновления через GitHub Releases'
      : 'В режиме разработки автообновление отключено',
  }
  let autoUpdater: AutoUpdater | null = null
  let readyToInstall = false

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
    // Quit alone is unreliable with our before-quit cleanup; UI/tray call install().
    resolved.autoInstallOnAppQuit = true
    // macOS: blockmap-based differential downloads hang at 0% when the
    // existing app.asar read or blockmap match silently fails. Force a
    // full ZIP download so the updater actually pulls the file.
    resolved.disableDifferentialDownload = true
    autoUpdater = resolved
    return resolved
  }

  return {
    getInfo: () => info,
    canInstall: () => readyToInstall && autoUpdater != null,
    install: () => {
      if (!autoUpdater || !readyToInstall) return false
      // isForceRunAfter: relaunch after ShipIt replaces the .app
      autoUpdater.quitAndInstall(false, true)
      return true
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

          const onProgress = (p: ProgressEvt) => {
            const percent = Math.max(0, Math.min(100, Math.round(p.percent)))
            const ver = downloadVersion ? ` ${downloadVersion}` : ''
            emit({
              status: 'downloading',
              message: `Скачиваем${ver}… ${percent}%`,
              version: downloadVersion,
              progress: percent,
            })
          }

          const onDownloaded = (u: { version: string }) => {
            detachDownloadListeners()
            readyToInstall = true
            emit({
              status: 'available',
              message: `Версия ${u.version} скачана — нажмите «Установить».`,
              version: u.version,
              progress: 100,
            })
          }

          const onAvailable = (u: { version: string }) => {
            downloadVersion = u.version
            // Keep download listeners; only end the "check" promise so the button unblocks.
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
            readyToInstall = false
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
            let message = 'Не удалось проверить обновления. Попробуйте позже.'
            if (/404|latest-mac\.yml/i.test(raw)) {
              message = 'Обновления временно недоступны: релиз ещё публикуется или файл манифеста не найден. Попробуйте через пару минут.'
            } else if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
              message = 'Нет сети. Проверьте подключение и нажмите «Проверить» ещё раз.'
            } else if (/checksum|sha512|ERR_CHECKSUM/i.test(raw)) {
              message = 'Файл обновления повреждён или манифест не совпадает. Попробуйте позже или скачайте .dmg вручную.'
            }
            console.warn('[updater] error:', raw)
            const next: UpdateInfo = {
              status: 'error',
              message,
              version: downloadVersion,
            }
            if (!settled) finishCheck(next)
            else emit(next)
          }

          // Detach any leftovers from a previous check() before attaching.
          detachCheckListeners()
          detachDownloadListeners()

          updater.once('update-available', onAvailable)
          updater.once('update-not-available', onNot)
          // Progress fires many times; downloaded/error must stay until finish.
          updater.on('error', onError)
          updater.on('download-progress', onProgress)
          updater.on('update-downloaded', onDownloaded)

          void updater.checkForUpdates().catch((err: Error) => onError(err))
        })
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        let message = 'Не удалось проверить обновления. Попробуйте позже.'
        if (/404|latest-mac\.yml/i.test(raw)) {
          message = 'Обновления временно недоступны: релиз ещё публикуется или файл манифеста не найден.'
        } else if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
          message = 'Нет сети. Проверьте подключение и нажмите «Проверить» ещё раз.'
        }
        console.warn('[updater] catch:', raw)
        emit({ status: 'error', message })
        return info
      }
    },
  }
}
