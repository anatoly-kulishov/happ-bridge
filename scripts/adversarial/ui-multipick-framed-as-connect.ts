/**
 * Attack: multi-peer «choose one» is stored as state.error and classified as
 * generic connect failure («Не удалось подключиться»), while the body asks
 * the user to select a phone — misleading AlertBanner.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

const err = 'Найдено 3 прокси. Выберите телефон в списке.'
const parsed = parseBridgeError(err)

assert.notEqual(
  parsed.title,
  'Не удалось подключиться',
  `peer-pick prompt must not be titled as connect failure (kind=${parsed.kind})`,
)

console.log('ui-multipick-framed-as-connect: unexpected pass')
