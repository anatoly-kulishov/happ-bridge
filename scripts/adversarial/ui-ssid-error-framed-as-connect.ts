/**
 * Attack: markCurrentNetworkHome sets error «Wi‑Fi SSID не определён».
 * parseBridgeError turns it into title «Не удалось подключиться»; Settings
 * shows «Повторить» → findPhone — wrong surface for a home-SSID mark failure.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

const err = 'Wi‑Fi SSID не определён'
const parsed = parseBridgeError(err)

assert.notEqual(
  parsed.title,
  'Не удалось подключиться',
  `SSID mark failure must not be titled as connect failure (kind=${parsed.kind})`,
)

console.log('ui-ssid-error-framed-as-connect: unexpected pass')
