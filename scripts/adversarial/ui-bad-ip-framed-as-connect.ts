/**
 * Attack: selectPhone sets «Некорректный IP»; parseBridgeError titles it
 * «Не удалось подключиться» — validation error framed as connection failure,
 * Settings still offers «Повторить»/findPhone.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

const parsed = parseBridgeError('Некорректный IP')
assert.notEqual(
  parsed.title,
  'Не удалось подключиться',
  `invalid-IP validation must not use connect-failure title (kind=${parsed.kind})`,
)

console.log('ui-bad-ip-framed-as-connect: unexpected pass')
