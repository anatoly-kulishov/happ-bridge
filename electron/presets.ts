export type CopyPreset = 'socks' | 'http' | 'telegram' | 'cursor'

export type PresetAuth = { user: string; pass: string } | null | undefined

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
  httpPort: number,
  auth?: PresetAuth,
): string {
  switch (kind) {
    case 'socks':
      return auth
        ? `socks5://${encodeURIComponent(auth.user)}:${encodeURIComponent(auth.pass)}@127.0.0.1:${socksPort}`
        : `127.0.0.1:${socksPort}`
    case 'http':
      return auth
        ? httpProxyUrl('127.0.0.1', httpPort, auth)
        : `127.0.0.1:${httpPort}`
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
        'Cursor / VS Code / WebStorm → HTTP Proxy',
        auth
          ? `URL: ${httpProxyUrl('127.0.0.1', httpPort, auth)}`
          : `Host: 127.0.0.1\nPort: ${httpPort}`,
        'Или SOCKS5:',
        'Host: 127.0.0.1',
        `Port: ${socksPort}`,
        ...(auth ? [`Логин: ${auth.user}`, `Пароль: ${auth.pass}`] : []),
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
