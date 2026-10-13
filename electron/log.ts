import fs from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'
import { app } from 'electron'

const LOG_DIR = () => path.join(app.getPath('logs'), 'Happ Bridge')
const LOG_FILE = () => path.join(LOG_DIR(), 'main.log')
/** Cap on-disk log so weak disks / low RAM stay lean. */
const MAX_BYTES = 512 * 1024
/** Only read the last window for support dumps — never the whole file. */
const TAIL_READ_BYTES = 48 * 1024

type LogLevel = 'debug' | 'info'

let fd: fs.WriteStream | null = null

export function logFilePath(): string {
  return LOG_FILE()
}

/** Last N lines of main.log for support reports (empty string if unavailable). */
export function readLogTail(maxLines = 80): string {
  try {
    const file = LOG_FILE()
    if (!fs.existsSync(file)) return ''
    const st = fs.statSync(file)
    const start = Math.max(0, st.size - TAIL_READ_BYTES)
    const len = st.size - start
    if (len <= 0) return ''
    const buf = Buffer.alloc(len)
    const fh = fs.openSync(file, 'r')
    try {
      fs.readSync(fh, buf, 0, len, start)
    } finally {
      fs.closeSync(fh)
    }
    const text = buf.toString('utf8')
    const lines = text.split('\n')
    if (lines.length > 0 && lines[0] !== '' && start > 0) lines.shift()
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines.slice(-maxLines).join('\n')
  } catch {
    return ''
  }
}

function ensureOpen(): fs.WriteStream | null {
  if (fd) return fd
  try {
    fs.mkdirSync(LOG_DIR(), { recursive: true })
    if (fs.existsSync(LOG_FILE()) && fs.statSync(LOG_FILE()).size > MAX_BYTES) {
      fs.renameSync(LOG_FILE(), `${LOG_FILE()}.old`)
    }
    fd = fs.createWriteStream(LOG_FILE(), { flags: 'a' })
  } catch {
    return null
  }
  return fd
}

function ts(): string {
  return new Date().toISOString()
}

function packaged(): boolean {
  return Boolean(app?.isPackaged)
}

function write(level: LogLevel, scope: string, message: string, ...rest: unknown[]): void {
  // Packaged builds skip debug — saves disk + CPU on chatty discovery/health paths.
  if (level === 'debug' && packaged()) return

  const body = rest.length > 0 ? format(message, ...rest) : message
  const out = ensureOpen()
  const line = `[${ts()}] [${scope}] ${body}\n`
  if (out) out.write(line)
  // Packaged Electron: skip console mirror. Selfcheck/dev (no app): keep it.
  if (!packaged()) {
    // eslint-disable-next-line no-console
    console.log(`[hb] [${scope}] ${body}`)
  }
}

/** Info-level log (always persisted). Default for state transitions / failures. */
export function log(scope: string, message: string, ...rest: unknown[]): void {
  write('info', scope, message, ...rest)
}

/** Debug-level log (dev + unpackaged only). Use for tick/probe chatter. */
export function logDebug(scope: string, message: string, ...rest: unknown[]): void {
  write('debug', scope, message, ...rest)
}
