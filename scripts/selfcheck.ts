/**
 * Self-check without Electron. Run: npm test
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { localSubnetHosts, prioritizedHosts, pickPreferredPhone, scanAllHosts } from '../electron/discover'
import {
  applyInject,
  buildWebstormXml,
  mergeCursorSettings,
  parseFirefoxDefaultProfile,
  restoreCursorSettings,
  revertInject,
  stripFirefoxBlock,
  upsertFirefoxBlock,
} from '../electron/inject'
import { ProxyRelay, probePort, probeSocks5 } from '../electron/relay'
import { presetText } from '../electron/presets'
import {
  normalizeSettings,
  rememberPhoneIp,
  statusPresentation,
} from '../electron/types'

async function main() {
  assert.equal(normalizeSettings({ socksPort: 99999 }).socksPort, 10808)
  assert.equal(normalizeSettings({ socksPort: true as unknown as number }).socksPort, 10808)
  assert.equal(
    normalizeSettings({ lastPhoneIp: 'nope', manualIp: '1.2.3' }).lastPhoneIp,
    null,
  )
  assert.notEqual(
    normalizeSettings({ socksPort: 10808, httpPort: 10808 }).httpPort,
    10808,
  )
  assert.equal(normalizeSettings({}).seamlessAppProxy, false)
  assert.deepEqual(normalizeSettings({}).injectTargets, [])
  assert.deepEqual(
    normalizeSettings({ injectTargets: ['cursor', 'nope', 'firefox'] as never }).injectTargets,
    ['cursor', 'firefox'],
  )
  assert.deepEqual(
    rememberPhoneIp(
      normalizeSettings({ lastPhoneIp: '10.0.0.1', recentPhoneIps: ['10.0.0.2'] }),
      '10.0.0.9',
    ).recentPhoneIps,
    ['10.0.0.9', '10.0.0.2', '10.0.0.1'],
  )
  assert.equal(
    rememberPhoneIp(normalizeSettings({}), 'not-an-ip').lastPhoneIp,
    null,
  )
  assert.equal(statusPresentation('searching', null).tone, 'yellow')
  assert.ok(presetText('telegram', 10808, 10809).includes('SOCKS5'))
  assert.equal(
    pickPreferredPhone(['10.0.0.2', '10.0.0.5'], '10.0.0.5', ['10.0.0.2']),
    '10.0.0.5',
  )
  assert.equal(
    pickPreferredPhone(['10.0.0.2', '10.0.0.5'], null, ['10.0.0.9', '10.0.0.2']),
    '10.0.0.2',
  )
  assert.equal(pickPreferredPhone(['10.0.0.2'], null, []), null)

  const hosts = localSubnetHosts(['192.168.1.50'])
  assert.ok(hosts.includes('192.168.1.1'))
  assert.equal(hosts.length, 253)

  const prio = prioritizedHosts(new Set(['192.168.1.10']), localSubnetHosts(['192.168.1.50']))
  assert.ok(!prio.includes('192.168.1.10'))
  assert.ok(prio.indexOf('192.168.1.5') < prio.indexOf('192.168.1.200'))

  const relay = new ProxyRelay({ socksPort: 39331, httpPort: 39332 })
  await relay.start('127.0.0.1')
  assert.equal(await probePort('127.0.0.1', 39331), true)
  await relay.start('127.0.0.2')
  assert.equal(relay.targetIp, '127.0.0.2')
  assert.equal(relay.isListening(), true)
  relay.setPhoneIp(null)
  assert.equal(relay.targetIp, null)
  await relay.stop()
  assert.equal(await probePort('127.0.0.1', 39331), false)

  const merged = mergeCursorSettings(
    { 'http.proxy': 'http://old:1', theme: 'dark' },
    { socksPort: 10808, httpPort: 10809 },
  )
  assert.equal(merged['http.proxy'], 'http://127.0.0.1:10809')
  assert.equal(merged.theme, 'dark')
  const restored = restoreCursorSettings(merged, { 'http.proxy': 'http://old:1' })
  assert.equal(restored['http.proxy'], 'http://old:1')
  assert.equal(restored['http.proxySupport'], undefined)

  const xml = buildWebstormXml({ socksPort: 10808, httpPort: 10809 })
  assert.ok(xml.includes('PROXY_HOST" value="127.0.0.1"'))
  assert.ok(xml.includes('PROXY_PORT" value="10808"'))

  const block = upsertFirefoxBlock('user_pref("foo", 1);\n', {
    socksPort: 10808,
    httpPort: 10809,
  })
  assert.ok(block.includes('happ-bridge managed'))
  assert.ok(block.includes('socks_port", 10808'))
  assert.ok(!stripFirefoxBlock(block).includes('happ-bridge'))

  assert.equal(
    parseFirefoxDefaultProfile(
      ['[Profile0]', 'Name=x', 'IsRelative=1', 'Path=Profiles/mine', 'Default=1'].join('\n'),
      '/nonexistent-firefox-root-happ-bridge',
    ),
    null,
  )

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-inject-'))
  const backup = path.join(home, 'backups.json')
  try {
    const cursorFile = path.join(
      home,
      'Library/Application Support/Cursor/User/settings.json',
    )
    fs.mkdirSync(path.dirname(cursorFile), { recursive: true })
    fs.writeFileSync(
      cursorFile,
      JSON.stringify({ 'http.proxy': 'http://192.168.1.6:10808', keep: true }, null, 4),
      'utf8',
    )

    const wsFile = path.join(
      home,
      'Library/Application Support/JetBrains/WebStorm2099.1/options/proxy.settings.xml',
    )
    fs.mkdirSync(path.dirname(wsFile), { recursive: true })
    fs.writeFileSync(wsFile, '<application><component name="HttpConfigurable" /></application>\n')

    const ffProfile = path.join(
      home,
      'Library/Application Support/Firefox/Profiles/test.default',
    )
    fs.mkdirSync(ffProfile, { recursive: true })
    fs.writeFileSync(
      path.join(home, 'Library/Application Support/Firefox/profiles.ini'),
      ['[Profile0]', 'Name=test', 'IsRelative=1', 'Path=Profiles/test.default', 'Default=1'].join(
        '\n',
      ),
      'utf8',
    )
    fs.writeFileSync(
      path.join(ffProfile, 'user.js'),
      'user_pref("browser.shell.checkDefaultBrowser", false);\n',
    )
    fs.writeFileSync(
      path.join(ffProfile, 'prefs.js'),
      [
        'user_pref("network.proxy.type", 0);',
        'user_pref("network.proxy.socks", "192.168.1.6");',
        'user_pref("network.proxy.socks_port", 1080);',
      ].join('\n') + '\n',
    )

    const ports = { socksPort: 10808, httpPort: 10809 }
    const applied = applyInject(['cursor', 'webstorm', 'firefox'], ports, home, backup)
    assert.ok(applied.results.every((r) => r.ok), JSON.stringify(applied.results))

    const cursorAfter = JSON.parse(fs.readFileSync(cursorFile, 'utf8')) as Record<
      string,
      unknown
    >
    assert.equal(cursorAfter['http.proxy'], 'http://127.0.0.1:10809')
    assert.equal(cursorAfter.keep, true)

    const wsAfter = fs.readFileSync(wsFile, 'utf8')
    assert.ok(wsAfter.includes('127.0.0.1'))
    assert.ok(wsAfter.includes('10808'))

    const ffAfter = fs.readFileSync(path.join(ffProfile, 'user.js'), 'utf8')
    assert.ok(ffAfter.includes('happ-bridge managed'))
    assert.ok(ffAfter.includes('checkDefaultBrowser'))

    const prefsAfter = fs.readFileSync(path.join(ffProfile, 'prefs.js'), 'utf8')
    assert.ok(prefsAfter.includes('127.0.0.1'))
    assert.ok(prefsAfter.includes('10808'))

    const reverted = revertInject(['cursor', 'webstorm', 'firefox'], ports, home, backup)
    assert.ok(reverted.results.every((r) => r.ok), JSON.stringify(reverted.results))

    const cursorBack = JSON.parse(fs.readFileSync(cursorFile, 'utf8')) as Record<
      string,
      unknown
    >
    assert.equal(cursorBack['http.proxy'], 'http://192.168.1.6:10808')
    assert.equal(cursorBack['http.proxySupport'], undefined)
    assert.equal(cursorBack.keep, true)

    assert.equal(
      fs.readFileSync(wsFile, 'utf8'),
      '<application><component name="HttpConfigurable" /></application>\n',
    )
    assert.ok(
      fs.readFileSync(path.join(ffProfile, 'user.js'), 'utf8').includes('192.168.1.6'),
    )
    const prefsBack = fs.readFileSync(path.join(ffProfile, 'prefs.js'), 'utf8')
    assert.match(prefsBack, /network\.proxy\.type", 1/)
    assert.match(prefsBack, /network\.proxy\.socks", "192\.168\.1\.6"/)
    assert.match(prefsBack, /socks_port", 1080/)
    assert.ok(!prefsBack.includes('127.0.0.1'))
    assert.equal(fs.existsSync(backup), false)

    // If snapshot was already bridge (127.0.0.1), quit restores phoneIp
    fs.writeFileSync(
      path.join(ffProfile, 'prefs.js'),
      [
        'user_pref("network.proxy.type", 1);',
        'user_pref("network.proxy.socks", "127.0.0.1");',
        'user_pref("network.proxy.socks_port", 10808);',
      ].join('\n') + '\n',
    )
    const applied2 = applyInject(['firefox'], { ...ports, phoneIp: '192.168.1.9' }, home, backup)
    assert.ok(applied2.results.every((r) => r.ok))
    const reverted2 = revertInject(
      ['firefox'],
      { ...ports, phoneIp: '192.168.1.9' },
      home,
      backup,
    )
    assert.ok(reverted2.results.every((r) => r.ok), JSON.stringify(reverted2.results))
    const prefsPhone = fs.readFileSync(path.join(ffProfile, 'prefs.js'), 'utf8')
    assert.match(prefsPhone, /socks", "192\.168\.1\.9"/)
    assert.ok(!prefsPhone.includes('127.0.0.1'))
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }

  // AbortSignal: one listener for many concurrent probes (no MaxListenersExceeded)
  {
    const warnings: string[] = []
    const onWarn = (w: Error) => warnings.push(String(w))
    process.on('warning', onWarn)
    const ac = new AbortController()
    const hosts = Array.from({ length: 64 }, (_, i) => `127.0.0.${i + 1}`)
    await scanAllHosts(
      hosts,
      async (ip, signal) => ((await probeSocks5(ip, 1, 50, signal)) ? ip : null),
      32,
      ac.signal,
    )
    process.off('warning', onWarn)
    assert.equal(
      warnings.filter((w) => w.includes('MaxListenersExceeded')).length,
      0,
      warnings.join('\n'),
    )
  }

  console.log('selfcheck ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
