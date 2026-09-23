/**
 * Contract: rememberPhoneIp / normalizeSettings must reject non-IP strings.
 */
import assert from 'node:assert/strict'
import { normalizeSettings, rememberPhoneIp } from '../../electron/types'

async function main() {
  const evil = 'not-a-phone.example; DROP TABLE'
  const n = normalizeSettings({ lastPhoneIp: evil, manualIp: evil })
  assert.equal(n.lastPhoneIp, null, 'garbage lastPhoneIp must be rejected')
  assert.equal(n.manualIp, null, 'garbage manualIp must be rejected')

  const remembered = rememberPhoneIp(normalizeSettings({}), evil)
  assert.equal(
    remembered.lastPhoneIp,
    null,
    'rememberPhoneIp must not persist non-IP',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
