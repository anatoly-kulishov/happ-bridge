/**
 * Feedback loop for unsigned mac update replace (no Electron / Squirrel).
 * Run: npx tsx scripts/test-mac-update-install.ts
 */
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { APP_BUNDLE_NAME, buildReplaceScript } from '../electron/macUpdateInstall'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-upd-e2e-'))
const appPath = path.join(root, APP_BUNDLE_NAME)
const staging = path.join(root, 'staging', APP_BUNDLE_NAME)
const zipPath = path.join(root, 'update.zip')

try {
  fs.mkdirSync(path.join(appPath, 'Contents/MacOS'), { recursive: true })
  fs.writeFileSync(path.join(appPath, 'Contents/MacOS/Happ Bridge'), 'OLD')

  fs.mkdirSync(path.join(staging, 'Contents/MacOS'), { recursive: true })
  fs.writeFileSync(path.join(staging, 'Contents/MacOS/Happ Bridge'), 'NEW')

  const zip = spawnSync(
    'ditto',
    ['-c', '-k', '--sequesterRsrc', '--keepParent', staging, zipPath],
    { encoding: 'utf8' },
  )
  assert.equal(zip.status, 0, zip.stderr || 'ditto zip failed')

  // Pick a pid that is not alive (high unused number).
  const deadPid = 987654321
  assert.notEqual(spawnSync('kill', ['-0', String(deadPid)]).status, 0)

  const scriptPath = path.join(root, 'install.sh')
  fs.writeFileSync(
    scriptPath,
    buildReplaceScript({ pid: deadPid, zipPath, appPath }),
    { mode: 0o755 },
  )

  const run = spawnSync('/bin/bash', [scriptPath], { encoding: 'utf8' })
  assert.equal(run.status, 0, `install failed: ${run.stderr}\n${run.stdout}`)

  const content = fs.readFileSync(path.join(appPath, 'Contents/MacOS/Happ Bridge'), 'utf8')
  assert.equal(content, 'NEW')
  assert.equal(fs.existsSync(`${appPath}.updater-bak`), false)
  console.log('test-mac-update-install ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
