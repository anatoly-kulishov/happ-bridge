/**
 * Contract: switching phone must not leave pipes to the previous peer.
 * start()/setPhoneIp updates targetIp but does not tear down ActivePipe set.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { ProxyRelay } from '../../electron/relay'
import { freePorts } from './_ports'

async function listenTagged(host: string, port: number, tag: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => {
      c.on('data', () => c.write(tag))
    })
    s.once('error', reject)
    s.listen(port, host, () => resolve(s))
  })
}

async function main() {
  const [socks, http] = await freePorts(2)

  // Peer A on ::1; peer B simulated by closing A and binding same ports on a
  // second stack is hard — instead: switch targetIp to a dead host while pipe
  // to A stays up, proving substitution does not cut old pipes.
  const peerA = await listenTagged('::1', socks, 'PEER-A')
  const peerAHttp = await listenTagged('::1', http, 'PEER-A')
  const relay = new ProxyRelay({ socksPort: socks, httpPort: http })
  let client: net.Socket | null = null

  try {
    await relay.start('::1')

    client = net.connect({ host: '127.0.0.1', port: socks })
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve)
      client!.once('error', reject)
    })

    const once = () =>
      new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 500)
        client!.once('data', (d) => {
          clearTimeout(t)
          resolve(d.toString())
        })
        client!.write('who')
      })

    assert.equal(await once(), 'PEER-A')

    // Soft switch to another phone (selectPhone / start path when already bound)
    await relay.start('192.0.2.99')
    assert.equal(relay.targetIp, '192.0.2.99')

    const afterSwitch = await once().catch((e: Error) => e.message)
    assert.notEqual(
      afterSwitch,
      'PEER-A',
      'stale pipe must not keep serving the previous phone after peer switch',
    )
  } finally {
    client?.destroy()
    await relay.stop().catch(() => undefined)
    await Promise.all([
      new Promise<void>((r) => peerA.close(() => r())),
      new Promise<void>((r) => peerAHttp.close(() => r())),
    ])
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
