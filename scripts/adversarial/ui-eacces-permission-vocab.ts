/**
 * Attack: presentError uses «Нет прав…»; parseBridgeError permission branch
 * only matches «нет доступа» / «Полный доступ к диску» / Local Network.
 * Vocabulary mismatch ⇒ EACCES never becomes kind 'permission'.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

const EACCES_RU =
  'Нет прав на привязку порта — используйте локальный порт выше 1024.'

const parsed = parseBridgeError(EACCES_RU)

assert.equal(
  parsed.kind,
  'permission',
  `EACCES RU string must classify as permission (got ${parsed.kind}) — «Нет прав» ≠ «нет доступа»`,
)

console.log('ui-eacces-permission-vocab: unexpected pass')
