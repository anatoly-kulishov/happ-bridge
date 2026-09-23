import net from 'node:net'

export type RelayPorts = {
  socksPort: number
  httpPort: number
}

type ActivePipe = {
  client: net.Socket
  remote: net.Socket
}

type RelayErrorHandler = (err: Error) => void

/** Forwards localhost SOCKS/HTTP to a phone IP. Binds only 127.0.0.1. */
export class ProxyRelay {
  private phoneIp: string | null = null
  private socksServer: net.Server | null = null
  private httpServer: net.Server | null = null
  private pipes = new Set<ActivePipe>()
  private ports: RelayPorts
  private onError: RelayErrorHandler | null

  constructor(ports: RelayPorts, onError?: RelayErrorHandler) {
    this.ports = ports
    this.onError = onError ?? null
  }

  get targetIp(): string | null {
    return this.phoneIp
  }

  setPorts(ports: RelayPorts): void {
    this.ports = ports
  }

  async start(phoneIp: string): Promise<void> {
    await this.stop()
    this.phoneIp = phoneIp
    this.socksServer = this.listen(this.ports.socksPort)
    this.httpServer = this.listen(this.ports.httpPort)
    await Promise.all([waitListen(this.socksServer), waitListen(this.httpServer)])
  }

  async stop(): Promise<void> {
    for (const pipe of this.pipes) {
      pipe.client.destroy()
      pipe.remote.destroy()
    }
    this.pipes.clear()
    await Promise.all([closeServer(this.socksServer), closeServer(this.httpServer)])
    this.socksServer = null
    this.httpServer = null
    this.phoneIp = null
  }

  private listen(port: number): net.Server {
    const server = net.createServer((client) => {
      if (!this.phoneIp) {
        client.destroy()
        return
      }

      const remote = net.connect({ host: this.phoneIp, port }, () => {
        client.pipe(remote)
        remote.pipe(client)
      })

      const pipe: ActivePipe = { client, remote }
      this.pipes.add(pipe)

      const cleanup = () => {
        this.pipes.delete(pipe)
        client.destroy()
        remote.destroy()
      }

      client.on('error', cleanup)
      remote.on('error', cleanup)
      client.on('close', cleanup)
      remote.on('close', cleanup)
    })

    server.on('error', (err) => this.onError?.(err))
    server.listen(port, '127.0.0.1')
    return server
  }
}

function waitListen(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve()
      return
    }
    server.once('listening', () => resolve())
    server.once('error', reject)
  })
}

function closeServer(server: net.Server | null): Promise<void> {
  if (!server) return Promise.resolve()
  return new Promise((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections?.()
  })
}

export function probePort(
  host: string,
  port: number,
  timeoutMs = 400,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let settled = false

    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}
