import { discoverPhones, localIpv4Addresses } from './discover'
import { checkProxyAuth, type ProxyAuthCheck, type ProxyRelay } from './relay'
import type { AppSettings, DiagnosticCheck } from './types'
import { socksAuthFromSettings } from './types'

const AUTH_PROBE_MS = 1200
const RELAY_PROBE_MS = 1500

export async function runDiagnostics(opts: {
  settings: AppSettings
  phoneIp: string | null
  relay: ProxyRelay
  statusConnected: boolean
}): Promise<DiagnosticCheck[]> {
  const { settings, phoneIp, relay, statusConnected } = opts
  const locals = localIpv4Addresses()
  const checks: DiagnosticCheck[] = []
  const auth = socksAuthFromSettings(settings)

  checks.push({
    id: 'wifi',
    ok: locals.length > 0,
    label: 'Wi‑Fi / локальная сеть',
    detail:
      locals.length > 0
        ? `Компьютер в сети: ${locals.join(', ')}`
        : 'Нет локального IP. Подключитесь к Wi‑Fi.',
  })

  const candidate =
    settings.manualIp || phoneIp || settings.lastPhoneIp || settings.recentPhoneIps[0] || null

  // Direct probe of the configured candidate: distinguishes timeout / auth-required /
  // auth-failed / reachable, mirroring what the bridge itself experiences on connect.
  const happResult: ProxyAuthCheck | null = candidate
    ? await checkProxyAuth(candidate, settings.socksPort, AUTH_PROBE_MS, auth)
    : null

  // If the candidate is unreachable (not an auth problem) and the LAN is up, run a
  // quick subnet scan to see whether the phone simply changed its IP. Worst case ~2-3s.
  let scanHits: string[] = []
  if (happResult === 'unreachable' && locals.length > 0) {
    scanHits = await discoverPhones({
      socksPort: settings.socksPort,
      preferredIps: candidatesFromSettings(settings).filter((ip) => ip !== candidate),
      scanSubnet: true,
      concurrency: 64,
      timeoutMs: 400,
      auth,
    })
  }

  let happOk = happResult === 'ok'
  let happDetail = 'Нечего проверять: сначала найдите телефон.'
  if (happResult === 'ok') {
    happDetail = auth
      ? `Happ отвечает на ${candidate}:${settings.socksPort} (логин ок)`
      : `Happ отвечает на ${candidate}:${settings.socksPort}`
  } else if (happResult === 'auth-required') {
    happDetail =
      `Happ требует логин/пароль LAN на ${candidate}. Укажите их в «Безопасность и сеть» ` +
      '(логин/пароль из Happ) - без них мост не подключится.'
  } else if (happResult === 'auth-failed') {
    happDetail =
      `Happ на ${candidate} отклонил логин/пароль. Проверьте учётные данные LAN в «Безопасность и сеть».`
  } else if (happResult === 'unreachable') {
    const live = scanHits.filter((ip) => ip !== candidate)
    if (live.length > 0) {
      happOk = true
      happDetail =
        `Настроенный адрес ${candidate} не отвечает, но Happ найден в сети: ${live.join(', ')}. ` +
        'Телефон, видимо, сменил IP - нажмите «Найти снова» или выберите адрес в списке.'
    } else {
      happDetail =
        (auth
          ? `Нет ответа / неверный логин на ${candidate}:${settings.socksPort}. Проверьте Happ, LAN и пароль.`
          : `Нет ответа на ${candidate}:${settings.socksPort}. Включите Happ и «Разрешить LAN».`) +
        (scanHits.length === 0
          ? ' Happ не найден во всей подсети.'
          : ` Других открытых SOCKS в подсети не найдено.`)
    }
  }

  checks.push({
    id: 'happ',
    ok: happOk,
    label: 'Happ на телефоне',
    detail: happDetail,
  })

  // After macOS upgrades TCC often resets Local Network; denial looks like "no phone".
  const lanUpButUnreachable = locals.length > 0 && Boolean(candidate) && !happOk
  checks.push({
    id: 'local-network',
    ok: !lanUpButUnreachable,
    label: 'Доступ к локальной сети',
    detail: lanUpButUnreachable
      ? 'Есть Wi‑Fi IP, но телефон не отвечает. После обновления macOS проверьте: Системные настройки → Конфиденциальность и безопасность → Локальная сеть → Happ Bridge (вкл.). Также тумблер «Разрешить LAN подключение» в Happ.'
      : locals.length === 0
        ? 'Сначала подключитесь к Wi‑Fi.'
        : happOk
          ? 'Локальная сеть доступна — Happ отвечает.'
          : 'Когда телефон найден хотя бы раз, здесь появится подсказка при сбоях доступа.',
  })

  checks.push({
    id: 'auth',
    ok: true,
    label: 'Пароль LAN',
    detail: auth
      ? `Логин «${auth.user || '(пусто)'}» задан — подмена без пароля отсекается`
      : 'Не задан. В Happ можно включить логин/пароль для LAN, затем указать их здесь.',
  })

  const listening = relay.isListening()
  // End-to-end probe through the local relay: greeting is piped to the phone, so a
  // success proves the whole chain (local port → relay → phone SOCKS → auth).
  const relayResult: ProxyAuthCheck | null =
    listening && Boolean(relay.targetIp)
      ? await checkProxyAuth('127.0.0.1', settings.socksPort, RELAY_PROBE_MS, auth)
      : null

  let relayOk = false
  let relayDetail = 'Локальный relay не запущен. Нажмите «Найти снова».'
  if (!listening) {
    relayDetail = 'Локальный relay не запущен. Нажмите «Найти снова».'
  } else if (relayResult === 'ok') {
    relayOk = true
    relayDetail = `Мост работает: сквозная проверка 127.0.0.1:${settings.socksPort} прошла`
  } else if (relayResult === 'auth-required') {
    relayDetail = `Порт ${settings.socksPort} слушает, но телефон требует логин/пароль LAN (см. проверку «Пароль LAN»).`
  } else if (relayResult === 'auth-failed') {
    relayDetail = `Порт ${settings.socksPort} слушает, но телефон отклонил логин/пароль LAN.`
  } else {
    relayDetail = happOk
      ? `Порт ${settings.socksPort} слушает, но цепочка до телефона оборвана. Нажмите «Найти снова», чтобы переподключить мост.`
      : `Порт ${settings.socksPort} слушает, но телефон не подключён. Сначала найдите телефон.`
  }
  checks.push({
    id: 'relay',
    ok: relayOk,
    label: 'Локальный мост',
    detail: relayDetail,
  })

  checks.push({
    id: 'bridge',
    ok: statusConnected && Boolean(phoneIp),
    label: 'Статус моста',
    detail:
      statusConnected && phoneIp
        ? `Подключено к ${phoneIp}`
        : 'Мост не подключён к телефону.',
  })

  return checks
}

function candidatesFromSettings(settings: AppSettings): string[] {
  const ips: string[] = []
  const push = (ip: string | null | undefined) => {
    if (ip && !ips.includes(ip)) ips.push(ip)
  }
  push(settings.manualIp)
  push(settings.lastPhoneIp)
  for (const ip of settings.recentPhoneIps) push(ip)
  return ips
}