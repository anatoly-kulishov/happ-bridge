import { nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  cursorAppBundles,
  firefoxAppBundles,
  webstormAppBundles,
} from './appPaths'
import type { InjectTarget } from './inject'

/** Real .app icons for inject targets; missing id ⇒ renderer falls back to a generic icon. */
export type InjectIconMap = Partial<Record<InjectTarget, string>>

const execFileAsync = promisify(execFile)
const cache = new Map<string, string | null>()
let tmpSeq = 0

/** CFBundleIconFile from a bundle Info.plist; handles binary plists. */
async function bundleIconName(bundlePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('defaults', [
      'read',
      path.join(bundlePath, 'Contents', 'Info'),
      'CFBundleIconFile',
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function iconFor(bundlePath: string): Promise<string | null> {
  const cached = cache.get(bundlePath)
  if (cached !== undefined) return cached
  let result: string | null = null
  try {
    if (fs.existsSync(bundlePath)) {
      const resDir = path.join(bundlePath, 'Contents', 'Resources')
      const iconName = await bundleIconName(bundlePath)
      const candidates = iconName
        ? [iconName, `${iconName}.icns`].map((n) => path.join(resDir, n))
        : []
      if (candidates.length === 0 && fs.existsSync(resDir)) {
        // Fallback: any .icns in Resources (prefer common names).
        const icns = fs.readdirSync(resDir).filter((n) => n.endsWith('.icns'))
        const preferred = icns.find((n) => /^(AppIcon|icon)$/i.test(n.replace(/\.icns$/, '')))
        candidates.push(
          ...(preferred ? [path.join(resDir, preferred)] : []),
          ...icns.map((n) => path.join(resDir, n)),
        )
      }
      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue
        // createFromPath reads PNG/JPEG only — convert .icns via built-in sips.
        const pngPath = candidate.endsWith('.icns')
          ? path.join(
              os.tmpdir(),
              `happ-bridge-icon-${process.pid}-${++tmpSeq}.png`,
            )
          : candidate
        try {
          if (pngPath !== candidate) {
            await execFileAsync('sips', ['-s', 'format', 'png', candidate, '--out', pngPath])
          }
          const image = nativeImage.createFromPath(pngPath)
          if (!image.isEmpty()) {
            result = image.toDataURL()
            break
          }
        } finally {
          if (pngPath !== candidate) fs.rmSync(pngPath, { force: true })
        }
      }
    }
  } catch {
    result = null
  }
  cache.set(bundlePath, result)
  return result
}

/** Resolve real macOS bundle icons (data URLs) for the inject target list. */
export async function resolveInjectIcons(): Promise<InjectIconMap> {
  const bundles: Record<InjectTarget, string[]> = {
    cursor: cursorAppBundles(),
    webstorm: webstormAppBundles(),
    firefox: firefoxAppBundles(),
  }
  const out: InjectIconMap = {}
  await Promise.all(
    (Object.keys(bundles) as InjectTarget[]).map(async (id) => {
      for (const bundle of bundles[id]) {
        const icon = await iconFor(bundle)
        if (icon) {
          out[id] = icon
          return
        }
      }
    }),
  )
  return out
}
