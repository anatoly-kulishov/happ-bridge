/**
 * Contract: concurrent ProxyRelay.start must not race into EADDRINUSE / torn state.
 */
import assert from 'node:assert/strict'
import { ProxyRelay, probePort } from '../../electron/relay'

async function main() {
  const socks = 49401 + Math.floor(Math.random() * 500)
  const http = socks + 1
  const relay = new ProxyRelay({ socksPort: socks, httpPort: http })

  try {
    const results = await Promise.allSettled([
      relay.start('192.0.2.10'),
      relay.start('192.0.2.20'),
    ])

    const rejected = results.filter((r) => r.status === 'rejected')
    const listening = relay.isListening()
    const socksUp = await probePort('127.0.0.1', socks, 200)
    const httpUp = await probePort('127.0.0.1', http, 200)

    assert.equal(
      rejected.length,
      0,
      `concurrent start rejected: ${rejected.map((r) => (r as PromiseRejectedResult).reason).join('; ')}`,
    )
    assert.equal(listening, true)
    assert.equal(socksUp && httpUp, true)
    assert.ok(
      relay.targetIp === '192.0.2.10' || relay.targetIp === '192.0.2.20',
    )
  } finally {
    await relay.stop().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
