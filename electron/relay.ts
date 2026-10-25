import net from 'node:net'
import { log } from './log'

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

export function trackAbortSocket(signal: AbortSignal | undefined, socket: net.Socket): () => void {
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

  /** Soft switch / soft-clear: keep listeners; drop live pipes when target changes. */
  setPhoneIp(phoneIp: string | null): void {
    if (phoneIp === this.phoneIp) return
    log('relay', 'target %s → %s (keep listeners)', this.phoneIp ?? '(null)', phoneIp ?? '(null)')
    this.dropPipes()
    this.phoneIp = phoneIp
  }

  /**
   * Ensure listeners are up for current ports and point at phoneIp
   * (null = fail-open: serve SOCKS5 directly over the Mac's uplink).
   * Concurrent starts are serialized. Failed bind rolls back fully.
   */
  async start(phoneIp: string | null): Promise<void> {
    const run = this.startLock.then(() => this.startExclusive(phoneIp))
    // Keep the chain alive after failures so later starts still queue.
    this.startLock = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async startExclusive(phoneIp: string | null): Promise<void> {
    if (this.ports.socksPort === this.ports.httpPort) {
      await this.stop()
      throw new Error('socksPort and httpPort must differ')
    }

    const portsMatch =
      this.bound?.socksPort === this.ports.socksPort &&
      this.bound?.httpPort === this.ports.httpPort

    if (this.isListening() && portsMatch) {
      log('relay', 'start(target=%s): already listening on socks=%d http=%d — soft switch',
        phoneIp, this.ports.socksPort, this.ports.httpPort)
      this.setPhoneIp(phoneIp)
      return
    }

    await this.stop()
    this.phoneIp = phoneIp

    try {
      // Happ LAN is SOCKS5 on socksPort; local HTTP port is a second entry that
      // still tunnels to the same remote SOCKS (phone has no separate :httpPort).
      this.socksServer = this.listen(this.ports.socksPort, this.ports.socksPort)
      this.httpServer = this.listen(this.ports.httpPort, this.ports.socksPort)
      await Promise.all([
        waitListen(this.socksServer),
        waitListen(this.httpServer),
      ])
      this.bound = { ...this.ports }
      log('relay', 'listening target=%s socks=127.0.0.1:%d http=127.0.0.1:%d',
        phoneIp, this.ports.socksPort, this.ports.httpPort)
    } catch (err) {
      log('relay', 'start FAILED target=%s err=%s', phoneIp, err instanceof Error ? err.message : String(err))
      await this.stop()
      throw err
    }
  }

  async stop(): Promise<void> {
    if (this.socksServer || this.httpServer || this.phoneIp) {
      log('relay', 'stop (was listening=%s target=%s)', this.isListening(), this.phoneIp)
    }
    this.dropPipes()
    await Promise.all([closeServer(this.socksServer), closeServer(this.httpServer)])
    this.socksServer = null
    this.httpServer = null
    this.phoneIp = null
    this.bound = null
  }

  /** Kill live pipes but keep listeners (sleep / resume). */
  dropConnections(): void {
    this.dropPipes()
  }

  private dropPipes(): void {
    for (const pipe of this.pipes) {
      pipe.client.destroy()
      pipe.remote.destroy()
    }
    this.pipes.clear()
  }

  private listen(localPort: number, remotePort: number): net.Server {
    const server = net.createServer((client) => {
      if (!this.phoneIp) {
        // Fail-open: no phone target (disconnected / not found yet). Serve
        // SOCKS5 locally and dial the destination over the Mac's own uplink,
        // so clients pinned to 127.0.0.1:<port> (CLIs, system proxy) keep
        // working instead of hanging/failing.
        this.handleFailOpenSocks(client, localPort)
        return
      }
      const target = this.phoneIp

      const remote = net.connect({ host: target, port: remotePort }, () => {
        client.pipe(remote)
        remote.pipe(client)
        log('relay', 'pipe :%d → %s:%d established (%d live)',
          localPort, target, remotePort, this.pipes.size + 1)
      })

      // Fail fast when the phone is asleep / unreachable (macOS default can hang ~75s).
      remote.setTimeout(REMOTE_CONNECT_MS)
      remote.once('timeout', () => {
        log('relay', 'pipe :%d → %s:%d TIMEOUT (phone not accepting)',
          localPort, target, remotePort)
        remote.destroy()
        client.destroy()
      })
      remote.once('connect', () => {
        remote.setTimeout(0)
      })

      try {
        client.setNoDelay(true)
        client.setKeepAlive(true, KEEP_ALIVE_MS)
        remote.setNoDelay(true)
        remote.setKeepAlive(true, KEEP_ALIVE_MS)
      } catch {
        // ignore - some platforms reject keepAlive before connect
      }

      const pipe: ActivePipe = { client, remote }

      // Only remote bytes prove the phone is alive (client can write into a blackhole).
      const mark = () => {
        if (this.lastTrafficAt === 0) {
          log('relay', 'pipe :%d → %s first remote data (phone alive)', localPort, target)
        }
        this.lastTrafficAt = Date.now()
      }
      remote.on('data', mark)

      let cleaned = false
      const cleanup = (e?: Error) => {
        if (cleaned) return
        cleaned = true
        if (e && !e.message.includes('ECONNRESET') && !e.message.includes('EPIPE')) {
          const code = (e as NodeJS.ErrnoException).code
          log('relay', 'pipe :%d → %s closed code=%s err=%s', localPort, target, code ?? '-', e.message)
        }
        this.pipes.delete(pipe)
        client.destroy()
        remote.destroy()
      }

      remote.on('error', (err) => cleanup(err))
      client.on('error', cleanup)
      client.on('close', cleanup)
      remote.on('close', cleanup)

      this.pipes.add(pipe)
    })

    server.on('error', (err) => this.onError?.(err))
    server.listen(localPort, '127.0.0.1')
    return server
  }

  /**
   * Minimal SOCKS5 server for fail-open mode: greet → (optional
   * username/password, accepted unconditionally) → CONNECT → direct dial.
   * Also answers plain HTTP-proxy `CONNECT host:port HTTP/1.1` — some native
   * apps (ChatGPT.app) talk HTTP-proxy instead of SOCKS5.
   * Deliberately does NOT touch lastTrafficAt — direct traffic does not
   * prove the phone is alive.
   */
  private handleFailOpenSocks(client: net.Socket, localPort: number): void {
    log('relay', 'inbound :%d — no phone target, fail-open direct SOCKS5', localPort)
    let buf = Buffer.alloc(0)
    let stage: 'greet' | 'auth' | 'req' | 'done' = 'greet'
    let remote: net.Socket | null = null

    const destroy = () => {
      client.destroy()
      remote?.destroy()
    }
    client.setTimeout(10_000, destroy)
    client.on('error', destroy)

    const openTunnel = (host: string, dport: number, leftover: Buffer | null, okReply: string): void => {
      stage = 'done'
      const r = net.connect({ host, port: dport })
      remote = r
      r.once('connect', () => {
        client.write(okReply)
        if (leftover && leftover.length > 0) r.write(leftover)
        client.pipe(r)
        r.pipe(client)
        log('relay', 'fail-open :%d → %s:%d (direct, Mac uplink)', localPort, host, dport)
      })
      r.once('error', destroy)
      client.setTimeout(0)
    }

    client.on('data', (chunk) => {
      if (stage === 'done') return // tunneled data — pipe handles it
      buf = Buffer.concat([buf, chunk])
      try {
        if (stage === 'greet') {
          if (buf.length < 2) return
          if (buf[0] !== 0x05) {
            // Not SOCKS: try to parse an HTTP-proxy CONNECT request.
            const end = buf.indexOf('\r\n\r\n')
            if (end === -1) {
              if (buf.length > 8 * 1024) return destroy()
              return
            }
            const firstLine = buf.subarray(0, buf.indexOf('\r\n')).toString('utf8')
            const m = /^CONNECT\s+([^\s:]+):(\d+)\s+HTTP\/1\.[01]$/.exec(firstLine)
            if (!m) return destroy()
            const leftover = buf.subarray(end + 4)
            buf = Buffer.alloc(0)
            openTunnel(m[1], Number(m[2]), leftover, 'HTTP/1.1 200 Connection established\r\n\r\n')
            return
          }
          const n = buf[1]
          if (buf.length < 2 + n) return
          const methods = [...buf.subarray(2, 2 + n)]
          buf = Buffer.alloc(0)
          if (methods.includes(0x00)) {
            client.write(Buffer.from([0x05, 0x00]))
            stage = 'req'
          } else if (methods.includes(0x02)) {
            client.write(Buffer.from([0x05, 0x02]))
            stage = 'auth'
          } else {
            client.write(Buffer.from([0x05, 0xff]))
            client.end()
          }
          return
        }

        if (stage === 'auth') {
          // ver, ulen, user, plen, pass — accepted unconditionally.
          if (buf.length < 2) return
          const ulen = buf[1]
          if (buf.length < 2 + ulen + 1) return
          const plen = buf[2 + ulen]
          if (buf.length < 3 + ulen + plen) return
          buf = Buffer.alloc(0)
          client.write(Buffer.from([0x01, 0x00]))
          stage = 'req'
          return
        }

        if (buf.length < 7) return
        if (buf[0] !== 0x05) return destroy()
        const cmd = buf[1]
        const atyp = buf[3]
        let host: string
        let off: number
        if (atyp === 0x01) {
          if (buf.length < 10) return
          host = [buf[4], buf[5], buf[6], buf[7]].join('.')
          off = 10
        } else if (atyp === 0x03) {
          const len = buf[4]
          if (buf.length < 7 + len) return
          host = buf.subarray(5, 5 + len).toString('utf8')
          off = 7 + len
        } else if (atyp === 0x04) {
          if (buf.length < 22) return
          host = (Buffer.from(buf.subarray(4, 20)).toString('hex').match(/.{4}/g) ?? []).join(':')
          off = 22
        } else {
          client.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0]))
          return destroy()
        }
        const dport = buf.readUInt16BE(off - 2)
        const leftover = buf.length > off + 2 ? buf.subarray(off + 2) : null
        buf = Buffer.alloc(0)

        if (cmd !== 0x01) {
          // 0x07 — command not supported
          client.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0]))
          return destroy()
        }

        openTunnel(host, dport, leftover, '\u0005\u0000\u0000\u0001\u0000\u0000\u0000\u0000\u0000')
      } catch {
        destroy()
      }
    })
  }
}

const REMOTE_CONNECT_MS = 5_000
const KEEP_ALIVE_MS = 15_000

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
    const s = server as net.Server & { closeAllConnections?: () => void }
    s.closeAllConnections?.()
    server.close(() => resolve())
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
      clearTimeout(hardTimer)
      untrack()
      socket.destroy()
      resolve(ok)
    }

    // OS connect to filtered hosts can ignore socket.setTimeout — hard cap.
    const hardTimer = setTimeout(() => done(false), timeoutMs)
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}

/**
 * Happ identity: SOCKS5 greeting must get a 2-byte method reply.
 * With auth: require method 0x02 and successful RFC1929 login (anti-spoof).
 * Bare TCP accept / echo / silence ⇒ false.
 */
export type SocksAuth = { user: string; pass: string }

export function probeSocks5(
  host: string,
  port: number,
  timeoutMs = 400,
  signal?: AbortSignal,
  auth?: SocksAuth | null,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }

    const socket = net.connect({ host, port })
    let settled = false
    let buf = Buffer.alloc(0)
    let phase: 'greeting' | 'auth' = 'greeting'
    const untrack = trackAbortSocket(signal, socket)

    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(hardTimer)
      untrack()
      socket.destroy()
      resolve(ok)
    }

    const hardTimer = setTimeout(() => done(false), timeoutMs)
    socket.setTimeout(timeoutMs)

    socket.on('connect', () => {
      if (auth) {
        // Only user/pass — open no-auth SOCKS fails when credentials are set.
        socket.write(Buffer.from([0x05, 0x01, 0x02]))
      } else {
        // VER=5, NMETHODS=1, METHOD=no-auth
        socket.write(Buffer.from([0x05, 0x01, 0x00]))
      }
    })

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])

      if (phase === 'greeting') {
        if (buf.length < 2) return
        const ver = buf[0]
        const method = buf[1]
        if (ver !== 0x05 || buf.length !== 2) {
          done(false)
          return
        }

        if (!auth) {
          // Only no-auth or user/pass offered — 0xff is rejection, not Happ.
          done(method === 0x00 || method === 0x02)
          return
        }

        if (method !== 0x02) {
          done(false)
          return
        }

        const u = Buffer.from(auth.user, 'utf8')
        const p = Buffer.from(auth.pass, 'utf8')
        if (u.length > 255 || p.length > 255) {
          done(false)
          return
        }

        phase = 'auth'
        buf = Buffer.alloc(0)
        socket.write(
          Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]),
        )
        return
      }

      if (buf.length < 2) return
      done(buf[0] === 0x01 && buf[1] === 0x00 && buf.length === 2)
    })

    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
    socket.on('close', () => done(false))
  })
}

/**
 * End-to-end LAN auth check against a Happ SOCKS5 peer.
 * Unlike probeSocks5, distinguishes "Happ requires a password" (0x02 without
 * creds) and "Happ rejected the password" from a plain reachable peer —
 * so the UI never shows «Подключено» for a proxy that will drop traffic.
 */
export type ProxyAuthCheck = 'ok' | 'auth-required' | 'auth-failed' | 'unreachable'

export function checkProxyAuth(
  host: string,
  port: number,
  timeoutMs = 1000,
  auth?: SocksAuth | null,
): Promise<ProxyAuthCheck> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family: 4 })
    let settled = false

    const done = (result: ProxyAuthCheck) => {
      if (settled) return
      settled = true
      clearTimeout(hardTimer)
      socket.destroy()
      resolve(result)
    }

    const hardTimer = setTimeout(() => done('unreachable'), timeoutMs)
    socket.setTimeout(timeoutMs)

    // Helper: register a ONE-TIME data listener BEFORE writing, then write.
    // This avoids missing a server reply that arrives before the listener is attached.
    const writeAndWait = (
      data: Buffer,
      accept: (buf: Buffer) => ProxyAuthCheck | null,
    ): void => {
      if (settled) return
      socket.once('data', (chunk) => {
        if (settled) return
        const result = accept(Buffer.from(chunk))
        if (result !== null) done(result)
        else done('unreachable')
      })
      if (settled) return
      socket.write(data)
    }

    socket.on('connect', () => {
      if (settled) return

      // Step 1: SOCKS5 greeting
      writeAndWait(Buffer.from([0x05, 0x01, auth ? 0x02 : 0x00]), (buf) => {
        if (buf.length < 2) return null
        const ver = buf[0]
        const method = buf[1]
        if (ver !== 0x05 || (method !== 0x00 && method !== 0x02)) return 'unreachable'
        if (method === 0x00) return 'ok' // no-auth peer
        if (!auth) return 'auth-required' // auth required but no creds provided
        if (method === 0x02) {
          // Step 2: RFC1929 credentials
          const u = Buffer.from(auth.user, 'utf8')
          const p = Buffer.from(auth.pass, 'utf8')
          if (u.length > 255 || p.length > 255) return 'auth-failed'
          const creds = Buffer.concat([
            Buffer.from([0x01, u.length]),
            u,
            Buffer.from([p.length]),
            p,
          ])
          // Credentials sent → wait for auth reply (fresh once)
          writeAndWait(creds, (b) => {
            if (b.length < 2) return null
            return b[0] === 0x01 && b[1] === 0x00 ? 'ok' : 'auth-failed'
          })
          return null // async; result via writeAndWait's once
        }
        return 'unreachable'
      })
    })

    socket.on('timeout', () => done('unreachable'))
    socket.on('error', () => done('unreachable'))
    socket.on('close', () => { if (!settled) done('unreachable') })
  })
}
