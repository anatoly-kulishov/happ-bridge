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

/**
 * One abort listener per AbortSignal, many sockets.
 * Avoids MaxListenersExceededWarning under scan concurrency ≫ 10.
 */
const abortSockets = new WeakMap<AbortSignal, Set<net.Socket>>()

function trackAbortSocket(signal: AbortSignal | undefined, socket: net.Socket): () => void {
  if (!signal) return () => undefined
  let set = abortSockets.get(signal)
  if (!set) {
    set = new Set()
    abortSockets.set(signal, set)
    signal.addEventListener(
      'abort',
      () => {
        for (const s of set!) s.destroy()
        set!.clear()
      },
      { once: true },
    )
  }
  set.add(socket)
  return () => {
    set!.delete(socket)
  }
}

/** Forwards localhost SOCKS/HTTP to a phone IP. Binds only 127.0.0.1. */
export class ProxyRelay {
  private phoneIp: string | null = null
  private socksServer: net.Server | null = null
  private httpServer: net.Server | null = null
  private pipes = new Set<ActivePipe>()
  private ports: RelayPorts
  private bound: RelayPorts | null = null
  private onError: RelayErrorHandler | null
  private lastTrafficAt = 0
  private startLock: Promise<void> = Promise.resolve()

  constructor(ports: RelayPorts, onError?: RelayErrorHandler) {
    this.ports = ports
    this.onError = onError ?? null
  }

  get targetIp(): string | null {
    return this.phoneIp
  }

  get lastTrafficMs(): number {
    return this.lastTrafficAt
  }

  isListening(): boolean {
    return Boolean(this.socksServer?.listening && this.httpServer?.listening)
  }

  setPorts(ports: RelayPorts): void {
    this.ports = ports
  }

  /** Soft switch / soft-clear: keep listeners; null stops new pipes. */
  setPhoneIp(phoneIp: string | null): void {
    this.phoneIp = phoneIp
  }

  /**
   * Ensure listeners are up for current ports and point at phoneIp.
   * Concurrent starts are serialized. Failed bind rolls back fully.
   */
  async start(phoneIp: string): Promise<void> {
    const run = this.startLock.then(() => this.startExclusive(phoneIp))
    // Keep the chain alive after failures so later starts still queue.
    this.startLock = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async startExclusive(phoneIp: string): Promise<void> {
    if (this.ports.socksPort === this.ports.httpPort) {
      await this.stop()
      throw new Error('socksPort and httpPort must differ')
    }

    const portsMatch =
      this.bound?.socksPort === this.ports.socksPort &&
      this.bound?.httpPort === this.ports.httpPort

    if (this.isListening() && portsMatch) {
      this.phoneIp = phoneIp
      return
    }

    await this.stop()
    this.phoneIp = phoneIp

    try {
      this.socksServer = this.listen(this.ports.socksPort)
      this.httpServer = this.listen(this.ports.httpPort)
      await Promise.all([
        waitListen(this.socksServer),
        waitListen(this.httpServer),
      ])
      this.bound = { ...this.ports }
    } catch (err) {
      await this.stop()
      throw err
    }
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
    this.bound = null
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

      // Only remote bytes prove the phone is alive (client can write into a blackhole).
      const mark = () => {
        this.lastTrafficAt = Date.now()
      }
      remote.on('data', mark)

      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
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

/** Bare TCP connect (listener up?). Not Happ identity. */
export function probePort(
  host: string,
  port: number,
  timeoutMs = 400,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }

    const socket = net.connect({ host, port })
    let settled = false
    const untrack = trackAbortSocket(signal, socket)

    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      untrack()
      socket.destroy()
      resolve(ok)
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}

/**
 * Happ identity: SOCKS5 greeting must get a 2-byte method reply.
 * Bare TCP accept / echo / silence ⇒ false.
 */
export function probeSocks5(
  host: string,
  port: number,
  timeoutMs = 400,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }

    const socket = net.connect({ host, port })
    let settled = false
    let buf = Buffer.alloc(0)
    const untrack = trackAbortSocket(signal, socket)

    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      untrack()
      socket.destroy()
      resolve(ok)
    }

    socket.setTimeout(timeoutMs)

    socket.on('connect', () => {
      // VER=5, NMETHODS=1, METHOD=no-auth
      socket.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (buf.length < 2) return
      // Exact SOCKS5 reply: VER + METHOD. Reject echoes (3+ bytes of our greeting).
      const ver = buf[0]
      const method = buf[1]
      const methodOk = method === 0x00 || method === 0x02 || method === 0xff
      done(ver === 0x05 && methodOk && buf.length === 2)
    })

    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
    socket.on('close', () => done(false))
  })
}
