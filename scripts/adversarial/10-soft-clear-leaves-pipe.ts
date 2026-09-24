/**
 * Contract: disconnected / soft-clear must not keep proxying.
 * setPhoneIp(null) refuses new clients but leaves active pipes alive.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { ProxyRelay } from '../../electron/relay'
import { freePorts } from './_ports'

async function listenEcho(host: string, port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => {
      c.on('data', (d) => c.write(d))
    })
    s.once('error', reject)
    s.listen(port, host, () => resolve(s))
  })
}

async function main() {
  const [socks, http] = await freePorts(2)
  const phone = await listenEcho('::1', socks)
  // http side unused by this client; still required by ProxyRelay
  const phoneHttp = await listenEcho('::1', http)
  const relay = new ProxyRelay({ socksPort: socks, httpPort: http })
  let client: net.Socket | null = null

  try {
    await relay.start('::1')

    client = net.connect({ host: '127.0.0.1', port: socks })
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve)
      client!.once('error', reject)
    })

    const roundtrip = () =>
      new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 500)
        client!.once('data', (d) => {
          clearTimeout(t)
          resolve(d.toString())
        })
        client!.write('still-alive')
      })

    assert.equal(await roundtrip(), 'still-alive')

    // Mirrors session healthCheck soft path
    relay.setPhoneIp(null)
    assert.equal(relay.targetIp, null)

    const afterClear = await roundtrip().catch((e: Error) => e.message)
    assert.notEqual(
      afterClear,
      'still-alive',
      'active pipe must die when soft-clear disconnects the phone',
    )
  } finally {
    client?.destroy()
    await relay.stop().catch(() => undefined)
    await Promise.all([
      new Promise<void>((r) => phone.close(() => r())),
      new Promise<void>((r) => phoneHttp.close(() => r())),
    ])
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
