/**
 * Attack: mergeCursorSettings() embeds credentials in the proxy URL written
 * to Cursor's settings.json (electron/inject.ts:275-286).
 * socksProxyUrl() encodes user:pass into the URL:
 *   socks5://user:pass@127.0.0.1:10808
 *
 * Why: mergeCursorSettings calls socksProxyUrl('127.0.0.1', ports.socksPort, auth)
 * with auth=injectAuth(ports) which returns the plaintext credentials.
 * The resulting URL is written to settings.json.
 *
 * Test: call mergeCursorSettings with credentials and verify the password
 * appears encoded in the URL written to the settings object.
 */
import assert from 'node:assert/strict'
import { mergeCursorSettings } from '../../electron/inject'

async function main() {
  const PASS = 'CursorPass123'
  const USER = 'cursoruser'

  const merged = mergeCursorSettings(
    {},
    { socksPort: 10808, httpPort: 10809, proxyUser: USER, proxyPassword: PASS },
  )

  const proxyUrl = merged['http.proxy'] as string
  // URL-encoded password: space → %20, special chars encoded
  const encodedPass = encodeURIComponent(PASS)
  const encodedUser = encodeURIComponent(USER)

  // Password must NOT appear in plaintext in the URL
  assert.ok(
    !proxyUrl.includes(PASS),
    `settings.json must not contain plaintext password. Found "${PASS}" in URL: ${proxyUrl}`,
  )

  // Even URL-encoded, the password in cleartext form should not appear
  // (encodeURIComponent doesn't hide the password string, just escapes special chars)
  assert.ok(
    !proxyUrl.includes(encodedPass) || proxyUrl.includes(encodedUser + ':' + encodedPass),
    `Encoded password "${encodedPass}" must not appear unless as user:pass segment`,
  )

  // The user:pass@ segment IS the credential leak (even URL-encoded, it's reversible)
  assert.ok(
    proxyUrl.includes(`${encodedUser}:${encodedPass}@`) ||
    proxyUrl.includes(`${USER}:${PASS}@`),
    `Credentials must not be embedded in URL. URL: ${proxyUrl}`,
  )

  console.log('PLAINTEXT-CURSOR-SETTINGS: CONFIRMED — credentials in settings.json URL')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
