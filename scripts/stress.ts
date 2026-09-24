/**
 * Stress: run selfcheck + all adversarial scripts N rounds.
 * Usage: npx tsx scripts/stress.ts [rounds=3]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rounds = Math.max(1, Number(process.argv[2] || 3) || 3)

const scripts = [
  'scripts/selfcheck.ts',
  ...fs
    .readdirSync(path.join(root, 'scripts/adversarial'))
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .sort()
    .map((f) => path.join('scripts/adversarial', f)),
]

function run(script: string, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', script], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${script} timed out after ${timeoutMs}ms\n${out}`))
    }, timeoutMs)
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      out += String(d)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${script} exit ${code}\n${out}`))
    })
  })
}

async function runWithRetry(script: string): Promise<void> {
  try {
    await run(script)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('EADDRINUSE')) throw err
    await new Promise((r) => setTimeout(r, 150))
    await run(script)
  }
}

async function main() {
  console.log(`stress: ${scripts.length} scripts × ${rounds} rounds`)
  for (let r = 1; r <= rounds; r++) {
    console.log(`\n── round ${r}/${rounds} ──`)
    for (const s of scripts) {
      process.stdout.write(`  ${s} … `)
      await runWithRetry(s)
      console.log('ok')
      await new Promise((r) => setTimeout(r, 40))
    }
  }
  console.log(`\nstress ok (${scripts.length * rounds} runs)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
