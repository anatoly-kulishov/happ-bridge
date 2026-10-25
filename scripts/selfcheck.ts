/**
 * Self-check without Electron. Run: npm test
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { parseBridgeError } from '../src/components/AlertBanner'
import {
  webstormConfigDirFromVersion,
} from '../electron/appPaths'
import {
  chooseDiscoveredPeer,
  isIpv4Family,
  livePreferredIps,
  localIpv4Addresses,
  localSubnetHosts,
  LOST_AFTER_MS,
  networkFingerprint,
  orderedDiscoverIps,
  prioritizedHosts,
  pickPreferredPhone,
  preferredIpsFromSettings,
  sameNetwork,
  scanAllHosts,
  shouldDeclareLost,
  subnetHostsFor,
  unfocusedSubnetHosts,
  waitForPhoneRoute,
} from '../electron/discover'
import {
  ALL_APPS,
  INJECT_APPS,
  applyInject,
  buildWebstormXml,
  injectStatus,
  mergeCursorSettings,
  parseFirefoxDefaultProfile,
  readBundleShortVersionSync,
  restoreCursorSettings,
  revertInject,
  stripCodexBlock,
  stripFirefoxBlock,
  upsertCodexBlock,
  upsertFirefoxBlock,
  webstormProxyPathsFromBundles,
} from '../electron/inject'
import type { InjectTarget } from '../electron/inject'
import { ProxyRelay, probePort, probeSocks5 } from '../electron/relay'
import { happCheckFromResult, phoneCheckFromResult, relayCheckFromResult } from '../electron/diagnostics'
import {
  APP_BUNDLE_NAME,
  buildReplaceScript,
  findExtractedApp,
  resolveAppBundlePath,
} from '../electron/macUpdateInstall'
import { httpProxyUrl, presetText } from '../electron/presets'
import {
  normalizeSettings,
  rememberPhoneIp,
  socksAuthFromSettings,
  statusPresentation,
  traySecurityPresentation,
} from '../electron/types'
import {
  isHomeSsid,
  rememberSsidPeer,
  shouldWarnPublicNoAuth,
} from '../electron/wifi'
async function freePorts(count: number): Promise<number[]> {
  const net = await import('node:net')
  const ports: number[] = []
  for (let i = 0; i < count; i++) {
    const server = net.createServer()
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.on('error', reject)
    })
    const addr = server.address()
    ports.push(typeof addr === 'object' && addr ? addr.port : 0)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return ports
}

async function main() {
  // --- Diagnostic mappers ---
  // auth-required → fail + mentions LAN password
  {
    const r = happCheckFromResult('auth-required', '192.168.1.5', 10808, { user: 'u', pass: 'p' }, [])
    assert.equal(r.status, 'fail')
    assert.match(r.detail, /логин\/пароль LAN/)
  }
  // auth-failed → fail
  {
    const r = happCheckFromResult('auth-failed', '192.168.1.5', 10808, { user: 'u', pass: 'bad' }, [])
    assert.equal(r.status, 'fail')
    assert.match(r.detail, /отклонил/)
  }
  // unreachable + scan hits → ok (phone found at new IP)
  {
    const r = happCheckFromResult('unreachable', '192.168.1.5', 10808, null, ['192.168.1.99'])
    assert.equal(r.status, 'ok')
    assert.match(r.detail, /192\.168\.1\.99/)
    assert.match(r.detail, /сменил IP/)
  }
  // unreachable + no scan hits → fail with subnet note
  {
    const r = happCheckFromResult('unreachable', '192.168.1.5', 10808, null, [])
    assert.equal(r.status, 'fail')
    assert.match(r.detail, /подсети/)
  }
  // unreachable + auth set + no scan → fail with auth hint
  {
    const r = happCheckFromResult('unreachable', '192.168.1.5', 10808, { user: 'u', pass: 'p' }, [])
    assert.equal(r.status, 'fail')
    assert.match(r.detail, /пароль/)
  }
  // ok → ok with correct detail
  {
    const r = happCheckFromResult('ok', '192.168.1.5', 10808, { user: 'u', pass: 'p' }, [])
    assert.equal(r.status, 'ok')
    assert.match(r.detail, /логин ок/)
  }
  {
    const r = happCheckFromResult('ok', '192.168.1.5', 10808, null, [])
    assert.equal(r.status, 'ok')
    assert.equal(r.detail.includes('логин'), false)
  }
  // no candidate → fail
  {
    const r = happCheckFromResult(null, null, 10808, null, [])
    assert.equal(r.status, 'fail')
    assert.match(r.detail, /Нечего проверять/)
  }

  // relay: listening + e2e ok → ok
  {
    const r = relayCheckFromResult('ok', 10808, true, true)
    assert.equal(r.status, 'ok')
    assert.match(r.detail, /сквозная проверка/)
  }
  // listening + auth-required → warn
  {
    const r = relayCheckFromResult('auth-required', 10808, true, true)
    assert.equal(r.status, 'warn')
  }
  // listening + auth-failed → fail
  {
    const r = relayCheckFromResult('auth-failed', 10808, true, true)
    assert.equal(r.status, 'fail')
  }
  // listening + unreachable + happ ok → warn (chain broken)
  {
    const r = relayCheckFromResult('unreachable', 10808, true, true)
    assert.equal(r.status, 'warn')
    assert.match(r.detail, /цепочка/)
  }
  // listening + unreachable + happ fail → fail
  {
    const r = relayCheckFromResult('unreachable', 10808, false, true)
    assert.equal(r.status, 'fail')
  }
  // not listening → fail
  {
    const r = relayCheckFromResult(null, 10808, true, false)
    assert.equal(r.status, 'fail')
    assert.match(r.detail, /не запущен/)
  }

  // phone TCP: no address → fail + «Найти телефон»
  {
    const r = phoneCheckFromResult(false, null, 10808)
    assert.equal(r.status, 'fail')
    assert.equal(r.action, 'find')
    assert.match(r.detail, /Найти телефон/)
  }
  // phone TCP: silent address → fail + find action, actionable text
  {
    const r = phoneCheckFromResult(false, '192.168.1.5', 10808)
    assert.equal(r.status, 'fail')
    assert.equal(r.action, 'find')
    assert.match(r.detail, /192\.168\.1\.5:10808/)
    assert.match(r.detail, /LAN/)
  }
  // phone TCP: reachable → ok, no action button
  {
    const r = phoneCheckFromResult(true, '192.168.1.5', 10808)
    assert.equal(r.status, 'ok')
    assert.equal(r.action, undefined)
    assert.match(r.detail, /отвечает/)
  }

  // --- settings normalization ---
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
  assert.ok(statusPresentation('connected', '1.1.1.1').trayTip.includes('1.1.1.1'))
  assert.equal(statusPresentation('unstable', '10.0.0.2').tone, 'yellow')
  assert.match(statusPresentation('unstable', '10.0.0.2').label, /нестабильна/)

  // Grace period: short silence is not LOST; 45s is.
  assert.equal(
    shouldDeclareLost({ firstFailAt: null, now: 100_000, lostAfterMs: LOST_AFTER_MS }),
    false,
  )
  assert.equal(
    shouldDeclareLost({ firstFailAt: 100_000, now: 100_000 + 10_000, lostAfterMs: LOST_AFTER_MS }),
    false,
  )
  assert.equal(
    shouldDeclareLost({ firstFailAt: 100_000, now: 100_000 + LOST_AFTER_MS, lostAfterMs: LOST_AFTER_MS }),
    true,
  )

  // Preferred IPs before stale manualIp so reconnect is not blocked by a dead lease.
  assert.deepEqual(orderedDiscoverIps('192.168.0.208', ['192.168.0.209', '192.168.0.208']), [
    '192.168.0.209',
    '192.168.0.208',
  ])
  assert.deepEqual(orderedDiscoverIps('10.0.0.1', []), ['10.0.0.1'])

  // Fingerprint includes all ifaces so late VPN/utun triggers netPoll.
  assert.equal(
    networkFingerprint(['192.168.0.212', '192.168.172.11']),
    '192.168.0.212,192.168.172.11',
  )
  assert.equal(
    networkFingerprint(['192.168.0.212', '10.0.0.5']),
    '10.0.0.5,192.168.0.212',
  )
  assert.notEqual(
    networkFingerprint(['192.168.0.212']),
    networkFingerprint(['192.168.0.212', '192.168.132.107']),
  )

  // Dual iface: focus recent phone /24, do not scan tether/VPN subnet.
  {
    const locals = [
      { address: '192.168.0.212', maskBits: 24 },
      { address: '192.168.157.182', maskBits: 24 },
    ]
    const focused = localSubnetHosts(locals, ['192.168.0.209', '192.168.0.208'])
    assert.equal(focused.length, 253)
    assert.ok(focused.includes('192.168.0.209'))
    assert.ok(!focused.some((ip) => ip.startsWith('192.168.157.')))

    // Fallback hosts = the iface focus skipped (VPN/tether).
    const skipped = unfocusedSubnetHosts(['192.168.0.209', '192.168.0.208'], locals)
    assert.equal(skipped.length, 253)
    assert.ok(skipped.every((ip) => ip.startsWith('192.168.157.')))
    assert.deepEqual(unfocusedSubnetHosts([], locals), [])
    assert.deepEqual(unfocusedSubnetHosts(['10.0.0.1'], locals), [])
  }

  // waitForPhoneRoute with no preferred peers returns as soon as any IPv4 exists.
  {
    const ips = await waitForPhoneRoute({
      preferredIps: [],
      ipv4TimeoutMs: 2_000,
      routeTimeoutMs: 1_000,
      pollMs: 50,
    })
    assert.ok(Array.isArray(ips))
  }
  assert.equal(
    traySecurityPresentation({
      tip: 'base',
      lanAuthOn: true,
      publicWifiNoAuth: false,
    }).tip,
    'base · LAN auth',
  )
  assert.equal(
    traySecurityPresentation({
      tip: 'base',
      lanAuthOn: false,
      publicWifiNoAuth: true,
    }).menuLabel,
    '⚠ Нет пароля LAN (чужая сеть)',
  )
  assert.equal(isHomeSsid('Cafe', ['Home']), false)
  assert.equal(isHomeSsid('Home', ['Home']), true)
  assert.equal(
    shouldWarnPublicNoAuth({ ssid: 'Cafe', homeSsids: ['Home'], hasAuth: false }),
    true,
  )
  assert.equal(
    shouldWarnPublicNoAuth({ ssid: 'Cafe', homeSsids: ['Home'], hasAuth: true }),
    false,
  )
  assert.equal(
    shouldWarnPublicNoAuth({ ssid: 'Home', homeSsids: ['Home'], hasAuth: false }),
    false,
  )
  assert.equal(
    shouldWarnPublicNoAuth({ ssid: 'Cafe', homeSsids: [], hasAuth: false }),
    true,
  )
  assert.equal(
    httpProxyUrl('127.0.0.1', 10809, { user: 'a@b', pass: 'x y' }),
    'http://a%40b:x%20y@127.0.0.1:10809',
  )
  assert.deepEqual(socksAuthFromSettings(normalizeSettings({})), null)
  assert.deepEqual(
    socksAuthFromSettings(normalizeSettings({ proxyUser: 'bob', proxyPassword: 's3' })),
    { user: 'bob', pass: 's3' },
  )
  assert.equal(normalizeSettings({ proxyUser: '  ' }).proxyUser, null)
  assert.equal(normalizeSettings({ proxyPassword: '' }).proxyPassword, null)
  assert.deepEqual(
    socksAuthFromSettings(normalizeSettings({ proxyPassword: '' })),
    null,
  )
  assert.deepEqual(
    socksAuthFromSettings(normalizeSettings({ proxyPassword: '   ' })),
    { user: '', pass: '   ' },
  )
  assert.ok(
    presetText('socks', 10808, 10809, { user: 'u', pass: 'p' }).includes('u'),
  )

  const withPeer = rememberSsidPeer(
    normalizeSettings({}),
    'HomeWiFi',
    '192.168.1.6',
  )
  assert.equal(withPeer.ssidPeers['HomeWiFi'], '192.168.1.6')
  assert.deepEqual(normalizeSettings({}).homeSsids, [])
  assert.equal(
    normalizeSettings({ homeSsids: [' A ', 'A', ''] }).homeSsids.join(','),
    'A',
  )
  assert.deepEqual(
    preferredIpsFromSettings(
      normalizeSettings({
        lastPhoneIp: '10.0.0.1',
        recentPhoneIps: ['10.0.0.2'],
        ssidPeers: { Cafe: '10.0.0.9' },
      }),
      'Cafe',
    ),
    ['10.0.0.9', '10.0.0.2', '10.0.0.1'],
  )
  assert.equal(
    chooseDiscoveredPeer({
      found: ['10.0.0.2', '10.0.0.5'],
      manualIp: null,
      preferredIps: [],
      currentIp: null,
    }),
    null,
  )
  assert.equal(
    chooseDiscoveredPeer({
      found: ['10.0.0.2', '10.0.0.5'],
      manualIp: null,
      preferredIps: ['10.0.0.5'],
      currentIp: null,
    }),
    '10.0.0.5',
  )
  assert.equal(
    chooseDiscoveredPeer({
      found: ['10.0.0.2'],
      manualIp: null,
      preferredIps: [],
      currentIp: null,
    }),
    '10.0.0.2',
  )
  assert.equal(normalizeSettings({}).enabled, true)
  assert.equal(normalizeSettings({ enabled: false }).enabled, false)
  assert.equal(
    pickPreferredPhone(['10.0.0.2', '10.0.0.5'], '10.0.0.5', ['10.0.0.2']),
    '10.0.0.5',
  )
  assert.equal(
    pickPreferredPhone(['10.0.0.2', '10.0.0.5'], null, ['10.0.0.9', '10.0.0.2']),
    '10.0.0.2',
  )
  assert.equal(pickPreferredPhone(['10.0.0.2'], null, []), null)

  assert.equal(
    parseBridgeError(
      'Порт 10809 уже занят: похоже, запущена другая копия Happ Bridge. Закройте её или смените порт в настройках.',
    ).kind,
    'port-in-use',
  )
  assert.equal(parseBridgeError('Порт 10809 уже занят').title, 'Порт 10809 занят')
  assert.equal(parseBridgeError('что-то сломалось').kind, 'generic')
  assert.equal(
    parseBridgeError('Happ требует логин/пароль LAN. Укажите их в настройках Bridge.').kind,
    'auth',
  )
  assert.notEqual(
    parseBridgeError('Найдено 3 прокси. Выберите телефон в списке.').title,
    'Не удалось подключиться',
  )
  assert.equal(parseBridgeError('Некорректный IP').kind, 'validation')
  assert.equal(
    parseBridgeError(
      'Сеть не отмечена как домашняя и пароль LAN не задан, поэтому автоподключение отключено. Выберите телефон в списке.',
    ).kind,
    'guidance',
  )
  const wakeMsg =
    'Телефон 10.98.147.205 в сети, но Happ не отвечает. Разблокируйте экран и откройте Happ.'
  assert.equal(parseBridgeError(wakeMsg).kind, 'wake-phone')
  assert.equal(parseBridgeError(wakeMsg).title, 'Happ не отвечает на телефоне')
  assert.equal(parseBridgeError(wakeMsg).tone, 'warning')

  // macOS unsigned update: path helpers + replace script (no Squirrel/ShipIt).
  assert.equal(
    resolveAppBundlePath('/Applications/Happ Bridge.app/Contents/MacOS/Happ Bridge'),
    '/Applications/Happ Bridge.app',
  )
  assert.throws(() => resolveAppBundlePath('/usr/local/bin/happ-bridge'), /Не удалось определить/)
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-upd-'))
    const nested = path.join(tmp, 'out', APP_BUNDLE_NAME)
    fs.mkdirSync(nested, { recursive: true })
    assert.equal(findExtractedApp(path.join(tmp, 'out')), nested)
    assert.equal(findExtractedApp(tmp), nested)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  {
    const script = buildReplaceScript({
      pid: 4242,
      zipPath: '/tmp/Happ-Bridge-9.9.9-arm64.zip',
      appPath: '/Applications/Happ Bridge.app',
    })
    assert.match(script, /PID=4242/)
    assert.match(script, /ditto -x -k/)
    assert.match(script, /xattr -cr/)
    assert.match(script, /open "\$APP"/)
    assert.match(script, /Happ Bridge\.app/)
  }

  assert.equal(isIpv4Family('IPv4'), true)
  assert.equal(isIpv4Family(4), true)
  assert.equal(isIpv4Family('IPv6'), false)
  assert.equal(isIpv4Family(6), false)
  assert.deepEqual(
    localIpv4Addresses({
      en0: [
        // Node may report family as numeric 4; cast fixture past the string-literal typedef.
        {
          address: '192.168.1.10',
          netmask: '255.255.255.0',
          family: 4,
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '192.168.1.10/24',
        } as unknown as os.NetworkInterfaceInfo,
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '127.0.0.1/8',
        },
      ],
    }),
    ['192.168.1.10'],
  )
  assert.equal(webstormConfigDirFromVersion('2024.3.1'), 'WebStorm2024.3')
  assert.equal(webstormConfigDirFromVersion('2025.1'), 'WebStorm2025.1')
  assert.equal(webstormConfigDirFromVersion('nope'), null)

  const hosts = localSubnetHosts(['192.168.1.50'])
  assert.ok(hosts.includes('192.168.1.1'))
  assert.equal(hosts.length, 253)

  const prio = prioritizedHosts(new Set(['192.168.1.10']), localSubnetHosts(['192.168.1.50']))
  assert.ok(!prio.includes('192.168.1.10'))
  assert.ok(prio.indexOf('192.168.1.5') < prio.indexOf('192.168.1.200'))

  // livePreferredIps: keeps only preferred IPs sharing a /24 with a live local IP.
  assert.deepEqual(
    livePreferredIps(
      ['192.168.1.5', '10.97.96.84', '192.168.1.9'],
      ['192.168.1.50', '192.168.172.11'],
    ),
    ['192.168.1.5', '192.168.1.9'],
  )
  assert.deepEqual(livePreferredIps([], ['192.168.1.50']), [])
  // Empty local I/F → nothing matches (nothing routable).
  assert.deepEqual(livePreferredIps(['192.168.1.5'], []), [])

  // Netmask-aware discovery: /16 and /23 are honored, not just /24.
  assert.equal(sameNetwork('192.168.7.20', '192.168.5.10', 16), true)
  assert.equal(sameNetwork('192.168.7.20', '192.168.5.10', 24), false)
  assert.equal(sameNetwork('192.168.4.9', '192.168.5.10', 23), true)
  assert.equal(sameNetwork('10.0.2.9', '10.0.0.5', 16), true)
  assert.equal(sameNetwork('10.1.0.9', '10.0.0.5', 16), false)
  // /23 scan covers 510 hosts across both /24 halves.
  const s23 = subnetHostsFor('192.168.5.10', 23)
  assert.equal(s23.length, 510)
  assert.ok(s23.includes('192.168.4.9'))
  assert.ok(s23.includes('192.168.5.9'))
  // /16 sweep is capped back to /24 (sweep DoS guard), never explodes.
  const s16 = localSubnetHosts([{ address: '192.168.5.10', maskBits: 16 }], [])
  assert.ok(s16.length <= 254)
  assert.ok(s16.includes('192.168.5.20'))

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

  // Local HTTP port must tunnel to phone SOCKS port (Happ has no :httpPort).
  {
    const [socks, http] = await freePorts(2)
    const phoneAccepted = new Promise<void>((resolve, reject) => {
      const phone = net.createServer((c) => {
        c.end()
        resolve()
      })
      phone.once('error', reject)
      phone.listen(socks, '::1', () => {
        void (async () => {
          const r = new ProxyRelay({ socksPort: socks, httpPort: http })
          try {
            await r.start('::1')
            const c = net.connect({ host: '127.0.0.1', port: http })
            c.on('error', reject)
            await phoneAccepted
            c.destroy()
            await r.stop()
            await new Promise<void>((res) => phone.close(() => res()))
          } catch (err) {
            await r.stop().catch(() => undefined)
            phone.close()
            reject(err)
          }
        })().catch(reject)
      })
    })
    await Promise.race([
      phoneAccepted,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('HTTP→phone tunnel timed out')), 3_000),
      ),
    ])
  }

  // Unreachable phone: relay must fail the client within connect timeout (~5s), not hang.
  {
    const [socks, http] = await freePorts(2)
    const r = new ProxyRelay({ socksPort: socks, httpPort: http })
    // TEST-NET-1: non-routable; connect hangs until our REMOTE_CONNECT_MS fires.
    await r.start('192.0.2.1')
    const started = Date.now()
    await new Promise<void>((resolve, reject) => {
      const c = net.connect({ host: '127.0.0.1', port: socks })
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => reject(new Error('relay connect timeout too slow')), 8_000)
      c.on('close', done)
      c.on('error', done)
    })
    const elapsed = Date.now() - started
    await r.stop()
    assert.ok(elapsed < 7_000, `expected fail-fast connect, got ${elapsed}ms`)
  }

  // Fail-open: phone target gone ⇒ local port serves SOCKS5 directly over
  // the Mac's own uplink, so clients (CLIs, system proxy) keep working.
  {
    const [socks, http] = await freePorts(2)
    const originSockets = new Set<net.Socket>()
    const origin = net.createServer((s) => {
      originSockets.add(s)
      s.on('close', () => originSockets.delete(s))
      s.end('hello-direct')
    })
    await new Promise<void>((resolve, reject) => {
      origin.once('error', reject)
      origin.listen(0, '127.0.0.1', () => resolve())
    })
    const oport = (origin.address() as { port: number }).port

    const r = new ProxyRelay({ socksPort: socks, httpPort: http })
    await r.start('127.0.0.1')
    r.setPhoneIp(null) // no target ⇒ fail-open mode

    const handshake = (offerAuth: boolean) =>
      new Promise<Buffer>((resolve, reject) => {
        const c = net.connect({ host: '127.0.0.1', port: socks })
        let buf = Buffer.alloc(0)
        let stage: 'greet' | 'auth' | 'sent' = 'greet'
        const timer = setTimeout(() => reject(new Error('fail-open handshake timed out')), 3_000)
        const host = '127.0.0.1'
        const connectReq = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
          Buffer.from(host, 'utf8'),
          Buffer.from([(oport >> 8) & 0xff, oport & 0xff]),
        ])
        c.on('error', (e) => {
          clearTimeout(timer)
          reject(e)
        })
        c.write(offerAuth ? Buffer.from([0x05, 0x01, 0x02]) : Buffer.from([0x05, 0x01, 0x00]))
        c.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk])
          if (stage === 'greet') {
            if (buf.length < 2) return
            const want = offerAuth ? 0x02 : 0x00
            if (buf[0] !== 0x05 || buf[1] !== want) {
              clearTimeout(timer)
              c.destroy()
              reject(new Error(`bad greeting reply: ${[...buf.subarray(0, 2)]}`))
              return
            }
            buf = Buffer.alloc(0)
            if (want === 0x02) {
              stage = 'auth'
              c.write(Buffer.from([0x01, 1, 0x75, 1, 0x70])) // user "u", pass "p"
            } else {
              stage = 'sent'
              c.write(connectReq)
            }
            return
          }
          if (stage === 'auth') {
            if (buf.length < 2) return
            if (buf[1] !== 0x00) {
              clearTimeout(timer)
              c.destroy()
              reject(new Error('fail-open must accept any credentials'))
              return
            }
            buf = Buffer.alloc(0)
            stage = 'sent'
            c.write(connectReq)
            return
          }
        })
        c.on('close', () => {
          clearTimeout(timer)
          resolve(buf)
        })
      })

    for (const offerAuth of [false, true]) {
      const all = await handshake(offerAuth)
      assert.ok(all.length >= 9 && all[1] === 0x00, 'CONNECT reply must be OK (code 0)')
      assert.ok(all.subarray(9).toString('utf8').includes('hello-direct'),
        'fail-open must dial the destination directly')
    }

    // HTTP-proxy CONNECT (native apps such as ChatGPT.app talk this to the
    // system SOCKS port) must tunnel too.
    {
      const c = net.connect({ host: '127.0.0.1', port: socks })
      c.write(
        `CONNECT 127.0.0.1:${oport} HTTP/1.1\r\nHost: 127.0.0.1:${oport}\r\n\r\n`,
      )
      const all = await new Promise<Buffer>((resolve, reject) => {
        let acc = Buffer.alloc(0)
        let requested = false
        const timer = setTimeout(() => reject(new Error('fail-open HTTP CONNECT timed out')), 3_000)
        c.on('error', (e) => {
          clearTimeout(timer)
          reject(e)
        })
        c.on('data', (chunk) => {
          acc = Buffer.concat([acc, chunk])
          if (requested || acc.length < 9) return // wait for the 200 header first
          requested = true
          c.write(`GET / HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n`)
        })
        c.on('close', () => {
          clearTimeout(timer)
          resolve(acc)
        })
      })
      const head = all.subarray(0, all.indexOf('\r\n\r\n') + 4).toString('utf8')
      assert.ok(head.startsWith('HTTP/1.1 200 Connection established'),
        `HTTP CONNECT must get 200, got: ${head}`)
      assert.ok(all.toString('utf8').includes('hello-direct'), 'HTTP CONNECT tunnel must carry data')
    }

    await r.stop()
    for (const s of originSockets) s.destroy()
    await new Promise<void>((res) => origin.close(() => res()))
  }

  const merged = mergeCursorSettings(
    { 'http.proxy': 'http://old:1', theme: 'dark' },
    { socksPort: 10808, httpPort: 10809 },
  )
  assert.equal(merged['http.proxy'], 'socks5://127.0.0.1:10808')
  assert.equal(merged.theme, 'dark')
  const restored = restoreCursorSettings(merged, { 'http.proxy': 'http://old:1' })
  assert.equal(restored['http.proxy'], 'http://old:1')
  assert.equal(restored['http.proxySupport'], undefined)

  const mergedAuth = mergeCursorSettings(
    {},
    { socksPort: 10808, httpPort: 10809, proxyUser: 'u', proxyPassword: 'p' },
  )
  assert.equal(mergedAuth['http.proxy'], 'socks5://u:p@127.0.0.1:10808')

  const xml = buildWebstormXml({ socksPort: 10808, httpPort: 10809 })
  assert.ok(xml.includes('PROXY_HOST" value="127.0.0.1"'))
  assert.ok(xml.includes('PROXY_PORT" value="10808"'))
  assert.ok(!xml.includes('PROXY_LOGIN'))

  const xmlAuth = buildWebstormXml({
    socksPort: 10808,
    httpPort: 10809,
    proxyUser: 'u&x',
    proxyPassword: 'p',
  })
  assert.ok(xmlAuth.includes('PROXY_LOGIN" value="u&amp;x"'))
  assert.ok(xmlAuth.includes('PROXY_PASSWORD" value="p"'))

  const block = upsertFirefoxBlock('user_pref("foo", 1);\n', {
    socksPort: 10808,
    httpPort: 10809,
  })
  assert.ok(block.includes('happ-bridge managed'))
  assert.ok(block.includes('socks_port", 10808'))
  assert.ok(!stripFirefoxBlock(block).includes('happ-bridge'))

  const blockAuth = upsertFirefoxBlock('', {
    socksPort: 10808,
    httpPort: 10809,
    proxyUser: 'ff',
    proxyPassword: 'pw',
  })
  assert.ok(blockAuth.includes('socks_username", "ff"'))
  assert.ok(blockAuth.includes('socks_password", "pw"'))

  // SOCKS5 user/pass probe: open no-auth server must fail when credentials set
  const authPort = await listenSocksAuth('good', 'secret')
  try {
    assert.equal(
      await probeSocks5('127.0.0.1', authPort, 400, undefined, {
        user: 'good',
        pass: 'secret',
      }),
      true,
    )
    assert.equal(
      await probeSocks5('127.0.0.1', authPort, 400, undefined, {
        user: 'good',
        pass: 'wrong',
      }),
      false,
    )
    // Auth-only server rejects no-auth method → 0xff must not count as Happ
    assert.equal(await probeSocks5('127.0.0.1', authPort, 400), false)
  } finally {
    await closeListen(authPort)
  }
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
    assert.equal(cursorAfter['http.proxy'], 'socks5://127.0.0.1:10808')
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

  // Inject: .app present without Application Support still counts as available
  {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-inject-app-'))
    const backup = path.join(home, 'backups.json')
    try {
      fs.mkdirSync(path.join(home, 'Applications', 'Cursor.app', 'Contents'), {
        recursive: true,
      })
      fs.mkdirSync(path.join(home, 'Applications', 'WebStorm.app', 'Contents'), {
        recursive: true,
      })
      fs.writeFileSync(
        path.join(home, 'Applications', 'WebStorm.app', 'Contents', 'Info.plist'),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<plist version="1.0"><dict>',
          '<key>CFBundleShortVersionString</key><string>2024.3.2</string>',
          '</dict></plist>',
        ].join('\n'),
      )
      fs.mkdirSync(path.join(home, 'Applications', 'Firefox.app', 'Contents'), {
        recursive: true,
      })

      const status = injectStatus(home, backup)
      const byId = Object.fromEntries(status.map((s) => [s.id, s]))
      assert.equal(byId.cursor?.available, true)
      assert.match(byId.cursor?.detail ?? '', /создадим при прописке/)
      assert.equal(byId.webstorm?.available, true)
      assert.match(byId.webstorm?.detail ?? '', /создадим при прописке/)
      assert.equal(byId.firefox?.available, true)
      assert.match(byId.firefox?.detail ?? '', /откройте Firefox/)

      const ports = { socksPort: 10808, httpPort: 10809 }
      const cursorOnly = applyInject(['cursor'], ports, home, backup)
      assert.ok(cursorOnly.results[0]?.ok, JSON.stringify(cursorOnly.results))
      const cursorFile = path.join(
        home,
        'Library/Application Support/Cursor/User/settings.json',
      )
      assert.ok(fs.existsSync(cursorFile))
      assert.equal(
        (JSON.parse(fs.readFileSync(cursorFile, 'utf8')) as Record<string, unknown>)[
          'http.proxy'
        ],
        'socks5://127.0.0.1:10808',
      )

      assert.equal(
        readBundleShortVersionSync(
          path.join(home, 'Applications', 'WebStorm.app'),
        ),
        '2024.3.2',
      )
      const wsPaths = webstormProxyPathsFromBundles(home)
      const expectedWs = path.join(
        home,
        'Library/Application Support/JetBrains/WebStorm2024.3/options/proxy.settings.xml',
      )
      // May also include a path derived from /Applications/WebStorm.app on the machine.
      assert.ok(
        wsPaths.includes(expectedWs),
        `expected ${expectedWs} in ${JSON.stringify(wsPaths)}`,
      )
      const wsApply = applyInject(['webstorm'], ports, home, backup)
      assert.ok(wsApply.results[0]?.ok, JSON.stringify(wsApply.results))
      assert.ok(fs.existsSync(expectedWs))

      const ffApply = applyInject(['firefox'], ports, home, backup)
      assert.equal(ffApply.results[0]?.ok, false)
      assert.match(ffApply.results[0]?.message ?? '', /откройте Firefox/i)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  }

  // Inject: unreadable Firefox profiles.ini must not blank Cursor/WebStorm status
  {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-inject-eperm-'))
    try {
      const cursorFile = path.join(
        home,
        'Library/Application Support/Cursor/User/settings.json',
      )
      fs.mkdirSync(path.dirname(cursorFile), { recursive: true })
      fs.writeFileSync(cursorFile, '{}\n')

      const wsFile = path.join(
        home,
        'Library/Application Support/JetBrains/WebStorm2099.1/options/proxy.settings.xml',
      )
      fs.mkdirSync(path.dirname(wsFile), { recursive: true })
      fs.writeFileSync(wsFile, '<application/>\n')

      const ffIni = path.join(home, 'Library/Application Support/Firefox/profiles.ini')
      fs.mkdirSync(path.dirname(ffIni), { recursive: true })
      fs.writeFileSync(ffIni, '[Profile0]\nPath=x\nDefault=1\n')
      fs.chmodSync(ffIni, 0)

      const status = injectStatus(home)
      const byId = Object.fromEntries(status.map((s) => [s.id, s]))
      assert.equal(byId.cursor?.available, true, 'Cursor must stay available')
      assert.equal(byId.webstorm?.available, true, 'WebStorm must stay available')
      // Firefox stays listed if /Applications/Firefox.app exists; detail must not crash status.
      assert.match(byId.firefox?.detail ?? '', /нет доступа|не установлен|откройте Firefox|profiles/i)
      assert.notEqual(byId.cursor?.available, false)

      fs.chmodSync(ffIni, 0o644)
    } finally {
      try {
        fs.chmodSync(
          path.join(home, 'Library/Application Support/Firefox/profiles.ini'),
          0o644,
        )
      } catch {
        // already restored / missing
      }
      fs.rmSync(home, { recursive: true, force: true })
    }
  }

  // CLI / Терминал: env-блок в shell-rc. Полный round-trip apply → revert
  // (детерминированный: бинарник codex не требуется, apply создаёт файл сам)
  // + чистые функции upsert/strip.
  {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-inject-cli-'))
    try {
      const bashProfile = path.join(home, '.bash_profile')
      fs.writeFileSync(bashProfile, 'export EDITOR=vi\n')
      const backupPath = path.join(home, 'backups.json')
      const ports = { socksPort: 10808, httpPort: 10809 }

      const applied = applyInject(['codex'], ports, home, backupPath)
      const a = applied.results[0] as { ok: boolean; message: string } | undefined
      assert.equal(a?.ok, true, a?.message ?? 'apply failed')
      const written = fs.readFileSync(bashProfile, 'utf8')
      assert.ok(written.includes('BEGIN happ-bridge managed'))
      assert.ok(written.includes("ALL_PROXY='socks5://127.0.0.1:10808'"))
      assert.ok(written.includes("NO_PROXY='localhost,127.0.0.1'"))
      assert.ok(written.includes('export EDITOR=vi'), 'unrelated line must stay')

      const reverted = revertInject(['codex'], ports, home, backupPath)
      const r = reverted.results[0] as { ok: boolean; message: string } | undefined
      assert.equal(r?.ok, true, r?.message ?? 'revert failed')
      assert.equal(fs.readFileSync(bashProfile, 'utf8'), 'export EDITOR=vi\n')

      // Файла не было → revert удаляет созданный
      const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-inject-cli2-'))
      try {
        const noFile = applyInject(['codex'], ports, freshHome, path.join(freshHome, 'b.json'))
        assert.equal(
          (noFile.results[0] as { ok: boolean }).ok,
          true,
          'apply must create missing rc file',
        )
        const noFileRevert = revertInject(['codex'], ports, freshHome, path.join(freshHome, 'b.json'))
        assert.equal(
          (noFileRevert.results[0] as { ok: boolean }).ok,
          true,
        )
        assert.equal(fs.existsSync(path.join(freshHome, '.bash_profile')), false)
      } finally {
        fs.rmSync(freshHome, { recursive: true, force: true })
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  }
  {
    const ports = { socksPort: 10808, httpPort: 10809 }
    const original = 'export EDITOR=vi\n'

    const upserted = upsertCodexBlock(original, ports)
    assert.ok(upserted.includes('BEGIN happ-bridge managed'))
    assert.ok(upserted.includes("ALL_PROXY='socks5://127.0.0.1:10808'"))
    assert.ok(
      upserted.includes(`if (exec 3<>/dev/tcp/127.0.0.1/${ports.socksPort}) 2>/dev/null; then`),
      'прокси включается только при живом порте — CLI не получает мёртвый адрес',
    )
    assert.ok(upserted.includes('\nfi\n'), 'блок закрыт fi')
    assert.ok(upserted.includes("NO_PROXY='localhost,127.0.0.1'"))
    assert.ok(upserted.includes('export EDITOR=vi'), 'unrelated line must stay')

    // Идемпотентность: повторный upsert не дублирует блок
    assert.equal(upsertCodexBlock(upserted, ports), upserted, 'upsert must be idempotent')

    // Strip возвращает оригинал
    assert.equal(stripCodexBlock(upserted), original, 'strip must restore original')

    // Пустой файл: round-trip только блока
    const empty = upsertCodexBlock('', ports)
    assert.ok(empty.startsWith('#'))
    assert.equal(stripCodexBlock(empty), '')

    // Без блока — контент не трогается
    assert.equal(stripCodexBlock(original), original)

    // С авторизацией: креды попадают в URL
    const authed = upsertCodexBlock(original, {
      socksPort: 10808,
      httpPort: 10809,
      proxyUser: 'u',
      proxyPassword: 'p',
    })
    assert.ok(authed.includes("ALL_PROXY='socks5://u:p@127.0.0.1:10808'"))
    assert.equal(stripCodexBlock(authed), original)
  }

  // Guard: прокси реально включается только пока порт слушает (иначе CLI
  // получал бы мёртвый адрес — это и ломало codex после выхода из моста).
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-guard-'))
    const rc = path.join(dir, 'rc')
    const [port] = await freePorts(1)
    fs.writeFileSync(rc, upsertCodexBlock('', { socksPort: port, httpPort: port + 1 }), 'utf8')

    const readEnv = (): string =>
      execFileSync('bash', ['-c', '. "$1"; printf %s "${ALL_PROXY:-none}"', '_', rc], {
        encoding: 'utf8',
      })

    assert.equal(readEnv(), 'none', 'порт закрыт ⇒ прокси не экспортируется')

    const srv = net.createServer((s) => s.end())
    await new Promise<void>((resolve) => srv.listen(port, '127.0.0.1', () => resolve()))
    try {
      assert.equal(
        readEnv(),
        `socks5://127.0.0.1:${port}`,
        'порт слушает ⇒ прокси экспортируется',
      )
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
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

  // Реестр приложений: инварианты
  {
    // Каждый id в InjectTarget зарегистрирован ровно один раз, и наоборот.
    assert.deepEqual(
      ALL_APPS.map((a) => a.id).sort(),
      (Object.keys(INJECT_APPS) as InjectTarget[]).sort(),
    )
    const known: InjectTarget[] = ['cursor', 'webstorm', 'firefox', 'codex']
    assert.deepEqual(
      ALL_APPS.map((a) => a.id).sort(),
      known.slice().sort(),
      'реестр покрывает все InjectTarget',
    )

    // label совпадает с object-меткой панели (см. InjectAppsPanel targetMeta)
    assert.equal(INJECT_APPS.codex.label, 'CLI / Терминал')
    assert.equal(INJECT_APPS.cursor.label, 'Cursor')

    // Только CLI не подлежит перезапуску GUI.
    for (const app of ALL_APPS) {
      const isCli = app.id === 'codex'
      assert.equal(
        app.relaunchable,
        !isCli,
        `${app.id}: relaunchable признак CLI неверен`,
      )
    }
  }

  console.log('selfcheck ok')
}

const authServers = new Map<number, net.Server>()

/** Minimal SOCKS5 that requires username/password. */
function listenSocksAuth(user: string, pass: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buf = Buffer.alloc(0)
      let phase: 'greet' | 'auth' = 'greet'
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk])
        if (phase === 'greet') {
          if (buf.length < 2) return
          const nmethods = buf[1]
          if (buf.length < 2 + nmethods) return
          const methods = [...buf.subarray(2, 2 + nmethods)]
          buf = Buffer.alloc(0)
          if (methods.includes(0x02)) {
            socket.write(Buffer.from([0x05, 0x02]))
            phase = 'auth'
          } else {
            socket.write(Buffer.from([0x05, 0xff]))
            socket.end()
          }
          return
        }
        if (buf.length < 2) return
        const ulen = buf[1]
        if (buf.length < 2 + ulen + 1) return
        const plen = buf[2 + ulen]
        if (buf.length < 2 + ulen + 1 + plen) return
        const u = buf.subarray(2, 2 + ulen).toString('utf8')
        const p = buf.subarray(3 + ulen, 3 + ulen + plen).toString('utf8')
        const ok = u === user && p === pass
        socket.write(Buffer.from([0x01, ok ? 0x00 : 0x01]))
        socket.end()
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'))
        return
      }
      authServers.set(addr.port, server)
      resolve(addr.port)
    })
    server.on('error', reject)
  })
}

function closeListen(port: number): Promise<void> {
  const server = authServers.get(port)
  authServers.delete(port)
  if (!server) return Promise.resolve()
  return new Promise((resolve) => server.close(() => resolve()))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
