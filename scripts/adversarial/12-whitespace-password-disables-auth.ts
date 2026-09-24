/**
 * Contract: credentials must not be lost in normalizeSettings such that
 * intended auth / anti-spoof is disabled.
 * Whitespace-only password → null → socksAuthFromSettings returns null
 * → open no-auth decoy is accepted.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { probeSocks5 } from '../../electron/relay'
import { normalizeSettings, socksAuthFromSettings } from '../../electron/types'

/** Open no-auth SOCKS5 decoy (method 0x00). */
function listenNoAuth(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on('data', (buf) => {
        if (buf.length >= 2 && buf[0] === 0x05) {
          socket.write(Buffer.from([0x05, 0x00]))
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
  const settings = normalizeSettings({
    proxyUser: null,
    proxyPassword: '   ',
  })
  const auth = socksAuthFromSettings(settings)

  const decoy = await listenNoAuth()
  try {
    // If auth were preserved, open no-auth must fail. After whitespace wipe,
    // auth is null and the decoy is accepted — anti-spoof disabled.
    assert.notEqual(
      auth,
      null,
      `whitespace password became auth=${JSON.stringify(auth)}; anti-spoof off`,
    )
    const accepted = await probeSocks5(
      '127.0.0.1',
      decoy.port,
      400,
      undefined,
      auth,
    )
    assert.equal(
      accepted,
      false,
      'with intended credentials, open no-auth SOCKS must not pass probe',
    )
  } finally {
    await decoy.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
