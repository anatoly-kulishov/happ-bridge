import { discoverPhones, localIpv4Addresses } from './discover'
import { checkProxyAuth, type ProxyAuthCheck, type ProxyRelay } from './relay'
import { injectStatus } from './inject'
import type { AppSettings, DiagnosticCheck, DiagnosticStatus } from './types'
import { socksAuthFromSettings } from './types'

const AUTH_PROBE_MS = 1200
const RELAY_PROBE_MS = 1500

export function happCheckFromResult(
  result: ProxyAuthCheck | null,
  candidate: string | null,
  port: number,
  auth: { user: string; pass: string } | null,
  scanHits: string[],
): { status: DiagnosticStatus; detail: string } {
  if (!candidate) return { status: 'fail', detail: 'Нечего проверять: сначала найдите телефон.' }
  if (result === 'ok') {
    return {
      status: 'ok',
      detail: auth
        ? `Happ отвечает на ${candidate}:${port} (логин ок)`
        : `Happ отвечает на ${candidate}:${port}`,
    }
  }
  if (result === 'auth-required') {
    return {
      status: 'fail',
      detail:
        `Happ требует логин/пароль LAN на ${candidate}. Укажите их в «Безопасность и сеть» ` +
        '(логин/пароль из Happ) - без них мост не подключится.',
    }
  }
  if (result === 'auth-failed') {
    return {
      status: 'fail',
      detail: `Happ на ${candidate} отклонил логин/пароль. Проверьте учётные данные LAN в «Безопасность и сеть».`,
    }
  }
  // unreachable
  const live = scanHits.filter((ip) => ip !== candidate)
  if (live.length > 0) {
    return {
      status: 'ok',
      detail:
        `Настроенный адрес ${candidate} не отвечает, но Happ найден в сети: ${live.join(', ')}. ` +
        'Телефон, видимо, сменил IP - нажмите «Найти снова» или выберите адрес в списке.',
    }
  }
  return {
    status: 'fail',
    detail:
      (auth
        ? `Нет ответа / неверный логин на ${candidate}:${port}. Проверьте Happ, LAN и пароль.`
        : `Нет ответа на ${candidate}:${port}. Включите Happ и «Разрешить LAN».`) +
      (scanHits.length === 0
        ? ' Happ не найден во всей подсети.'
        : ` Других открытых SOCKS в подсети не найдено.`),
  }
}

export function relayCheckFromResult(
  result: ProxyAuthCheck | null,
  port: number,
  happOk: boolean,
  listening: boolean,
): { status: DiagnosticStatus; detail: string } {
  if (!listening) {
    return { status: 'fail', detail: 'Локальный relay не запущен. Нажмите «Найти снова».' }
  }
  if (result === 'ok') {
    return { status: 'ok', detail: `Мост работает: сквозная проверка 127.0.0.1:${port} прошла` }
  }
  if (result === 'auth-required') {
    return {
      status: 'warn',
      detail: `Порт ${port} слушает, но телефон требует логин/пароль LAN (см. проверку «Пароль LAN»).`,
    }
  }
  if (result === 'auth-failed') {
    return {
      status: 'fail',
      detail: `Порт ${port} слушает, но телефон отклонил логин/пароль LAN.`,
    }
  }
  return {
    status: happOk ? 'warn' : 'fail',
    detail: happOk
      ? `Порт ${port} слушает, но цепочка до телефона оборвана. Нажмите «Найти снова», чтобы переподключить мост.`
      : `Порт ${port} слушает, но телефон не подключён. Сначала найдите телефон.`,
  }
}

export async function runDiagnostics(opts: {
  settings: AppSettings
  phoneIp: string | null
  relay: ProxyRelay
  statusConnected: boolean
  wifiSsid: string | null
  isHomeNetwork: boolean
}): Promise<DiagnosticCheck[]> {
  const { settings, phoneIp, relay, statusConnected } = opts
  const locals = localIpv4Addresses()
  const checks: DiagnosticCheck[] = []
  const auth = socksAuthFromSettings(settings)

  checks.push({
    id: 'wifi',
    status: locals.length > 0 ? 'ok' : 'fail',
    label: 'Wi‑Fi / локальная сеть',
    detail:
      locals.length > 0
        ? `Компьютер в сети: ${locals.join(', ')}`
        : 'Нет локального IP. Подключитесь к Wi‑Fi.',
  })

  const candidate =
    settings.manualIp || phoneIp || settings.lastPhoneIp || settings.recentPhoneIps[0] || null

  const happResult: ProxyAuthCheck | null = candidate
    ? await checkProxyAuth(candidate, settings.socksPort, AUTH_PROBE_MS, auth)
    : null

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

  const happ = happCheckFromResult(happResult, candidate, settings.socksPort, auth, scanHits)
  checks.push({ id: 'happ', status: happ.status, label: 'Happ на телефоне', detail: happ.detail })

  const lanUpButUnreachable = locals.length > 0 && Boolean(candidate) && happ.status === 'fail'
  checks.push({
    id: 'local-network',
    status: !lanUpButUnreachable ? 'ok' : 'fail',
    label: 'Доступ к локальной сети',
    detail: lanUpButUnreachable
      ? 'Есть Wi‑Fi IP, но телефон не отвечает. После обновления macOS проверьте: Системные настройки → Конфиденциальность и безопасность → Локальная сеть → Happ Bridge (вкл.). Также тумблер «Разрешить LAN подключение» в Happ.'
      : locals.length === 0
        ? 'Сначала подключитесь к Wi‑Fi.'
        : happ.status === 'ok'
          ? 'Локальная сеть доступна — Happ отвечает.'
          : 'Когда телефон найден хотя бы раз, здесь появится подсказка при сбоях доступа.',
  })

  checks.push({
    id: 'auth',
    status: 'ok',
    label: 'Пароль LAN',
    detail: auth
      ? `Логин «${auth.user || '(пусто)'}» задан — подмена без пароля отсекается`
      : 'Не задан. В Happ можно включить логин/пароль для LAN, затем указать их здесь.',
  })

  const listening = relay.isListening()
  const relayResult: ProxyAuthCheck | null =
    listening && Boolean(relay.targetIp)
      ? await checkProxyAuth('127.0.0.1', settings.socksPort, RELAY_PROBE_MS, auth)
      : null

  const relayChk = relayCheckFromResult(relayResult, settings.socksPort, happ.status === 'ok', listening)
  checks.push({ id: 'relay', status: relayChk.status, label: 'Локальный мост', detail: relayChk.detail })

  checks.push({
    id: 'bridge',
    status: statusConnected && Boolean(phoneIp) ? 'ok' : 'fail',
    label: 'Статус моста',
    detail:
      statusConnected && phoneIp
        ? `Подключено к ${phoneIp}`
        : 'Мост не подключён к телефону.',
  })

  // Inject status
  const injectInfos = injectStatus()
  const injected = injectInfos.filter((t) => t.applied)
  const notInjected = injectInfos.filter((t) => t.available && !t.applied)
  const injectParts: string[] = []
  if (injected.length > 0) injectParts.push(`прописано: ${injected.map((t) => t.label).join(', ')}`)
  if (notInjected.length > 0) injectParts.push(`не прописано: ${notInjected.map((t) => t.label).join(', ')}`)
  checks.push({
    id: 'inject',
    status: injected.length > 0 ? 'ok' : 'warn',
    label: 'Прописка в приложения',
    detail: injectParts.length > 0 ? injectParts.join(' · ') : 'нет доступных приложений',
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
