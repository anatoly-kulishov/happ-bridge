/**
 * Contract: without credentials, no-auth Happ detection must still work.
 * normalizeSettings keeps proxyPassword:'' → socksAuthFromSettings enables
 * empty user/pass auth → open no-auth Happ is rejected.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { probeSocks5 } from '../../electron/relay'
import { normalizeSettings, socksAuthFromSettings } from '../../electron/types'

function listenNoAuth(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on('data', (buf) => {
        if (buf.length >= 2 && buf[0] === 0x05) {
          const nmethods = buf[1]
          const methods = [...buf.subarray(2, 2 + nmethods)]
          if (methods.includes(0x00)) socket.write(Buffer.from([0x05, 0x00]))
          else socket.write(Buffer.from([0x05, 0xff]))
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
  const settings = normalizeSettings({ proxyPassword: '' })
  const auth = socksAuthFromSettings(settings)

  const decoy = await listenNoAuth()
  try {
    assert.equal(
      await probeSocks5('127.0.0.1', decoy.port, 400),
      true,
      'control: open no-auth SOCKS must look like Happ without auth',
    )

    const detected = await probeSocks5(
      '127.0.0.1',
      decoy.port,
      400,
      undefined,
      auth,
    )
    assert.equal(
      detected,
      true,
      `empty proxyPassword must not force auth=${JSON.stringify(auth)} and hide no-auth Happ (got detected=${detected})`,
    )
  } finally {
    await decoy.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
