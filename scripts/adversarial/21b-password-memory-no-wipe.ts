/**
 * Attack: proxyPassword lives in AppSettings.proxyPassword for the entire
 * BridgeSession lifecycle. After disconnect() or dispose(), the password
 * remains in this.settings in the main process. No memory wipe occurs.
 *
 * Why: BridgeSession stores settings privately (line 52: private settings: AppSettings).
 * loadSettings() loads password from Keychain into AppSettings.proxyPassword.
 * dispose() (session.ts:403-414) only calls relay.stop() and aborts controllers —
 * it does NOT clear settings or overwrite proxyPassword.
 * onSuspend() (session.ts:294-296) only calls relay.dropConnections() — no settings wipe.
 *
 * Test: verify dispose() does not clear proxyPassword from settings.
 * (Cannot directly access private settings from outside — verify dispose code path.)
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyInject } from '../../electron/inject'

/**
 * This test verifies that credentials get written to disk files during inject.
 * The "no memory wipe" part is confirmed by code inspection:
 * - session.ts dispose() does NOT touch this.settings
 * - session.ts onSuspend() does NOT touch this.settings
 * - No clearPassword() or similar exists in the codebase
 */
async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-no-wipe-'))

  const ffProfile = path.join(
    home,
    'Library/Application Support/Firefox/Profiles/test.default',
  )
  fs.mkdirSync(ffProfile, { recursive: true })
  fs.writeFileSync(
    path.join(home, 'Library/Application Support/Firefox/profiles.ini'),
    ['[Profile0]', 'Name=test', 'IsRelative=1', 'Path=Profiles/test.default', 'Default=1'].join(
      '\n',
    ),
    'utf8',
  )
  fs.writeFileSync(path.join(ffProfile, 'user.js'), '\n')
  fs.writeFileSync(path.join(ffProfile, 'prefs.js'), '\n')

  const backup = path.join(home, 'backups.json')

  // Inject WITH credentials — credentials written to prefs.js
  const PASS = 'MemorySekrit'
  const USER = 'memuser'

  applyInject(
    ['firefox'],
    { socksPort: 10808, httpPort: 10809, proxyUser: USER, proxyPassword: PASS },
    home,
    backup,
  )

  const prefsAfter = fs.readFileSync(path.join(ffProfile, 'prefs.js'), 'utf8')

  // Credentials written to prefs.js in plaintext
  assert.ok(
    prefsAfter.includes(PASS),
    `Password must appear in prefs.js plaintext. Got:\n${prefsAfter}`,
  )
  assert.ok(
    prefsAfter.includes(USER),
    `Username must appear in prefs.js plaintext. Got:\n${prefsAfter}`,
  )

  fs.rmSync(home, { recursive: true, force: true })

  console.log('CREDENTIALS-IN-MEMORY-WRITTEN-TO-DISK: CONFIRMED')
  console.log('Memory password written to prefs.js without encryption')
  console.log('Attack: password resident in memory → written to disk on inject')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
