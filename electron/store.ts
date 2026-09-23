import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { AppSettings, DEFAULT_SETTINGS, normalizeSettings } from './types'

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed })
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}
