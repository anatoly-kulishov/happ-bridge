/**
 * Attack: PeerList choose() — active + onDisconnect ⇒ disconnect; else select.
 * Settings also has selectPeer early-return when ip === phoneIp (never disconnects).
 * If onDisconnect were omitted, active click is silent no-op while copy says
 * «Активный — чтобы отключить» whenever peers.length > 1.
 *
 * Pure decision mirror; assert Settings wiring invariant: disconnect handler
 * must be the path for active peer (selectPeer must not be the only handler).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const settingsSrc = fs.readFileSync(path.join(root, 'src/components/Settings.tsx'), 'utf8')
const peerListSrc = fs.readFileSync(path.join(root, 'src/components/PeerList.tsx'), 'utf8')

type Action = 'disconnect' | 'select' | 'noop'

function peerClick(ip: string, selectedIp: string | null, hasDisconnect: boolean): Action {
  if (ip === selectedIp) return hasDisconnect ? 'disconnect' : 'noop'
  return 'select'
}

assert.equal(peerClick('10.0.0.2', '10.0.0.2', true), 'disconnect')
assert.equal(peerClick('10.0.0.5', '10.0.0.2', true), 'select')
assert.equal(peerClick('10.0.0.2', '10.0.0.2', false), 'noop')

// Settings must wire onDisconnect when it tells users active click disconnects
assert.match(settingsSrc, /onDisconnect=\{disconnectPeer\}/)
assert.match(
  settingsSrc,
  /Активный повторно — отключить|Активный — чтобы отключить/,
)

// PeerList documents disconnect-on-active only when onDisconnect is provided;
// Wizard also wires onDisconnect — if any call site shows the hint without handler, UX lies.
const wizardSrc = fs.readFileSync(path.join(root, 'src/components/Wizard.tsx'), 'utf8')
assert.match(wizardSrc, /onDisconnect=/)

// Broken if selectPeer is the only peer action and swallows active clicks
assert.match(
  settingsSrc,
  /if \(ip === state\.phoneIp\) return/,
  'selectPeer no-ops on active IP — disconnect must come from onDisconnect, not selectPeer',
)

// This attack fails if the hint is shown without onDisconnect somewhere — check PeerList hint
assert.match(peerListSrc, /Активный — чтобы отключить/)
// Hint is unconditional on peers.length > 1, NOT on Boolean(onDisconnect):
const hintWithoutGuard =
  /peers\.length > 1 && \([\s\S]*?Активный — чтобы отключить/.test(peerListSrc) &&
  !/onDisconnect[\s\S]{0,200}Активный — чтобы отключить/.test(peerListSrc)

assert.equal(
  hintWithoutGuard,
  false,
  'PeerList shows «Активный — чтобы отключить» whenever peers.length > 1 even if onDisconnect is omitted — misleading',
)

console.log('ui-peer-click-contract: unexpected pass')
