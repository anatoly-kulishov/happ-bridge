/**
 * Contract: scan abort on first hit must not leave workers probing.
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { scanHosts } from '../../electron/discover'
import { probePort } from '../../electron/relay'

async function main() {
  const port = 49201 + Math.floor(Math.random() * 500)
  const server = await new Promise<net.Server>((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(port, '127.0.0.1', () => resolve(s))
  })

  // Use 127.0.0.x only — documentation NET blocks hang TCP connect on macOS.
  const hosts = [
    '127.0.0.2',
    '127.0.0.3',
    '127.0.0.4',
    '127.0.0.1',
    '127.0.0.5',
    '127.0.0.6',
  ]

  let completedAfterWinner = 0
  let winnerSeen = false

  const tryOne = async (
    ip: string,
    signal?: AbortSignal,
  ): Promise<string | null> => {
    if (signal?.aborted) return null
    const ok = await probePort(ip, port, 120, signal)
    if (signal?.aborted) return null
    if (winnerSeen) completedAfterWinner++
    if (ok) {
      winnerSeen = true
      return ip
    }
    return null
  }

  try {
    const winner = await scanHosts(hosts, tryOne, 4)
    assert.equal(winner, '127.0.0.1')
    assert.equal(
      completedAfterWinner,
      0,
      `workers kept probing after hit: ${completedAfterWinner} completions`,
    )
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
