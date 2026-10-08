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

export function createUpdater(hooks: UpdateHooks): {
  check: () => Promise<UpdateInfo>
  getInfo: () => UpdateInfo
} {
  let info: UpdateInfo = {
    status: app.isPackaged ? 'idle' : 'dev',
    message: app.isPackaged
      ? 'Обновления через GitHub Releases'
      : 'В режиме разработки автообновление отключено',
  }

  const emit = (next: UpdateInfo) => {
    info = next
    hooks.onChange(next)
  }

  return {
    getInfo: () => info,
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
        // Dynamic import so dev/selfcheck does not require electron-updater at typecheck of scripts.
        // electron-updater is CJS; in native-ESM build the named export isn't promoted by
        // cjs-module-lexer, so read it off `default` when the named one is absent.
        const mod = await import('electron-updater')
        const autoUpdater =
          (mod.default as { autoUpdater?: typeof mod.autoUpdater })?.autoUpdater ??
          mod.autoUpdater
        if (!autoUpdater) {
          throw new Error('autoUpdater не найден: несовместимый экспорт electron-updater')
        }
        autoUpdater.autoDownload = true
        autoUpdater.autoInstallOnAppQuit = true

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
            autoUpdater.removeListener('update-available', onAvailable)
            autoUpdater.removeListener('update-not-available', onNot)
          }

          const detachDownloadListeners = () => {
            autoUpdater.removeListener('download-progress', onProgress)
            autoUpdater.removeListener('update-downloaded', onDownloaded)
            autoUpdater.removeListener('error', onError)
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
            emit({
              status: 'available',
              message: `Версия ${u.version} скачана — перезапустите приложение для установки.`,
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
            finishCheck({
              status: 'not-available',
              message: `У вас актуальная версия ${app.getVersion()}`,
              version: app.getVersion(),
            })
          }

          const onError = (err: Error) => {
            detachCheckListeners()
            detachDownloadListeners()
            const next: UpdateInfo = {
              status: 'error',
              message: err.message || 'Не удалось проверить обновления',
              version: downloadVersion,
            }
            if (!settled) finishCheck(next)
            else emit(next)
          }

          autoUpdater.once('update-available', onAvailable)
          autoUpdater.once('update-not-available', onNot)
          autoUpdater.on('error', onError)
          autoUpdater.on('download-progress', onProgress)
          autoUpdater.on('update-downloaded', onDownloaded)

          void autoUpdater.checkForUpdates().catch((err: Error) => onError(err))
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        emit({ status: 'error', message })
        return info
      }
    },
  }
}
