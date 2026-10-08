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
        // macOS: blockmap-based differential downloads hang at 0% when the
        // existing app.asar read or blockmap match silently fails. Force a
        // full ZIP download so the updater actually pulls the file.
        autoUpdater.disableDifferentialDownload = true

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
            detachCheckListeners()
            detachDownloadListeners()
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
            const raw = err.message || ''
            let message = 'Не удалось проверить обновления. Попробуйте позже.'
            if (/404|latest-mac\.yml/i.test(raw)) {
              message = 'Обновления временно недоступны: релиз ещё публикуется или файл манифеста не найден. Попробуйте через пару минут.'
            } else if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
              message = 'Нет сети. Проверьте подключение и нажмите «Проверить» ещё раз.'
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

          autoUpdater.once('update-available', onAvailable)
          autoUpdater.once('update-not-available', onNot)
          autoUpdater.once('error', onError)
          autoUpdater.once('download-progress', onProgress)
          autoUpdater.once('update-downloaded', onDownloaded)

          void autoUpdater.checkForUpdates().catch((err: Error) => onError(err))
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
