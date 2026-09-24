import { localIpv4Addresses } from './discover'
import { ProxyRelay, probeSocks5 } from './relay'
import type { AppSettings, DiagnosticCheck } from './types'
import { socksAuthFromSettings } from './types'

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

  let happOk = false
  let happDetail = 'Нечего проверять: сначала найдите телефон.'
  if (candidate) {
    happOk = await probeSocks5(candidate, settings.socksPort, 600, undefined, auth)
    if (happOk) {
      happDetail = auth
        ? `Happ отвечает на ${candidate}:${settings.socksPort} (логин ок)`
        : `Happ отвечает на ${candidate}:${settings.socksPort}`
    } else {
      happDetail = auth
        ? `Нет ответа / неверный логин на ${candidate}:${settings.socksPort}. Проверьте Happ, LAN и пароль.`
        : `Нет ответа на ${candidate}:${settings.socksPort}. Включите Happ и «Разрешить LAN».`
    }
  }

  checks.push({
    id: 'happ',
    ok: happOk,
    label: 'Happ на телефоне',
    detail: happDetail,
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
  checks.push({
    id: 'relay',
    ok: listening,
    label: 'Локальный мост',
    detail: listening
      ? `Слушает 127.0.0.1:${settings.socksPort} и :${settings.httpPort}`
      : 'Локальный relay не запущен. Нажмите «Найти снова».',
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
