import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  keychainDeletePassword,
  keychainGetPassword,
  keychainSetPassword,
} from './keychain'
import { AppSettings, DEFAULT_SETTINGS, normalizeSettings } from './types'

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function forDisk(settings: AppSettings): AppSettings {
  return { ...settings, proxyPassword: null }
}

function readDisk(): Partial<AppSettings> {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    return JSON.parse(raw) as Partial<AppSettings>
  } catch {
    return {}
  }
}

function writeDisk(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(forDisk(settings), null, 2), 'utf8')
}

export async function loadSettings(): Promise<AppSettings> {
  const parsed = readDisk()
  const fromFile = normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed })
  const diskPassword = fromFile.proxyPassword
  const keyPassword = await keychainGetPassword()

  let password = keyPassword
  if (diskPassword && !keyPassword) {
    try {
      await keychainSetPassword(diskPassword)
      const verified = await keychainGetPassword()
      if (verified === diskPassword) {
        password = verified
        writeDisk({ ...fromFile, proxyPassword: null })
      } else {
        password = diskPassword
      }
    } catch {
      password = diskPassword
    }
  } else if (diskPassword && keyPassword) {
    writeDisk({ ...fromFile, proxyPassword: null })
  }

  return normalizeSettings({
    ...fromFile,
    proxyPassword: password,
  })
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const pass = settings.proxyPassword
  if (pass != null && pass.length > 0) {
    await keychainSetPassword(pass)
    const verified = await keychainGetPassword()
    if (verified !== pass) {
      throw new Error('Не удалось сохранить пароль в Keychain')
    }
  } else {
    await keychainDeletePassword()
  }
  writeDisk(settings)
}
