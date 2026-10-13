/**
 * Manual macOS update install for unsigned builds.
 *
 * electron-updater's MacUpdater relies on Electron Squirrel.Mac / ShipIt, which
 * often fails to replace an ad-hoc or unsigned .app (identity: "-"). Download
 * still works; we apply the ZIP ourselves after the process exits.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const APP_BUNDLE_NAME = 'Happ Bridge.app'

/** Walk from Contents/MacOS/<bin> up to the .app bundle. */
export function resolveAppBundlePath(execPath: string): string {
  // …/Happ Bridge.app/Contents/MacOS/Happ Bridge
  const bundle = path.resolve(execPath, '..', '..', '..')
  if (!bundle.endsWith('.app')) {
    throw new Error(`Не удалось определить .app от execPath=${execPath}`)
  }
  return bundle
}

/** electron-builder zip root is «Happ Bridge.app». */
export function findExtractedApp(extractDir: string, bundleName = APP_BUNDLE_NAME): string {
  const direct = path.join(extractDir, bundleName)
  if (fs.existsSync(direct)) return direct
  // Rare: nested folder
  const entries = fs.readdirSync(extractDir)
  for (const name of entries) {
    const candidate = path.join(extractDir, name)
    if (name === bundleName && fs.statSync(candidate).isDirectory()) return candidate
    if (fs.statSync(candidate).isDirectory()) {
      const nested = path.join(candidate, bundleName)
      if (fs.existsSync(nested)) return nested
    }
  }
  throw new Error(`В архиве обновления нет «${bundleName}»`)
}

/**
 * Bash that waits for `pid` to exit, then replaces `appPath` with the app
 * extracted from `zipPath`, clears quarantine, and relaunches.
 */
export function buildReplaceScript(opts: {
  pid: number
  zipPath: string
  appPath: string
  bundleName?: string
}): string {
  const bundleName = opts.bundleName ?? APP_BUNDLE_NAME
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  return `#!/bin/bash
set -euo pipefail
PID=${opts.pid}
ZIP=${q(opts.zipPath)}
APP=${q(opts.appPath)}
NAME=${q(bundleName)}
TMP="$(mktemp -d /tmp/happ-bridge-update.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# Wait until the running Happ Bridge process exits (max ~60s).
for _ in $(seq 1 300); do
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
if kill -0 "$PID" 2>/dev/null; then
  echo "happ-bridge-update: process $PID still alive" >&2
  exit 1
fi

# Brief settle so file locks on the .app drop.
sleep 0.4

ditto -x -k "$ZIP" "$TMP"
NEW="$TMP/$NAME"
if [[ ! -d "$NEW" ]]; then
  # Fallback: search one level deep
  NEW="$(find "$TMP" -maxdepth 2 -type d -name "$NAME" | head -1)"
fi
if [[ -z "\${NEW}" || ! -d "$NEW" ]]; then
  echo "happ-bridge-update: $NAME not found in zip" >&2
  exit 1
fi

BAK="\${APP}.updater-bak"
rm -rf "$BAK"
if [[ -d "$APP" ]]; then
  mv "$APP" "$BAK"
fi
mv "$NEW" "$APP"
xattr -cr "$APP" 2>/dev/null || true
rm -rf "$BAK"
# Relaunch menu-bar app (LSUIElement: open is more reliable than Electron relaunch).
# Do not fail the install if Launch Services is slow to register the new bundle.
open "$APP" || open -a "$APP" || true
`
}

/**
 * Spawn detached installer and return immediately. Caller must exit the app
 * so the script can replace the bundle.
 */
export function spawnMacUpdateInstaller(opts: {
  zipPath: string
  appPath: string
  pid?: number
  log?: (msg: string) => void
}): void {
  if (!fs.existsSync(opts.zipPath)) {
    throw new Error(`Файл обновления не найден: ${opts.zipPath}`)
  }
  if (!opts.appPath.endsWith('.app')) {
    throw new Error(`Путь установки должен быть .app: ${opts.appPath}`)
  }

  const pid = opts.pid ?? process.pid
  const script = buildReplaceScript({
    pid,
    zipPath: opts.zipPath,
    appPath: opts.appPath,
  })
  const scriptPath = path.join(os.tmpdir(), `happ-bridge-update-${pid}.sh`)
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  opts.log?.(`spawn update installer script=${scriptPath} app=${opts.appPath} zip=${opts.zipPath}`)

  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
}
