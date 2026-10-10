/**
 * Regression tests against electron/discover.ts — the netmask-aware rework.
 * Run: npx tsx scripts/adversarial-discover.ts
 *
 * Guarantees:
 *  - livePreferredIps keeps a peer anywhere in the same real subnet (not just /24).
 *  - localSubnetHosts enumerates the real subnet (a /23 sibling is swept).
 *  - unfocusedSubnetHosts returns the iface a focused scan would skip.
 *  - probeTcp is abort-aware: a cancelled probe never reports a hit.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import {
  livePreferredIps,
  localSubnetHosts,
  networkFingerprint,
  probeTcp,
  subnetHostsFor,
  unfocusedSubnetHosts,
} from '../electron/discover'

const results: string[] = []
async function expect(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    results.push(`ok    ${name}`)
  } catch (err) {
    results.push(`FAIL  ${name} :: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
  }
}

async function main() {
  // /16 LAN: phone is in a sibling /24 but the same real subnet → must be kept.
  await expect('livePreferredIps keeps same-/16 different-/24 peer', () => {
    const kept = livePreferredIps(['192.168.7.20'], [{ address: '192.168.5.10', maskBits: 16 }])
    assert.deepEqual(kept, ['192.168.7.20'])
  })

  // /23 LAN split across sibling /24s → swept (under the cap).
  await expect('localSubnetHosts sweeps the /23 sibling /24', () => {
    const hosts = localSubnetHosts([{ address: '192.168.5.10', maskBits: 23 }], [])
    assert.ok(hosts.includes('192.168.4.9'), `missing sibling host; got ${hosts.length} hosts`)
    assert.ok(hosts.includes('192.168.5.9'))
  })

  // subnetHostsFor /23 returns the full sibling half.
  await expect('subnetHostsFor /23 covers both /24 halves', () => {
    const hosts = subnetHostsFor('192.168.5.10', 23)
    assert.ok(hosts.includes('192.168.4.9'))
    assert.equal(hosts.length, 510)
  })

  // /16 peer kept when it truly shares the same /16 (10.0.2.9 vs 10.0.0.5).
  await expect('livePreferredIps treats real /16 via maskBits', () => {
    const kept = livePreferredIps(['10.0.2.9'], [{ address: '10.0.0.5', maskBits: 16 }])
    assert.deepEqual(kept, ['10.0.2.9'])
  })

  // Different MASK, same address — peer must be dropped (stale/other network).
  await expect('livePreferredIps drops peer on a different subnet', () => {
    const kept = livePreferredIps(['192.168.7.20'], [{ address: '192.168.5.10', maskBits: 24 }])
    assert.deepEqual(kept, [])
  })

  // A /16 sweep under the cap? No — it must NOT blow up: localSubnetHosts caps wide
  // nets back to /24 (sweep DoS guard), but still never crashes on a /16 input.
  await expect('localSubnetHosts caps wide /16 (no blow-up)', () => {
    const hosts = localSubnetHosts([{ address: '192.168.5.10', maskBits: 16 }], [])
    assert.ok(hosts.length <= 254)
    assert.ok(hosts.includes('192.168.5.20'))
  })

  // Late VPN: focused Wi‑Fi miss leaves utun hosts for the fallback sweep.
  await expect('unfocusedSubnetHosts returns skipped VPN iface', () => {
    const locals = [
      { address: '192.168.0.212', maskBits: 24 },
      { address: '192.168.132.107', maskBits: 22 },
    ]
    const skipped = unfocusedSubnetHosts(['192.168.0.209'], locals)
    assert.ok(skipped.some((ip) => ip.startsWith('192.168.132.')), `got ${skipped.length}`)
    assert.ok(!skipped.some((ip) => ip.startsWith('192.168.0.')))
  })

  // Fingerprint must change when utun appears alongside Wi‑Fi.
  await expect('networkFingerprint includes all ifaces', () => {
    assert.notEqual(
      networkFingerprint(['192.168.0.212']),
      networkFingerprint(['192.168.0.212', '192.168.132.107']),
    )
  })

  // probeTcp is abort-aware: a pre-aborted probe must resolve false (no fabricated hit).
  await expect('probeTcp reports false when already-aborted', async () => {
    const server = net.createServer((c) => c.end())
    await new Promise<void>((res, rej) => {
      server.once('error', rej)
      server.listen(0, '127.0.0.1', res)
    })
    try {
      const port = (server.address() as net.AddressInfo).port
      const ac = new AbortController()
      ac.abort()
      assert.equal(await probeTcp('127.0.0.1', port, 1000, ac.signal), false)
    } finally {
      server.close()
    }
  })

  // Abort racing an in-flight connect to a non-routable host must resolve false
  // (no hang, no fabricated hit) within milliseconds.
  await expect('probeTcp abort mid-flight resolves false', async () => {
    const ac = new AbortController()
    const p = probeTcp('192.0.2.1', 10808, 5000, ac.signal)
    setTimeout(() => ac.abort(), 10)
    const started = Date.now()
    const ok = await p
    assert.equal(ok, false)
    assert.ok(Date.now() - started < 1000, `abort did not resolve fast (${Date.now() - started}ms)`)
  })

  // probeTcp under one shared signal must not spawn per-socket listeners
  // (MaxListenersExceededWarning), like the rest of the scan path.
  await expect('probeTcp does not exceed MaxListeners on a shared signal', async () => {
    const warnings: string[] = []
    const onWarn = (w: Error) => warnings.push(String(w))
    process.on('warning', onWarn)
    try {
      const ac = new AbortController()
      const server = net.createServer((c) => c.end())
      await new Promise<void>((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res) })
      try {
        const port = (server.address() as net.AddressInfo).port
        await Promise.all(
          Array.from({ length: 64 }, () => probeTcp('127.0.0.1', port, 200, ac.signal)),
        )
      } finally {
        server.close()
      }
    } finally {
      process.off('warning', onWarn)
    }
    assert.equal(
      warnings.filter((w) => w.includes('MaxListenersExceeded')).length,
      0,
      warnings.join('\n'),
    )
  })

  console.log('\n' + results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL'))
  if (failed.length > 0) {
    console.log(`\n${failed.length} assertion(s) FAIL`)
    process.exit(1)
  }
  console.log('all assertions pass')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})