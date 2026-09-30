/**
 * Attack: presetText('cursor', ...) embeds credentials in the URL string
 * which is then written to clipboard via bridge:copy IPC (main.ts:287-296).
 *
 * Why: When user copies "Cursor" preset, presetText returns a string containing:
 *   URL: socks5://user:pass@127.0.0.1:10808
 * This goes to clipboard. Even though the URL is encoded, credentials are
 * reversibly encoded (not encrypted) and visible in clipboard.
 *
 * Test: verify presetText('cursor') with auth includes credentials in URL.
 */
import assert from 'node:assert/strict'
import { presetText } from '../../electron/presets'

async function main() {
  const PASS = 'CursorPass123'
  const USER = 'cursoruser'

  const text = presetText('cursor', 10808, 10809, { user: USER, pass: PASS })

  // URL with credentials must be in the text (confirmed attack surface)
  const expectedUrl = `socks5://${encodeURIComponent(USER)}:${encodeURIComponent(PASS)}@127.0.0.1:10808`
  assert.ok(
    text.includes(expectedUrl),
    `presetText('cursor') must include URL with credentials. Expected "${expectedUrl}" in:\n${text}`,
  )

  console.log('PRESET-CURSOR-CREDENTIALS: CONFIRMED — cursor preset URL contains credentials')
  console.log('Text copied to clipboard:', text)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
