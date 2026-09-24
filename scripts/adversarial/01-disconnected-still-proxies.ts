/**
 * Contract: disconnected ⇒ must not keep proxying.
 * Soft path clears relay target (setPhoneIp(null)); new pipes are refused.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { ProxyRelay } from '../../electron/relay'
import { freePorts } from './_ports'

async function main() {
  const [socks, http] = await freePorts(2)
  const relay = new ProxyRelay({ socksPort: socks, httpPort: http })
  let client: net.Socket | null = null
  try {
    await relay.start('192.0.2.1')
    assert.equal(relay.targetIp, '192.0.2.1')
    assert.equal(relay.isListening(), true)

    // Mirrors session.ts healthCheck soft path:
    relay.setPhoneIp(null)
    assert.equal(relay.targetIp, null, 'soft-disconnect must clear relay.targetIp')

    client = net.connect({ host: '127.0.0.1', port: socks })
    const closed = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 300)
      client!.once('close', () => {
        clearTimeout(t)
        resolve(true)
      })
      client!.once('error', () => {
        clearTimeout(t)
        resolve(true)
      })
    })
    assert.equal(closed, true, 'new client must be refused when target is cleared')
  } finally {
    client?.destroy()
    await relay.stop().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
