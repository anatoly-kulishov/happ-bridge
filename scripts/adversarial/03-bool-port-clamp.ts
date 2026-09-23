/**
 * Contract: settings port clamp / validation.
 * boolean true → Number(true)=1 → accepted as port 1.
 */
import assert from 'node:assert/strict'
import { normalizeSettings } from '../../electron/types'

async function main() {
  const s = normalizeSettings({ socksPort: true as unknown as number })
  assert.notEqual(
    s.socksPort,
    1,
    'boolean true must not coerce to privileged port 1',
  )
  assert.equal(s.socksPort, 10808)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
