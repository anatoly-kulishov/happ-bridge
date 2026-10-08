/**
 * Attack: presentError(EACCES) tells the user to change the local port (>1024),
 * but parseBridgeError classifies it as generic — Settings only shows the
 * actionable «Сменить порты» button for kind === 'port-in-use'.
 *
 * Contract: Russian bridge errors that require changing ports must be
 * actionable (port-in-use), same as EADDRINUSE.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

/** Exact string from electron/session.ts presentError for EACCES. */
const EACCES_RU =
  'Нет прав на привязку порта — используйте локальный порт выше 1024.'

const parsed = parseBridgeError(EACCES_RU)

assert.equal(
  parsed.kind,
  'port-in-use',
  `EACCES presentError must be actionable port-in-use (got kind=${parsed.kind}, title=${parsed.title}) so Settings shows «Сменить порты», not only «Повторить»/findPhone`,
)

console.log('ui-eacces-not-port-actionable: unexpected pass')
