import fs from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'
import { app } from 'electron'

const LOG_DIR = () => path.join(app.getPath('logs'), 'Happ Bridge')
const LOG_FILE = () => path.join(LOG_DIR(), 'main.log')
const MAX_BYTES = 4 * 1024 * 1024

let fd: fs.WriteStream | null = null

export function logFilePath(): string {
  return LOG_FILE()
}

/** Last N lines of main.log for support reports (empty string if unavailable). */
export function readLogTail(maxLines = 250): string {
  try {
    const file = LOG_FILE()
    if (!fs.existsSync(file)) return ''
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n')
    // drop trailing empty from final newline
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

export function log(scope: string, message: string, ...rest: unknown[]): void {
  const out = ensureOpen()
  const body = rest.length > 0 ? format(message, ...rest) : message
  const line = `[${ts()}] [${scope}] ${body}\n`
  if (out) out.write(line)
  // still mirror to console so packaged logs can be captured via stderr
  // eslint-disable-next-line no-console
  console.log(`[hb] [${scope}] ${body}`)
}
