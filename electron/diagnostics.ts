import { discoverPhones, localIpv4Addresses } from './discover'
import { checkProxyAuth, probePort, type ProxyAuthCheck, type ProxyRelay } from './relay'
import type { DiagnosticAction } from './types'
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
      detail: `Порт ${port} слушает, но телефон требует логин/пароль LAN (см. «Happ (SOCKS5)»).`,
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

export function phoneCheckFromResult(
  tcpOk: boolean,
  candidate: string | null,
  port: number,
): { status: DiagnosticStatus; detail: string; action?: DiagnosticAction } {
  if (!candidate) {
    return {
      status: 'fail',
      detail: 'Адрес телефона неизвестен. Нажмите «Найти телефон» — мост просканирует подсеть.',
      action: 'find',
    }
  }
  if (tcpOk) {
    return {
      status: 'ok',
      detail: `TCP ${candidate}:${port} отвечает — телефон в этой сети и порт открыт`,
    }
  }
  return {
    status: 'fail',
    detail: `Нет TCP-ответа от ${candidate}:${port}. Телефон в другой сети/VPN, либо Happ не разрешает LAN-подключения.`,
    action: 'find',
  }
}

export async function runDiagnostics(opts: {
  settings: AppSettings
  phoneIp: string | null
  relay: ProxyRelay
  wifiSsid: string | null
  isHomeNetwork: boolean
}): Promise<DiagnosticCheck[]> {
  const { settings, phoneIp, relay, wifiSsid, isHomeNetwork } = opts
  const locals = localIpv4Addresses()
  const checks: DiagnosticCheck[] = []
  const auth = socksAuthFromSettings(settings)

  // Chain goes from nearest to farthest: local ports → CLI → GUI apps →
  // network → phone TCP → Happ SOCKS5 → end-to-end. A failure early in the
  // chain explains the ones after it, so each detail says what to do next.

  // 1. Local ports — CLIs/apps point here; down ⇒ ECONNREFUSED everywhere.
  const listening = relay.isListening()
  checks.push({
    id: 'ports',
    status: listening ? 'ok' : 'fail',
    label: 'Локальные порты',
    detail: listening
      ? `SOCKS 127.0.0.1:${settings.socksPort} · HTTP 127.0.0.1:${settings.httpPort} слушают`
      : 'Порты не слушают — терминал и приложения с прокси на 127.0.0.1 получат отказ. Перезапустите Happ Bridge.',
    action: listening ? undefined : 'retry',
  })

  // 2/3. Injection registry (dynamic import keeps inject.ts out of cold chunk).
  const { injectStatus } = await import('./inject')
  const infos = injectStatus()
  const cli = infos.find((t) => t.id === 'codex')
  if (cli) {
    checks.push({
      id: 'cli',
      status: cli.applied ? 'ok' : 'warn',
      label: 'Codex CLI',
      detail: cli.applied
        ? `Обёртка codex() в ~/.bash_profile: codex ходит через мост (socks5://127.0.0.1:${settings.socksPort}), остальные CLI — напрямую`
        : 'Не прописан — codex ходит напрямую. В карточке «Codex CLI» нажмите «Прописать», затем откройте новый терминал.',
    })
  }

  const guiApps = infos.filter((t) => t.id !== 'codex')
  const applied = guiApps.filter((t) => t.applied)
  const notApplied = guiApps.filter((t) => t.available && !t.applied)
  checks.push({
    id: 'apps',
    status: applied.length > 0 ? 'ok' : 'warn',
    label: 'Приложения',
    detail:
      applied.length > 0
        ? `Прописано: ${applied.map((t) => t.label).join(', ')}${
            notApplied.length > 0 ? ` · не прописано: ${notApplied.map((t) => t.label).join(', ')}` : ''
          }`
        : 'Не прописано ни одно приложение. В карточке «Приложения» нажмите «Прописать» у нужного — иначе оно ходит напрямую.',
  })

  // 4. Network — no local IP means nothing further can work.
  const netParts = locals.length > 0 ? [`Mac в сети: ${locals.join(', ')}`] : []
  if (wifiSsid) netParts.push(`Wi‑Fi: ${wifiSsid}`)
  if (locals.length > 0) netParts.push(isHomeNetwork ? 'домашняя сеть' : 'сеть не отмечена домашней')
  checks.push({
    id: 'network',
    status: locals.length > 0 ? 'ok' : 'fail',
    label: 'Wi‑Fi / сеть',
    detail:
      locals.length > 0
        ? netParts.join(' · ')
        : 'Нет локального IP. Подключите Mac к той же сети, что и телефон (или к VPN, где он), подождите 10–15 сек и нажмите «Повторить».',
    action: locals.length > 0 ? undefined : 'retry',
  })

  // 5. Phone TCP — separates "not in this network" from "Happ is silent".
  const candidate =
    settings.manualIp || phoneIp || settings.lastPhoneIp || settings.recentPhoneIps[0] || null
  const tcpOk = candidate
    ? await probePort(candidate, settings.socksPort, 1_000)
    : false
  const phone = phoneCheckFromResult(tcpOk, candidate, settings.socksPort)
  checks.push({
    id: 'phone',
    status: phone.status,
    label: 'Телефон (TCP)',
    detail: phone.detail,
    action: phone.action,
  })

  // 6. Happ SOCKS5 — TCP up but no SOCKS reply ⇒ app asleep/locked.
  let scanHits: string[] = []
  const happResult: ProxyAuthCheck | null =
    candidate && tcpOk ? await checkProxyAuth(candidate, settings.socksPort, AUTH_PROBE_MS, auth) : null
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
  const happAsleep = Boolean(candidate) && tcpOk && happResult === 'unreachable'
  if (candidate && !tcpOk) {
    // Root cause is one line up — do not repeat it as a second red row.
    checks.push({
      id: 'happ',
      status: 'warn',
      label: 'Happ (SOCKS5)',
      detail: 'Проверка не запускалась: телефон не отвечает по TCP (см. строку «Телефон (TCP)» выше).',
    })
  } else {
    checks.push({
      id: 'happ',
      status: happ.status,
      label: 'Happ (SOCKS5)',
      detail: happAsleep
        ? `Телефон отвечает по TCP, но Happ молчит на ${candidate}:${settings.socksPort}. Обычно он спит: разблокируйте телефон, откройте Happ и нажмите «Повторить».`
        : happ.detail,
      action: happ.status === 'fail' ? 'retry' : undefined,
    })
  }

  // 7. End-to-end through the local port — proves the whole chain.
  const relayResult: ProxyAuthCheck | null =
    listening && relay.targetIp
      ? await checkProxyAuth('127.0.0.1', settings.socksPort, RELAY_PROBE_MS, auth)
      : null
  const relayChk = relayCheckFromResult(relayResult, settings.socksPort, happ.status === 'ok', listening)
  checks.push({
    id: 'relay',
    status: listening && !relay.targetIp ? 'warn' : relayChk.status,
    label: 'Сквозная проверка',
    detail:
      listening && !relay.targetIp
        ? 'Телефон не подключён — порт работает в режиме fail-open: трафик приложений идёт напрямую через Mac, а не через телефон.'
        : relayChk.detail,
    action: relayChk.status === 'fail' && listening ? 'retry' : undefined,
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
