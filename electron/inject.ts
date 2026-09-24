import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { httpProxyUrl } from './presets'

const execFileAsync = promisify(execFile)

function injectAuth(ports: InjectPorts): { user: string; pass: string } | null {
  const user = ports.proxyUser
  const pass = ports.proxyPassword
  const userOk = typeof user === 'string' && user.length > 0
  const passOk = typeof pass === 'string' && pass.length > 0
  if (!userOk && !passOk) return null
  return { user: user ?? '', pass: pass ?? '' }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type InjectTarget = 'cursor' | 'webstorm' | 'firefox'

export type InjectPorts = {
  socksPort: number
  httpPort: number
  /**
   * Phone LAN IP for seamless Firefox revert (direct Happ SOCKS).
   * When leaving 127.0.0.1, we restore here — not "system proxy".
   */
  phoneIp?: string | null
  /** Happ LAN credentials (optional). */
  proxyUser?: string | null
  proxyPassword?: string | null
}

export type InjectTargetInfo = {
  id: InjectTarget
  label: string
  available: boolean
  applied: boolean
  path: string | null
  detail: string
}

export type InjectActionResult = {
  id: InjectTarget
  ok: boolean
  message: string
}

export type InjectBatchResult = {
  results: InjectActionResult[]
  status: InjectTargetInfo[]
}

type CursorSnapshot = {
  path: string
  /** Previous values for keys we manage; missing key ⇒ was absent */
  previous: Record<string, unknown>
  existed: boolean
}

type FileSnapshot = {
  path: string
  previousContent: string | null
  existed: boolean
}

type PrefScalar = string | number | boolean

type FirefoxSnapshot = {
  path: string
  previousContent: string | null
  existed: boolean
  /** prefs.js path + prior values for keys we touch; null ⇒ key was absent */
  prefsPath?: string
  prefsPrevious?: Record<string, PrefScalar | null>
}

type BackupStore = {
  cursor?: CursorSnapshot
  webstorm?: FileSnapshot[]
  firefox?: FirefoxSnapshot
}

const CURSOR_KEYS = [
  'http.proxy',
  'http.proxySupport',
  'cursor.general.disableHttp2',
] as const

const FF_PROXY_KEYS = [
  'network.proxy.type',
  'network.proxy.socks',
  'network.proxy.socks_port',
  'network.proxy.socks_version',
  'network.proxy.socks_remote_dns',
  'network.proxy.socks_username',
  'network.proxy.socks_password',
] as const

const FF_BEGIN = '// BEGIN happ-bridge managed'
const FF_END = '// END happ-bridge managed'

export function injectStatus(
  homeDir = os.homedir(),
  backupPath?: string,
): InjectTargetInfo[] {
  const backups = loadBackups(backupPath)
  const cursorPath = cursorSettingsPath(homeDir)
  const wsPaths = webstormProxyPaths(homeDir)
  const ffPath = firefoxUserJsPath(homeDir)

  return [
    {
      id: 'cursor',
      label: 'Cursor',
      available: fs.existsSync(path.dirname(cursorPath)),
      applied: Boolean(backups.cursor),
      path: cursorPath,
      detail: fs.existsSync(cursorPath)
        ? cursorPath
        : fs.existsSync(path.dirname(cursorPath))
          ? 'settings.json ещё нет — создадим при прописке'
          : 'Cursor не найден',
    },
    {
      id: 'webstorm',
      label: 'WebStorm',
      available: wsPaths.length > 0,
      applied: Boolean(backups.webstorm?.length),
      path: wsPaths[0] ?? null,
      detail:
        wsPaths.length > 0
          ? wsPaths.length === 1
            ? wsPaths[0]
            : `${wsPaths.length} версий: ${wsPaths.map((p) => path.basename(path.dirname(path.dirname(p)))).join(', ')}`
          : 'WebStorm не найден',
    },
    {
      id: 'firefox',
      label: 'Firefox',
      available: Boolean(ffPath),
      applied: Boolean(backups.firefox),
      path: ffPath,
      detail: ffPath ?? 'Профиль Firefox не найден',
    },
  ]
}

export function applyInject(
  targets: InjectTarget[],
  ports: InjectPorts,
  homeDir = os.homedir(),
  backupPath?: string,
): InjectBatchResult {
  const backups = loadBackups(backupPath)
  const results: InjectActionResult[] = []

  for (const id of targets) {
    try {
      if (id === 'cursor') {
        results.push(applyCursor(ports, homeDir, backups))
      } else if (id === 'webstorm') {
        results.push(applyWebstorm(ports, homeDir, backups))
      } else if (id === 'firefox') {
        results.push(applyFirefox(ports, homeDir, backups))
      } else {
        const _exhaustive: never = id
        void _exhaustive
      }
    } catch (err) {
      results.push({
        id,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  saveBackups(backupPath, backups)
  return { results, status: injectStatus(homeDir, backupPath) }
}

export function revertInject(
  targets: InjectTarget[],
  ports: InjectPorts,
  homeDir = os.homedir(),
  backupPath?: string,
): InjectBatchResult {
  const backups = loadBackups(backupPath)
  const results: InjectActionResult[] = []

  for (const id of targets) {
    try {
      if (id === 'cursor') {
        results.push(revertCursor(homeDir, backups))
      } else if (id === 'webstorm') {
        results.push(revertWebstorm(backups))
      } else if (id === 'firefox') {
        results.push(revertFirefox(homeDir, backups, ports))
      } else {
        const _exhaustive: never = id
        void _exhaustive
      }
    } catch (err) {
      results.push({
        id,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  saveBackups(backupPath, backups)
  return { results, status: injectStatus(homeDir, backupPath) }
}

/** Targets that currently have a restore snapshot (actively injected). */
export function listBackedUpTargets(backupPath?: string): InjectTarget[] {
  const backups = loadBackups(backupPath)
  const out: InjectTarget[] = []
  if (backups.cursor) out.push('cursor')
  if (backups.webstorm?.length) out.push('webstorm')
  if (backups.firefox) out.push('firefox')
  return out
}

export function revertAllInjected(
  ports: InjectPorts,
  homeDir = os.homedir(),
  backupPath?: string,
): InjectBatchResult {
  return revertInject(listBackedUpTargets(backupPath), ports, homeDir, backupPath)
}

const APP_NAME: Record<InjectTarget, string> = {
  cursor: 'Cursor',
  webstorm: 'WebStorm',
  firefox: 'Firefox',
}

/** Quit + reopen so proxy prefs are picked up. */
export async function relaunchInjectApps(
  targets: InjectTarget[],
): Promise<{ id: InjectTarget; ok: boolean; message: string }[]> {
  const out: { id: InjectTarget; ok: boolean; message: string }[] = []
  for (const id of targets) {
    const name = APP_NAME[id]
    try {
      await execFileAsync('osascript', [
        '-e',
        `tell application "${name}" to quit`,
      ]).catch(() => undefined)
      await new Promise((r) => setTimeout(r, 900))
      await execFileAsync('open', ['-a', name])
      out.push({ id, ok: true, message: `${name}: перезапущен` })
    } catch (err) {
      out.push({
        id,
        ok: false,
        message: `${name}: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
  return out
}

export function mergeCursorSettings(
  raw: Record<string, unknown>,
  ports: InjectPorts,
): Record<string, unknown> {
  return {
    ...raw,
    'http.proxy': httpProxyUrl('127.0.0.1', ports.httpPort, injectAuth(ports)),
    'http.proxySupport': 'override',
    'cursor.general.disableHttp2': true,
  }
}

export function restoreCursorSettings(
  raw: Record<string, unknown>,
  previous: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...raw }
  for (const key of CURSOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) {
      next[key] = previous[key]
    } else {
      delete next[key]
    }
  }
  return next
}

export function buildWebstormXml(ports: InjectPorts): string {
  const auth = injectAuth(ports)
  const lines = [
    '<application>',
    '  <component name="HttpConfigurable">',
    '    <option name="USE_HTTP_PROXY" value="true" />',
    '    <option name="PROXY_TYPE_IS_SOCKS" value="true" />',
    '    <option name="PROXY_HOST" value="127.0.0.1" />',
    `    <option name="PROXY_PORT" value="${ports.socksPort}" />`,
  ]
  if (auth) {
    lines.push(`    <option name="PROXY_LOGIN" value="${xmlEscape(auth.user)}" />`)
    lines.push(`    <option name="PROXY_PASSWORD" value="${xmlEscape(auth.pass)}" />`)
  }
  lines.push(
    '    <option name="PROXY_EXCEPTIONS" value="" />',
    '    <option name="PAC_URL" value="" />',
    '  </component>',
    '</application>',
    '',
  )
  return lines.join('\n')
}

export function upsertFirefoxBlock(content: string, ports: InjectPorts): string {
  const auth = injectAuth(ports)
  const block = [
    FF_BEGIN,
    'user_pref("network.proxy.type", 1);',
    'user_pref("network.proxy.socks", "127.0.0.1");',
    `user_pref("network.proxy.socks_port", ${ports.socksPort});`,
    'user_pref("network.proxy.socks_version", 5);',
    'user_pref("network.proxy.socks_remote_dns", true);',
    ...(auth
      ? [
          `user_pref("network.proxy.socks_username", ${JSON.stringify(auth.user)});`,
          `user_pref("network.proxy.socks_password", ${JSON.stringify(auth.pass)});`,
        ]
      : []),
    FF_END,
  ].join('\n')

  const stripped = stripFirefoxBlock(content).trimEnd()
  return stripped.length > 0 ? `${stripped}\n\n${block}\n` : `${block}\n`
}

export function stripFirefoxBlock(content: string): string {
  const start = content.indexOf(FF_BEGIN)
  if (start < 0) return content
  const end = content.indexOf(FF_END, start)
  if (end < 0) return content
  const after = end + FF_END.length
  const before = content.slice(0, start).replace(/\n+$/, '')
  const rest = content.slice(after).replace(/^\n+/, '')
  if (!before) return rest
  if (!rest) return `${before}\n`
  return `${before}\n\n${rest}`
}

/** Read a single user_pref value; undefined if the key is absent. */
export function readUserPref(content: string, key: string): PrefScalar | undefined {
  const re = new RegExp(
    `^\\s*user_pref\\(\\s*"${escapeRegExp(key)}"\\s*,\\s*(.+?)\\s*\\)\\s*;\\s*$`,
    'm',
  )
  const m = content.match(re)
  if (!m) return undefined
  return parsePrefLiteral(m[1])
}

export function setUserPref(content: string, key: string, value: PrefScalar): string {
  const line = `user_pref("${key}", ${formatPrefLiteral(value)});`
  const re = new RegExp(
    `^\\s*user_pref\\(\\s*"${escapeRegExp(key)}"\\s*,\\s*.+?\\s*\\)\\s*;\\s*$`,
    'm',
  )
  if (re.test(content)) return content.replace(re, line)
  const trimmed = content.replace(/\s*$/, '')
  return trimmed.length > 0 ? `${trimmed}\n${line}\n` : `${line}\n`
}

export function deleteUserPref(content: string, key: string): string {
  const re = new RegExp(
    `^\\s*user_pref\\(\\s*"${escapeRegExp(key)}"\\s*,\\s*.+?\\s*\\)\\s*;\\s*\\n?`,
    'm',
  )
  return content.replace(re, '')
}

export function parseFirefoxDefaultProfile(
  profilesIni: string,
  firefoxRoot: string,
): string | null {
  const installDefault = profilesIni.match(
    /^\[Install[^\]]*\][\s\S]*?^Default=(.+)$/m,
  )
  if (installDefault) {
    const rel = installDefault[1].trim()
    const abs = path.isAbsolute(rel) ? rel : path.join(firefoxRoot, rel)
    if (fs.existsSync(abs)) return abs
  }

  const blocks = profilesIni.split(/^\[Profile\d+\]$/m).slice(1)
  let fallback: string | null = null
  for (const block of blocks) {
    const pathMatch = block.match(/^Path=(.+)$/m)
    const relative = !/^IsRelative=0$/m.test(block)
    const isDefault = /^Default=1$/m.test(block)
    if (!pathMatch) continue
    const rel = pathMatch[1].trim()
    const abs = relative || !path.isAbsolute(rel) ? path.join(firefoxRoot, rel) : rel
    if (!fs.existsSync(abs)) continue
    if (isDefault) return abs
    if (!fallback) fallback = abs
  }
  return fallback
}

function applyCursor(
  ports: InjectPorts,
  homeDir: string,
  backups: BackupStore,
): InjectActionResult {
  const filePath = cursorSettingsPath(homeDir)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    return { id: 'cursor', ok: false, message: 'Папка Cursor не найдена' }
  }

  const existed = fs.existsSync(filePath)
  const raw = existed ? readJsonObject(filePath) : {}

  if (!backups.cursor) {
    const previous: Record<string, unknown> = {}
    for (const key of CURSOR_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        previous[key] = raw[key]
      }
    }
    backups.cursor = { path: filePath, previous, existed }
  }

  const next = mergeCursorSettings(raw, ports)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 4)}\n`, 'utf8')
  return {
    id: 'cursor',
    ok: true,
    message: `Прописано в ${filePath}. Перезапустите Cursor.`,
  }
}

function revertCursor(homeDir: string, backups: BackupStore): InjectActionResult {
  const snap = backups.cursor
  if (!snap) {
    return { id: 'cursor', ok: false, message: 'Нет сохранённого отката для Cursor' }
  }

  const filePath = snap.path || cursorSettingsPath(homeDir)
  if (!snap.existed) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } else if (fs.existsSync(filePath)) {
    const raw = readJsonObject(filePath)
    const restored = restoreCursorSettings(raw, snap.previous)
    fs.writeFileSync(filePath, `${JSON.stringify(restored, null, 4)}\n`, 'utf8')
  } else {
    const restored = restoreCursorSettings({}, snap.previous)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(restored, null, 4)}\n`, 'utf8')
  }

  delete backups.cursor
  return {
    id: 'cursor',
    ok: true,
    message: 'Cursor: настройки прокси откачены. Перезапустите Cursor.',
  }
}

function applyWebstorm(
  ports: InjectPorts,
  homeDir: string,
  backups: BackupStore,
): InjectActionResult {
  const paths = webstormProxyPaths(homeDir)
  if (paths.length === 0) {
    return { id: 'webstorm', ok: false, message: 'WebStorm не найден' }
  }

  if (!backups.webstorm) {
    backups.webstorm = paths.map((p) => ({
      path: p,
      previousContent: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null,
      existed: fs.existsSync(p),
    }))
  }

  const xml = buildWebstormXml(ports)
  for (const p of paths) {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, xml, 'utf8')
  }

  return {
    id: 'webstorm',
    ok: true,
    message: `Прописано в ${paths.length} WebStorm. Перезапустите IDE.`,
  }
}

function revertWebstorm(backups: BackupStore): InjectActionResult {
  const snaps = backups.webstorm
  if (!snaps?.length) {
    return { id: 'webstorm', ok: false, message: 'Нет сохранённого отката для WebStorm' }
  }

  for (const snap of snaps) {
    if (!snap.existed) {
      if (fs.existsSync(snap.path)) fs.unlinkSync(snap.path)
    } else if (snap.previousContent != null) {
      fs.mkdirSync(path.dirname(snap.path), { recursive: true })
      fs.writeFileSync(snap.path, snap.previousContent, 'utf8')
    }
  }

  delete backups.webstorm
  return {
    id: 'webstorm',
    ok: true,
    message: 'WebStorm: proxy.settings.xml откачен. Перезапустите IDE.',
  }
}

function applyFirefox(
  ports: InjectPorts,
  homeDir: string,
  backups: BackupStore,
): InjectActionResult {
  const userJs = firefoxUserJsPath(homeDir)
  const prefsJs = firefoxPrefsJsPath(homeDir)
  if (!userJs || !prefsJs) {
    return { id: 'firefox', ok: false, message: 'Профиль Firefox не найден' }
  }

  const existed = fs.existsSync(userJs)
  const current = existed ? fs.readFileSync(userJs, 'utf8') : ''
  const prefsExisted = fs.existsSync(prefsJs)
  const prefsCurrent = prefsExisted ? fs.readFileSync(prefsJs, 'utf8') : ''

  if (!backups.firefox) {
    const prefsPrevious: Record<string, PrefScalar | null> = {}
    for (const key of FF_PROXY_KEYS) {
      const v = readUserPref(prefsCurrent, key)
      prefsPrevious[key] = v === undefined ? null : v
    }
    backups.firefox = {
      path: userJs,
      previousContent: existed ? current : null,
      existed,
      prefsPath: prefsJs,
      prefsPrevious,
    }
  }

  fs.writeFileSync(userJs, upsertFirefoxBlock(stripFirefoxBlock(current), ports), 'utf8')
  fs.writeFileSync(prefsJs, applyFirefoxPrefs(prefsCurrent, ports), 'utf8')

  return {
    id: 'firefox',
    ok: true,
    message: 'Прописано в user.js и prefs.js. Перезапустите Firefox.',
  }
}

function revertFirefox(
  homeDir: string,
  backups: BackupStore,
  ports: InjectPorts,
): InjectActionResult {
  const snap = backups.firefox
  if (!snap) {
    const restored = restoreFirefoxToPhone(homeDir, ports)
    return restored
      ? {
          id: 'firefox',
          ok: true,
          message: `Firefox: SOCKS → ${ports.phoneIp}. Полностью закройте Firefox.`,
        }
      : { id: 'firefox', ok: false, message: 'Нет сохранённого отката для Firefox' }
  }

  const desired = firefoxRestorePrefs(snap.prefsPrevious ?? {}, ports)
  fs.writeFileSync(
    snap.path,
    upsertFirefoxPrefsBlock(
      snap.existed && snap.previousContent != null
        ? stripFirefoxBlock(snap.previousContent)
        : '',
      desired,
    ),
    'utf8',
  )

  const prefsPath = snap.prefsPath ?? firefoxPrefsJsPath(homeDir)
  if (prefsPath) {
    const raw = fs.existsSync(prefsPath) ? fs.readFileSync(prefsPath, 'utf8') : ''
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true })
    fs.writeFileSync(prefsPath, writeFirefoxPrefs(raw, desired), 'utf8')
  }

  delete backups.firefox
  const host = String(desired['network.proxy.socks'] ?? ports.phoneIp ?? '')
  return {
    id: 'firefox',
    ok: true,
    message: host
      ? `Firefox: SOCKS → ${host}. Полностью закройте Firefox.`
      : 'Firefox откачен. Полностью закройте Firefox.',
  }
}

/**
 * Prefs to write on quit: prefer snapshotted direct Happ IP; if snapshot was
 * missing or already 127.0.0.1, use ports.phoneIp. Never default to "system".
 */
export function firefoxRestorePrefs(
  previous: Record<string, PrefScalar | null>,
  ports: InjectPorts,
): Record<string, PrefScalar> {
  const prevSocks = previous['network.proxy.socks']
  const prevWasBridge =
    prevSocks === null ||
    prevSocks === undefined ||
    prevSocks === '127.0.0.1' ||
    prevSocks === 'localhost'

  const host =
    !prevWasBridge && typeof prevSocks === 'string'
      ? prevSocks
      : ports.phoneIp && ports.phoneIp.length > 0
        ? ports.phoneIp
        : null

  if (!host) {
    // No phone IP known — keep non-bridge previous type if any, else leave manual empty
    const type = previous['network.proxy.type']
    if (typeof type === 'number' && type !== 1) {
      return { 'network.proxy.type': type }
    }
    return { 'network.proxy.type': 0 }
  }

  const port =
    typeof previous['network.proxy.socks_port'] === 'number' &&
    previous['network.proxy.socks_port'] > 0 &&
    !prevWasBridge
      ? previous['network.proxy.socks_port']
      : ports.socksPort

  const version =
    typeof previous['network.proxy.socks_version'] === 'number'
      ? previous['network.proxy.socks_version']
      : 5

  const remoteDns =
    typeof previous['network.proxy.socks_remote_dns'] === 'boolean'
      ? previous['network.proxy.socks_remote_dns']
      : true

  return {
    'network.proxy.type': 1,
    'network.proxy.socks': host,
    'network.proxy.socks_port': port,
    'network.proxy.socks_version': version,
    'network.proxy.socks_remote_dns': remoteDns,
    ...(authRestore(ports, previous) ?? {}),
  }
}

function authRestore(
  ports: InjectPorts,
  previous: Record<string, PrefScalar | null>,
): Record<string, PrefScalar> | null {
  const auth = injectAuth(ports)
  if (auth) {
    return {
      'network.proxy.socks_username': auth.user,
      'network.proxy.socks_password': auth.pass,
    }
  }
  const user = previous['network.proxy.socks_username']
  const pass = previous['network.proxy.socks_password']
  if (typeof user === 'string' || typeof pass === 'string') {
    return {
      ...(typeof user === 'string' ? { 'network.proxy.socks_username': user } : {}),
      ...(typeof pass === 'string' ? { 'network.proxy.socks_password': pass } : {}),
    }
  }
  return null
}

function upsertFirefoxPrefsBlock(
  content: string,
  prefs: Record<string, PrefScalar>,
): string {
  const lines = [FF_BEGIN]
  for (const [key, val] of Object.entries(prefs)) {
    lines.push(`user_pref("${key}", ${formatPrefLiteral(val)});`)
  }
  lines.push(FF_END)
  const block = lines.join('\n')
  const stripped = stripFirefoxBlock(content).trimEnd()
  return stripped.length > 0 ? `${stripped}\n\n${block}\n` : `${block}\n`
}

function applyFirefoxPrefs(content: string, ports: InjectPorts): string {
  const auth = injectAuth(ports)
  const prefs: Record<string, PrefScalar> = {
    'network.proxy.type': 1,
    'network.proxy.socks': '127.0.0.1',
    'network.proxy.socks_port': ports.socksPort,
    'network.proxy.socks_version': 5,
    'network.proxy.socks_remote_dns': true,
  }
  if (auth) {
    prefs['network.proxy.socks_username'] = auth.user
    prefs['network.proxy.socks_password'] = auth.pass
  }
  return writeFirefoxPrefs(content, prefs)
}

function writeFirefoxPrefs(
  content: string,
  prefs: Record<string, PrefScalar>,
): string {
  let next = content
  for (const key of FF_PROXY_KEYS) {
    if (key in prefs) next = setUserPref(next, key, prefs[key])
    else next = deleteUserPref(next, key)
  }
  return next
}

/** Replace bridge 127.0.0.1 SOCKS with direct phone Happ IP. */
export function scrubFirefoxLocalProxy(homeDir: string, ports: InjectPorts): boolean {
  return restoreFirefoxToPhone(homeDir, ports)
}

function restoreFirefoxToPhone(homeDir: string, ports: InjectPorts): boolean {
  if (!ports.phoneIp) return false

  const desired = firefoxRestorePrefs(
    {
      'network.proxy.type': null,
      'network.proxy.socks': '127.0.0.1',
      'network.proxy.socks_port': ports.socksPort,
      'network.proxy.socks_version': null,
      'network.proxy.socks_remote_dns': null,
    },
    ports,
  )

  const userJs = firefoxUserJsPath(homeDir)
  const prefsJs = firefoxPrefsJsPath(homeDir)
  if (!userJs || !prefsJs) return false

  const userRaw = fs.existsSync(userJs) ? fs.readFileSync(userJs, 'utf8') : ''
  const prefsRaw = fs.existsSync(prefsJs) ? fs.readFileSync(prefsJs, 'utf8') : ''
  const socks = readUserPref(prefsRaw, 'network.proxy.socks')
  const hadBlock = userRaw.includes(FF_BEGIN)
  const pointsAtBridge = socks === '127.0.0.1' || socks === 'localhost' || hadBlock

  // Also rewrite when system-proxy was wrongly planted (type 5) after a bad scrub
  const type = readUserPref(prefsRaw, 'network.proxy.type')
  const needsFix = pointsAtBridge || type === 5 || type === 1

  if (!needsFix && socks === ports.phoneIp) return false

  fs.writeFileSync(userJs, upsertFirefoxPrefsBlock(stripFirefoxBlock(userRaw), desired), 'utf8')
  fs.writeFileSync(prefsJs, writeFirefoxPrefs(prefsRaw, desired), 'utf8')
  return true
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPrefLiteral(value: PrefScalar): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function parsePrefLiteral(raw: string): PrefScalar | undefined {
  const t = raw.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string
    } catch {
      return t.slice(1, -1)
    }
  }
  return undefined
}

function cursorSettingsPath(homeDir: string): string {
  return path.join(
    homeDir,
    'Library',
    'Application Support',
    'Cursor',
    'User',
    'settings.json',
  )
}

function jetbrainsRoot(homeDir: string): string {
  return path.join(homeDir, 'Library', 'Application Support', 'JetBrains')
}

function webstormProxyPaths(homeDir: string): string[] {
  const root = jetbrainsRoot(homeDir)
  if (!fs.existsSync(root)) return []

  const dirs = fs
    .readdirSync(root)
    .filter((name) => /^WebStorm\d/.test(name) && !/backup/i.test(name))
    .sort(compareWebstormVersion)
    .reverse()

  return dirs.map((name) => path.join(root, name, 'options', 'proxy.settings.xml'))
}

function compareWebstormVersion(a: string, b: string): number {
  const pa = a.replace(/^WebStorm/i, '').split('.').map((x) => Number(x) || 0)
  const pb = b.replace(/^WebStorm/i, '').split('.').map((x) => Number(x) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function firefoxRoot(homeDir: string): string {
  return path.join(homeDir, 'Library', 'Application Support', 'Firefox')
}

function firefoxProfileDir(homeDir: string): string | null {
  const root = firefoxRoot(homeDir)
  const iniPath = path.join(root, 'profiles.ini')
  if (!fs.existsSync(iniPath)) return null
  return parseFirefoxDefaultProfile(fs.readFileSync(iniPath, 'utf8'), root)
}

function firefoxUserJsPath(homeDir: string): string | null {
  const profile = firefoxProfileDir(homeDir)
  return profile ? path.join(profile, 'user.js') : null
}

function firefoxPrefsJsPath(homeDir: string): string | null {
  const profile = firefoxProfileDir(homeDir)
  return profile ? path.join(profile, 'prefs.js') : null
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Ожидался JSON-объект в ${filePath}`)
  }
  return raw as Record<string, unknown>
}

function loadBackups(backupPath?: string): BackupStore {
  if (!backupPath || !fs.existsSync(backupPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(backupPath, 'utf8')) as BackupStore
  } catch {
    return {}
  }
}

function saveBackups(backupPath: string | undefined, store: BackupStore): void {
  if (!backupPath) return
  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  const empty =
    !store.cursor && (!store.webstorm || store.webstorm.length === 0) && !store.firefox
  if (empty) {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
    return
  }
  fs.writeFileSync(backupPath, JSON.stringify(store, null, 2), 'utf8')
}
