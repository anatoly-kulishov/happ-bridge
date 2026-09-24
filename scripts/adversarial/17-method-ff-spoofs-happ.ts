/**
 * Contract: discover must identify Happ, not any SOCKS5-shaped reply.
 * probeSocks5(no auth) treats method 0xff (no acceptable methods) as Happ.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { discoverPhone } from '../../electron/discover'
import { probeSocks5 } from '../../electron/relay'

function listenMethod(method: number): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on('data', (buf) => {
        if (buf.length >= 2 && buf[0] === 0x05) {
          socket.write(Buffer.from([0x05, method]))
        }
      })
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'))
        return
      }
      resolve({
        port: addr.port,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

async function main() {
  const decoy = await listenMethod(0xff)
  try {
    const hit = await probeSocks5('127.0.0.1', decoy.port, 400)
    assert.equal(
      hit,
      false,
      'SOCKS5 method 0xff (rejection) must not count as Happ identity',
    )

    const found = await discoverPhone({
      socksPort: decoy.port,
      preferredIps: ['127.0.0.1'],
      concurrency: 1,
      timeoutMs: 300,
      scanSubnet: false,
    })
    assert.equal(found, null, 'discover must not accept 0xff decoy as phone')
  } finally {
    await decoy.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
