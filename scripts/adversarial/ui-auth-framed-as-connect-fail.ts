/**
 * Attack: authCheckMessage / credential errors are shown via AlertBanner with
 * parseBridgeError → title «Не удалось подключиться» + Settings action
 * «Повторить» → findPhone. Credentials cannot be fixed by rediscovery.
 *
 * Contract: backend auth strings must not be framed as generic connect failure.
 */
import assert from 'node:assert/strict'
import { parseBridgeError } from '../../src/components/AlertBanner'

/** Exact strings from electron/session.ts authCheckMessage. */
const AUTH_ERRORS = [
  'Happ требует логин/пароль LAN — укажите их в настройках Bridge.',
  'Happ отклонил логин/пароль LAN — проверьте данные в настройках.',
] as const

for (const err of AUTH_ERRORS) {
  const parsed = parseBridgeError(err)
  assert.notEqual(
    parsed.title,
    'Не удалось подключиться',
    `auth error must not use connect-failure title (kind=${parsed.kind}): ${err}`,
  )
  assert.notEqual(
    parsed.kind,
    'generic',
    `auth error must not be generic (wrong primary action findPhone): ${err}`,
  )
}

console.log('ui-auth-framed-as-connect-fail: unexpected pass')
