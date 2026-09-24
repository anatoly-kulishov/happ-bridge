/**
 * Contract: preset / copy proxy material must not drop auth when credentials set.
 * presetText('socks'|'http') returns host:port only — no login.
 */
import assert from 'node:assert/strict'
import { presetText } from '../../electron/presets'
import { normalizeSettings, socksAuthFromSettings } from '../../electron/types'

async function main() {
  const settings = normalizeSettings({
    proxyUser: 'bob',
    proxyPassword: 'sekrit',
    socksPort: 10808,
    httpPort: 10809,
  })
  const auth = socksAuthFromSettings(settings)
  assert.ok(auth)

  const socks = presetText('socks', settings.socksPort, settings.httpPort, auth)
  const http = presetText('http', settings.socksPort, settings.httpPort, auth)

  assert.match(
    socks,
    /bob|sekrit/,
    'socks preset must surface credentials when auth is set',
  )
  assert.match(
    http,
    /bob|sekrit/,
    'http preset must surface credentials when auth is set',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
