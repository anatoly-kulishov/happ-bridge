/**
 * Contract: failed start must not leave partial listeners (socks===http).
 * normalizeSettings must also refuse colliding ports.
 */
import assert from 'node:assert/strict'
import { ProxyRelay, probePort } from '../../electron/relay'
import { normalizeSettings } from '../../electron/types'

async function main() {
  const port = 49301 + Math.floor(Math.random() * 500)

  const settings = normalizeSettings({ socksPort: port, httpPort: port })
  assert.notEqual(
    settings.socksPort,
    settings.httpPort,
    'normalizeSettings must not keep identical socks/http ports',
  )

  const relay = new ProxyRelay({
    socksPort: port,
    httpPort: port,
  })

  try {
    let threw = false
    try {
      await relay.start('127.0.0.1')
    } catch {
      threw = true
    }

    assert.equal(threw, true, 'same-port start should fail')
    assert.equal(relay.isListening(), false)
    assert.equal(relay.targetIp, null)

    const stillBound = await probePort('127.0.0.1', port, 200)
    assert.equal(
      stillBound,
      false,
      'failed start must not leave a dangling listener on the port',
    )
  } finally {
    await relay.stop().catch(() => undefined)
  }
}

main().catch(async (err) => {
  console.error(err)
  process.exit(1)
})
