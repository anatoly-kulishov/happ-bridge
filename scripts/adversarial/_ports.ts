import net from 'node:net'

/** Reserve n free localhost ports (release before caller binds). */
export async function freePorts(n: number): Promise<number[]> {
  const servers: net.Server[] = []
  const ports: number[] = []
  for (let i = 0; i < n; i++) {
    const s = net.createServer()
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject)
      s.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = s.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    ports.push(addr.port)
    servers.push(s)
  }
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))))
  return ports
}
