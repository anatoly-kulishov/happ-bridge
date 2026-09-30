/**
 * Attack: backup file (inject-backups.json) stores previous file contents
 * which may contain credentials from prior inject operations. When a new
 * inject is applied, the backup stores the OLD (pre-inject) file content.
 * If the OLD content had credentials (e.g., from a previous inject with auth),
 * those credentials are stored in plaintext on disk.
 *
 * Additionally, when reverting, the previousContent (stored credentials)
 * are written back to the original files without any secure cleanup.
 *
 * Why: BackupStore stores previousContent (string) and prefsPrevious (Record)
 * which may contain socks_username/socks_password from prior Firefox configs.
 * These are stored in inject-backups.json unencrypted.
 *
 * Test: simulate apply→revert cycle and verify backup file structure
 * contains sensitive fields (we check that prefsPrevious CAN store credentials).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyInject, revertInject } from '../../electron/inject'

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-backup-test-'))
  const backup = path.join(home, 'inject-backups.json')

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
  fs.writeFileSync(
    path.join(ffProfile, 'user.js'),
    'user_pref("browser.shell.checkDefaultBrowser", false);\n',
  )
  fs.writeFileSync(
    path.join(ffProfile, 'prefs.js'),
    [
      'user_pref("network.proxy.type", 0);',
      'user_pref("network.proxy.socks", "192.168.1.6");',
      'user_pref("network.proxy.socks_port", 1080);',
      'user_pref("network.proxy.socks_username", "olduser");',
      'user_pref("network.proxy.socks_password", "oldpass");',
    ].join('\n') + '\n',
  )

  const ports = { socksPort: 10808, httpPort: 10809 }

  // Apply inject WITH new credentials
  const applied = applyInject(
    ['firefox'],
    { ...ports, proxyUser: 'newuser', proxyPassword: 'newpass' },
    home,
    backup,
  )
  assert.ok(applied.results.every((r) => r.ok), JSON.stringify(applied.results))

  // Read backup file — it stores previous content which may include old credentials
  const backupContent = fs.readFileSync(backup, 'utf8')
  const backupData = JSON.parse(backupContent)

  // The backup stores prefsPrevious which captures network.proxy.socks_password
  // from the prefs.js BEFORE our inject. If that file had credentials, they
  // are now stored in plaintext in the backup JSON file.
  const hasPrefsPrevious = backupData.firefox?.prefsPrevious != null
  assert.ok(
    hasPrefsPrevious,
    'Backup must store prefsPrevious which captures credential fields',
  )

  // The prefsPrevious may contain the old username/password
  const pp = backupData.firefox.prefsPrevious
  const storedOldPass = pp?.['network.proxy.socks_password']
  const storedOldUser = pp?.['network.proxy.socks_username']

  // Old credentials stored in backup (even if null, the STRUCTURE is a credential store)
  assert.ok(
    'network.proxy.socks_password' in (pp || {}),
    'prefsPrevious records socks_password key (credential field) in backup',
  )

  // The backup file was created during applyInject.
  // It captures the OLD prefs.js content (before inject) including the old credentials.
  // Read the backup to verify old credentials are stored in plaintext on disk.
  const backupDataAfterApply = JSON.parse(fs.readFileSync(backup, 'utf8'))
  const prefsPrevious = backupDataAfterApply.firefox?.prefsPrevious

  // prefsPrevious is a Record<string, PrefScalar | null> that captures the
  // network.proxy.socks_password key from prefs.js BEFORE inject.
  // This means old credentials are stored in plaintext in the backup JSON file.
  assert.ok(
    'network.proxy.socks_username' in (prefsPrevious || {}),
    'prefsPrevious must capture socks_username from old prefs.js',
  )
  assert.ok(
    'network.proxy.socks_password' in (prefsPrevious || {}),
    'prefsPrevious must capture socks_password field (credential) from old prefs.js',
  )

  const capturedOldUser = prefsPrevious?.['network.proxy.socks_username']
  const capturedOldPass = prefsPrevious?.['network.proxy.socks_password']

  assert.equal(
    capturedOldUser,
    'olduser',
    `Backup must store old username. Got: ${capturedOldUser}`,
  )
  assert.equal(
    capturedOldPass,
    'oldpass',
    `Backup must store old password in PLAINTEXT. Got: ${capturedOldPass}`,
  )

  fs.rmSync(home, { recursive: true, force: true })

  console.log('BACKUP-STORE-CREDENTIALS: CONFIRMED')
  console.log(`Old credentials stored in backup file: user="${capturedOldUser}" pass="${capturedOldPass}"`)
  console.log('These credentials are stored in plaintext in:', backup)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
