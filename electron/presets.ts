export type CopyPreset = 'socks' | 'http' | 'telegram' | 'cursor'

export function presetText(
  kind: CopyPreset,
  socksPort: number,
  httpPort: number,
): string {
  switch (kind) {
    case 'socks':
      return `127.0.0.1:${socksPort}`
    case 'http':
      return `127.0.0.1:${httpPort}`
    case 'telegram':
      return [
        'Telegram → Настройки → Данные и память → Прокси → Добавить прокси',
        'Тип: SOCKS5',
        'Сервер: 127.0.0.1',
        `Порт: ${socksPort}`,
        'Логин / пароль: пусто',
      ].join('\n')
    case 'cursor':
      return [
        'Cursor / VS Code / WebStorm → HTTP Proxy',
        'Host: 127.0.0.1',
        `Port: ${httpPort}`,
        'Или SOCKS5:',
        'Host: 127.0.0.1',
        `Port: ${socksPort}`,
      ].join('\n')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
