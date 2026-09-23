import { app } from 'electron'
import type { UpdateInfo } from './types'

type UpdateHooks = {
  onChange: (info: UpdateInfo) => void
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
        // Dynamic import so dev/selfcheck does not require electron-updater at typecheck of scripts
        const { autoUpdater } = await import('electron-updater')
        autoUpdater.autoDownload = true
        autoUpdater.autoInstallOnAppQuit = true

        return await new Promise<UpdateInfo>((resolve) => {
          const done = (next: UpdateInfo) => {
            cleanup()
            emit(next)
            resolve(next)
          }

          const cleanup = () => {
            autoUpdater.removeListener('update-available', onAvailable)
            autoUpdater.removeListener('update-not-available', onNot)
            autoUpdater.removeListener('error', onError)
          }

          const onAvailable = (u: { version: string }) => {
            done({
              status: 'available',
              message: `Найдена версия ${u.version}. Скачиваем…`,
              version: u.version,
            })
          }
          const onNot = () => {
            done({
              status: 'not-available',
              message: `У вас актуальная версия ${app.getVersion()}`,
              version: app.getVersion(),
            })
          }
          const onError = (err: Error) => {
            done({
              status: 'error',
              message: err.message || 'Не удалось проверить обновления',
            })
          }

          autoUpdater.once('update-available', onAvailable)
          autoUpdater.once('update-not-available', onNot)
          autoUpdater.once('error', onError)

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
