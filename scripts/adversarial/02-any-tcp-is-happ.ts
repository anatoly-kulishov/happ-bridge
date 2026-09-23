/**
 * Contract: discover must identify Happ, not any open TCP on socks port.
 * Authz: open TCP :socksPort on LAN ⇒ treated as phone.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { discoverPhone } from '../../electron/discover'

async function main() {
  const port = 48301 + Math.floor(Math.random() * 400)
  const decoy = await new Promise<net.Server>((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(port, '127.0.0.1', () => resolve(s))
  })

  try {
    const found = await discoverPhone({
      socksPort: port,
      preferredIps: ['127.0.0.1'],
      concurrency: 1,
      timeoutMs: 200,
      scanSubnet: false,
    })

    assert.notEqual(
      found,
      '127.0.0.1',
      'bare TCP accept must not be treated as Happ phone',
    )
    assert.equal(found, null)
  } finally {
    await new Promise<void>((r) => decoy.close(() => r()))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
