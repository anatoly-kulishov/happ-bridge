/**
 * Attack: buildWebstormXml() writes plaintext password into WebStorm's
 * proxy.settings.xml file on disk (electron/inject.ts:303-325).
 *
 * Why: buildWebstormXml calls injectAuth(ports) which returns {user, pass},
 * then writes <option name="PROXY_PASSWORD" value="{pass}"/> directly to XML
 * with only xmlEscape() applied (no encryption).
 *
 * Test: call buildWebstormXml with credentials and verify password appears
 * plaintext in the output XML.
 */
import assert from 'node:assert/strict'
import { buildWebstormXml } from '../../electron/inject'

async function main() {
  const PASS = 'MySekritPass!2024'
  const USER = 'happuser'

  const xml = buildWebstormXml({
    socksPort: 10808,
    httpPort: 10809,
    proxyUser: USER,
    proxyPassword: PASS,
  })

  // Password must NOT appear in plaintext in the XML
  assert.ok(
    !xml.includes(PASS),
    `XML must not contain plaintext password. Found "${PASS}" in:\n${xml}`,
  )

  // If password appears in plaintext → CONFIRMED VULNERABILITY
  console.log('PLAINTEXT-WEBSTORM-XML: PASS (no plaintext password found)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
