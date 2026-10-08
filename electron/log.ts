import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const LOG_DIR = () => path.join(app.getPath('logs'), 'Happ Bridge')
const LOG_FILE = () => path.join(LOG_DIR(), 'main.log')
const MAX_BYTES = 4 * 1024 * 1024

let fd: fs.WriteStream | null = null

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
  const extra = rest.length > 0 ? ` ${rest.map((r) => (typeof r === 'string' ? r : safeJson(r))).join(' ')}` : ''
  const line = `[${ts()}] [${scope}] ${message}${extra}\n`
  if (out) out.write(line)
  // still mirror to console so packaged logs can be captured via stderr
  // eslint-disable-next-line no-console
  console.log(`[hb] [${scope}] ${message}${extra}`)
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v)
    return s === undefined ? String(v) : s
  } catch {
    return String(v)
  }
}