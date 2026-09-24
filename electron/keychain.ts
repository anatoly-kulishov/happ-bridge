import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SERVICE = 'app.happbridge.desktop'
const ACCOUNT = 'lan-proxy-password'

export async function keychainGetPassword(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s',
      SERVICE,
      '-a',
      ACCOUNT,
      '-w',
    ])
    const value = stdout.replace(/\n$/, '')
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

/** Add or update LAN proxy password (-U updates in place). */
export async function keychainSetPassword(password: string): Promise<void> {
  await execFileAsync('security', [
    'add-generic-password',
    '-s',
    SERVICE,
    '-a',
    ACCOUNT,
    '-w',
    password,
    '-U',
  ])
}

export async function keychainDeletePassword(): Promise<void> {
  try {
    await execFileAsync('security', [
      'delete-generic-password',
      '-s',
      SERVICE,
      '-a',
      ACCOUNT,
    ])
  } catch {
    // nothing stored
  }
}
