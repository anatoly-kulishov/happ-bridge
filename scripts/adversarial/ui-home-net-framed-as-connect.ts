/**
 * Attack: intentional hold-off on public Wi‑Fi without LAN auth sets a guidance
 * error, but parseBridgeError titles it «Не удалось подключиться» and Settings
 * offers findPhone — user was told to pick a peer / set password, not rescan.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

const err =
  'Сеть не отмечена как домашняя и пароль LAN не задан — автоподключение отключено. Выберите телефон в списке.'
const parsed = parseBridgeError(err)

assert.notEqual(
  parsed.title,
  'Не удалось подключиться',
  `public-Wi‑Fi hold-off must not look like a connect crash (kind=${parsed.kind})`,
)

console.log('ui-home-net-framed-as-connect: unexpected pass')
