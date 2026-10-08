/**
 * Attack: state.error = '' is truthy in JS; Settings does
 * `state.error ? parseBridgeError(state.error) : null` and shows AlertBanner
 * with title «Не удалось подключиться» and empty body.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

const parsed = parseBridgeError('')
assert.notEqual(
  parsed.title,
  'Не удалось подключиться',
  `empty error must not claim connect failure (kind=${parsed.kind}, body=${JSON.stringify(parsed.body)})`,
)

console.log('ui-empty-error-still-alerts: unexpected pass')
