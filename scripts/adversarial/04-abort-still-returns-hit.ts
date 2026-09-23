/**
 * Contract: aborted discover must not return a phone.
 * tryOne checks signal only before probePort; in-flight connect can still win.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { discoverPhone } from '../../electron/discover'

async function main() {
  const port = 48401 + Math.floor(Math.random() * 400)
  const server = await new Promise<net.Server>((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(port, '127.0.0.1', () => resolve(s))
  })

  try {
    const ac = new AbortController()
    const preferredIps = Array.from({ length: 40 }, (_, i) => `127.0.0.${i + 1}`)

    const p = discoverPhone({
      socksPort: port,
      preferredIps,
      concurrency: 16,
      timeoutMs: 500,
      signal: ac.signal,
    })
    ac.abort()
    const found = await p

    assert.equal(
      found,
      null,
      `aborted discover must not return a phone, got ${found}`,
    )
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
