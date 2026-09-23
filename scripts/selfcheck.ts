/**
 * Self-check without Electron. Run: npm test
 */
import assert from 'node:assert/strict'
import { localSubnetHosts } from '../electron/discover'
import { ProxyRelay, probePort } from '../electron/relay'
import { normalizeSettings, statusPresentation } from '../electron/types'

async function main() {
  assert.equal(normalizeSettings({ socksPort: 99999 }).socksPort, 10808)
  assert.equal(normalizeSettings({ httpPort: 'nope' as unknown as number }).httpPort, 10809)
  assert.equal(statusPresentation('searching', null).tone, 'yellow')
  assert.ok(statusPresentation('connected', '10.0.0.5').label.includes('10.0.0.5'))

  const hosts = localSubnetHosts(['192.168.1.50'])
  assert.ok(hosts.includes('192.168.1.1'))
  assert.ok(!hosts.includes('192.168.1.50'))
  assert.equal(hosts.length, 253)

  const relay = new ProxyRelay({ socksPort: 39331, httpPort: 39332 })
  await relay.start('127.0.0.1')
  assert.equal(await probePort('127.0.0.1', 39331), true)
  assert.equal(await probePort('127.0.0.1', 39332), true)
  await relay.stop()
  assert.equal(await probePort('127.0.0.1', 39331), false)

  console.log('selfcheck ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
