/**
 * Contract: updateSettings must normalize credentials (no raw merge smuggle).
 */
import assert from 'node:assert/strict'
import {
  normalizeSettings,
  socksAuthFromSettings,
  type AppSettings,
} from '../../electron/types'

/** Mirrors fixed BridgeSession.updateSettings merge. */
function updateSettingsNormalized(
  prev: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  return normalizeSettings({ ...prev, ...patch })
}

async function main() {
  const base = normalizeSettings({})

  const viaPatch = updateSettingsNormalized(base, {
    proxyUser: '   ' as unknown as string,
    proxyPassword: 'real-secret',
  })

  const viaNormalize = normalizeSettings({
    proxyUser: '   ',
    proxyPassword: 'real-secret',
  })

  assert.equal(viaNormalize.proxyUser, null)
  assert.equal(viaPatch.proxyUser, null)

  const authPatch = socksAuthFromSettings(viaPatch)
  const authNorm = socksAuthFromSettings(viaNormalize)

  assert.ok(authNorm)
  assert.equal(authNorm!.user, '')
  assert.equal(authNorm!.pass, 'real-secret')
  assert.deepEqual(authPatch, authNorm)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
