/**
 * Attack: presetText('telegram', ...) returns login/password in plaintext
 * for clipboard copy (electron/presets.ts:43-52). clipboard.writeText is called
 * (electron/main.ts:295) and the clipboard is NEVER cleared of credentials.
 *
 * Why: presetText returns "Логин: {auth.user}\nПароль: {auth.pass}"
 * which is written to clipboard. There is no auto-clear mechanism.
 * The clipboard retains credentials until the user copies something else.
 *
 * Test: verify presetText('telegram') with auth returns credentials in text.
 * (Cannot test actual clipboard from Node — test the content that goes to clipboard)
 */
import assert from 'node:assert/strict'
import { presetText } from '../../electron/presets'

async function main() {
  const PASS = 'TelegaSecret99'
  const USER = 'telegramuser'

  const text = presetText('telegram', 10808, 10809, { user: USER, pass: PASS })

  // Verify credentials ARE in the text (this confirms the attack surface)
  assert.ok(
    text.includes(`Логин: ${USER}`),
    `presetText('telegram') must include user for clipboard copy. Got:\n${text}`,
  )
  assert.ok(
    text.includes(`Пароль: ${PASS}`),
    `presetText('telegram') must include password in plaintext for clipboard. Got:\n${text}`,
  )

  // The clipboard content will contain:
  // Логин: telegramuser
  // Пароль: TelegaSecret99
  // No auto-clear, no warning, credentials persist in clipboard

  console.log('CLIPBOARD-CREDENTIALS: CONFIRMED — telegram preset writes plaintext credentials to clipboard')
  console.log('Clipboard content:', text)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
