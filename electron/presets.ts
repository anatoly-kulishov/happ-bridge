export type CopyPreset = 'socks' | 'http' | 'telegram' | 'cursor'

export type PresetAuth = { user: string; pass: string } | null | undefined

export function socksProxyUrl(
  host: string,
  port: number,
  auth?: PresetAuth,
): string {
  if (auth) {
    return `socks5://${encodeURIComponent(auth.user)}:${encodeURIComponent(auth.pass)}@${host}:${port}`
  }
  return `socks5://${host}:${port}`
}

export function httpProxyUrl(
  host: string,
  port: number,
  auth?: PresetAuth,
): string {
  if (auth) {
    return `http://${encodeURIComponent(auth.user)}:${encodeURIComponent(auth.pass)}@${host}:${port}`
  }
  return `http://${host}:${port}`
}

export function presetText(
  kind: CopyPreset,
  socksPort: number,
  _httpPort: number,
  auth?: PresetAuth,
): string {
  switch (kind) {
    case 'socks':
      return auth
        ? socksProxyUrl('127.0.0.1', socksPort, auth)
        : `127.0.0.1:${socksPort}`
    case 'http':
      // Local HTTP listener tunnels to Happ SOCKS — same port apps must use.
      return auth
        ? socksProxyUrl('127.0.0.1', socksPort, auth)
        : `127.0.0.1:${socksPort}`
    case 'telegram':
      return [
        'Telegram → Настройки → Данные и память → Прокси → Добавить прокси',
        'Тип: SOCKS5',
        'Сервер: 127.0.0.1',
        `Порт: ${socksPort}`,
        auth
          ? `Логин: ${auth.user}\nПароль: ${auth.pass}`
          : 'Логин / пароль: пусто (или как в Happ LAN)',
      ].join('\n')
    case 'cursor':
      return [
        'Cursor / VS Code → Settings → http.proxy',
        `URL: ${socksProxyUrl('127.0.0.1', socksPort, auth)}`,
        '',
        'WebStorm / Firefox / Telegram: SOCKS5 127.0.0.1',
        `Port: ${socksPort}`,
        ...(auth ? [`Логин: ${auth.user}`, `Пароль: ${auth.pass}`] : []),
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
