import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Shallow scan of /Applications and ~/Applications for matching .app bundles. */
export function appBundles(namePattern: RegExp, homeDir = os.homedir()): string[] {
  const out: string[] = []
  for (const dir of ['/Applications', path.join(homeDir, 'Applications')]) {
    let names: string[] = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (namePattern.test(name)) out.push(path.join(dir, name))
    }
  }
  return out
}

export function cursorAppBundles(homeDir = os.homedir()): string[] {
  return appBundles(/^Cursor\.app$/, homeDir)
}

export function webstormAppBundles(homeDir = os.homedir()): string[] {
  return appBundles(/^WebStorm.*\.app$/, homeDir)
}

export function firefoxAppBundles(homeDir = os.homedir()): string[] {
  return appBundles(/^Firefox\.app$/, homeDir)
}

/**
 * Map CFBundleShortVersionString (e.g. "2024.3.1") to JetBrains config
 * folder name (e.g. "WebStorm2024.3").
 */
export function webstormConfigDirFromVersion(shortVersion: string): string | null {
  const m = /^(\d{4}\.\d+)/.exec(shortVersion.trim())
  if (!m) return null
  return `WebStorm${m[1]}`
}
