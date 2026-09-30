/**
 * Attack: applyFirefoxPrefs() writes plaintext password into Firefox prefs.js
 * via the socks_password user_pref (electron/inject.ts:718-732).
 *
 * Why: applyFirefoxPrefs calls injectAuth(ports) to get user/pass, then writes:
 *   user_pref("network.proxy.socks_password", "PASS");
 * directly to prefs.js — no encryption.
 *
 * Test: call the internal applyFirefoxPrefs equivalent (via upsertFirefoxBlock
 * with auth) and verify password appears in plaintext in the output.
 */
import assert from 'node:assert/strict'
import { upsertFirefoxBlock } from '../../electron/inject'

async function main() {
  const PASS = 'FirefoxSekrit99'
  const USER = 'ffuser'

  const block = upsertFirefoxBlock('', {
    socksPort: 10808,
    httpPort: 10809,
    proxyUser: USER,
    proxyPassword: PASS,
  })

  // Password must NOT appear in plaintext
  assert.ok(
    !xmlContains(block, PASS),
    `Firefox prefs block must not contain plaintext password. Found in:\n${block}`,
  )

  // Also check the JSON-stringified version (auth is stored as JSON string)
  assert.ok(
    !block.includes(`"${PASS}"`),
    `Firefox prefs block must not contain JSON-escaped password. Found in:\n${block}`,
  )

  console.log('PLAINTEXT-FF-PREFS: PASS (no plaintext password found)')
}

function xmlContains(haystack: string, needle: string): boolean {
  // Check raw
  if (haystack.includes(needle)) return true
  // Check xmlEscaped (password characters that would be escaped: & < > " )
  const escaped = needle
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return haystack.includes(escaped)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
