/**
 * Contract: lastTraffic health must not mask a dead phone via stale/local pipes.
 * client 'data' marks lastTrafficAt even when remote never connects.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { ProxyRelay } from '../../electron/relay'
import { freePorts } from './_ports'

const TRAFFIC_FRESH_MS = 15_000

async function main() {
  const [socks, http] = await freePorts(2)

  // Local listeners so relay.start succeeds; phone target is blackhole IP
  // that won't accept (use 127.0.0.1 with nothing on remote side of FORWARD port —
  // relay listens on socks and connects to phoneIp:socks. If phoneIp is
  // 127.0.0.1, remote connect hits the SAME local relay server → self-connect mess.
  // Use TEST-NET 192.0.2.1 (documentation, non-routable) as dead phone.
  const relay = new ProxyRelay({ socksPort: socks, httpPort: http })
  let client: net.Socket | null = null
  try {
    await relay.start('192.0.2.1')
    assert.equal(relay.lastTrafficMs, 0)

    client = net.connect({ host: '127.0.0.1', port: socks })
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve)
      client!.once('error', reject)
    })

    // Local client writes before/without working remote — marks traffic
    client.write(Buffer.alloc(64, 0x41))
    await new Promise((r) => setTimeout(r, 50))

    const age = Date.now() - relay.lastTrafficMs
    const wouldSkipProbe =
      relay.lastTrafficMs > 0 && age < TRAFFIC_FRESH_MS

    assert.equal(
      wouldSkipProbe,
      false,
      'client-only bytes must not freshen lastTraffic while phone is dead',
    )
  } finally {
    client?.destroy()
    await relay.stop().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
