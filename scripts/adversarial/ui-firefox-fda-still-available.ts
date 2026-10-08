/**
 * Attack: firefoxInjectInfo marks available=true when profile.kind==='denied'
 * and Firefox.app exists, while detail says «нет доступа». InjectAppsPanel
 * enables the checkbox (available) and only shows an amber badge — user can
 * select «Прописать» and get a guaranteed FDA failure.
 *
 * Invariant: detail matching /нет доступа/i ⇒ available === false.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { injectStatus } from '../../electron/inject'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-ui-ff-fda-'))
try {
  fs.mkdirSync(path.join(home, 'Applications', 'Firefox.app'), { recursive: true })
  const ffRoot = path.join(home, 'Library', 'Application Support', 'Firefox')
  fs.mkdirSync(ffRoot, { recursive: true })
  const ini = path.join(ffRoot, 'profiles.ini')
  fs.writeFileSync(
    ini,
    ['[Profile0]', 'Name=default', 'IsRelative=1', 'Path=Profiles/x.default', 'Default=1'].join(
      '\n',
    ),
  )
  // Owner cannot read → safeFirefoxProfile catches EACCES → kind 'denied'
  fs.chmodSync(ini, 0o000)

  const ff = injectStatus(home).find((t) => t.id === 'firefox')
  assert.ok(ff, 'firefox target missing')
  assert.match(ff.detail, /нет доступа/i, `expected FDA detail, got: ${ff.detail}`)
  assert.equal(
    ff.available,
    false,
    `FDA denial must not be selectable (available=${ff.available}, detail=${ff.detail})`,
  )
} finally {
  try {
    fs.chmodSync(
      path.join(home, 'Library', 'Application Support', 'Firefox', 'profiles.ini'),
      0o644,
    )
  } catch {
    /* ignore */
  }
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('ui-firefox-fda-still-available: unexpected pass')
