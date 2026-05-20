import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http'
import { createServer as createHttpsServer } from 'https'
import { readFileSync, createReadStream, statSync, existsSync } from 'fs'
import { join, extname, normalize, sep } from 'path'
import { WebSocketServer, WebSocket } from 'ws'
import { SerialManager } from '../main/serial/SerialManager'
import { GrblStreamer } from '../main/serial/GrblStreamer'
import { JsonStore } from './store'
import { hashPassword, verifyPassword, TokenStore, PasswordRecord } from './auth'
import type { ClientMessage, ResMessage, EvtMessage } from './protocol'

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'
const STORE_PATH = process.env.STORE_PATH ?? join(process.cwd(), 'data', 'store.json')
const STATIC_DIR = process.env.STATIC_DIR ?? join(__dirname, '../web')
const TLS_CERT = process.env.TLS_CERT
const TLS_KEY = process.env.TLS_KEY
// Initial password: read once from env. After first launch it's hashed into the store.
const INITIAL_PASSWORD = process.env.CNC_PASSWORD

const store = new JsonStore(STORE_PATH, {
  macros: [],
  machineProfiles: [],
  jobHistory: [],
  lastPort: '',
  lastBaud: 115200,
  preferences: {
    safeZ: 5,
    probeThickness: 15,
    probeApproachSpeed: 100,
    probeRetract: 2,
    autoConnect: false,
    units: 'mm',
  },
})

// Bootstrap the password record. If the store has none, hash CNC_PASSWORD into it.
// If CNC_PASSWORD is also missing, refuse to start — we will not run unauthenticated.
let pwRecord = store.get('_auth.password') as PasswordRecord | undefined
if (!pwRecord) {
  if (!INITIAL_PASSWORD) {
    console.error('No password set. Start the server once with CNC_PASSWORD=<your password> to seed it.')
    process.exit(1)
  }
  pwRecord = hashPassword(INITIAL_PASSWORD)
  store.set('_auth.password', pwRecord)
  console.log('Password initialised from CNC_PASSWORD and stored as a hash.')
}

const tokens = new TokenStore()
const serial = new SerialManager()
const streamer = new GrblStreamer(serial)

// Same wiring as Electron's main process.
serial.on('data', (line: string) => {
  broadcast({ type: 'evt', channel: 'serial:data', payload: line })
  if (line === 'ok') streamer.onOk()
  if (/^grblhal/i.test(line)) streamer.setFirmwareFamily('grblhal')
  else if (/^grbl\s/i.test(line) || /^grbl\[/i.test(line)) streamer.setFirmwareFamily('grbl')
})
serial.on('connectionChange', (connected: boolean) => {
  if (!connected) streamer.setFirmwareFamily('unknown')
  broadcast({ type: 'evt', channel: 'serial:connectionChange', payload: connected })
})
serial.on('error', (err: Error) => {
  broadcast({ type: 'evt', channel: 'serial:error', payload: err.message })
})
streamer.on('progress', (p) => broadcast({ type: 'evt', channel: 'stream:progress', payload: p }))
streamer.on('complete', () => broadcast({ type: 'evt', channel: 'stream:complete', payload: null }))
streamer.on('error', (e) => broadcast({ type: 'evt', channel: 'stream:error', payload: e }))

// ---------------- HTTP ----------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function safeJoin(base: string, target: string): string | null {
  const p = normalize(join(base, target))
  // Reject path-traversal — must stay under base.
  if (!p.startsWith(base + sep) && p !== base) return null
  return p
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const target = urlPath === '/' ? '/index.html' : urlPath
  const file = safeJoin(STATIC_DIR, target)
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    // SPA fallback so deep links work.
    const fallback = join(STATIC_DIR, 'index.html')
    if (existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] })
      createReadStream(fallback).pipe(res)
      return
    }
    res.writeHead(404)
    res.end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? '/'
  if (req.method === 'POST' && url === '/api/login') {
    try {
      const body = JSON.parse(await readBody(req)) as { password?: string }
      if (!body.password || !verifyPassword(body.password, pwRecord!)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid password' }))
        return
      }
      const token = tokens.issue()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ token }))
    } catch {
      res.writeHead(400); res.end('Bad request')
    }
    return
  }
  if (req.method === 'GET' && url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method === 'GET') {
    serveStatic(req, res)
    return
  }
  res.writeHead(405); res.end('Method not allowed')
}

const useHttps = TLS_CERT && TLS_KEY && existsSync(TLS_CERT) && existsSync(TLS_KEY)
const server = useHttps
  ? createHttpsServer({ cert: readFileSync(TLS_CERT!), key: readFileSync(TLS_KEY!) }, handleHttp)
  : createHttpServer(handleHttp)

// ---------------- WebSocket ----------------

const wss = new WebSocketServer({ noServer: true })
const clients = new Set<WebSocket>()

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname !== '/ws') { socket.destroy(); return }
  const token = url.searchParams.get('token')
  if (!tokens.isValid(token)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
    ws.on('message', (raw) => onClientMessage(ws, raw.toString()))
  })
})

function broadcast(msg: EvtMessage) {
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(json)
  }
}

async function onClientMessage(ws: WebSocket, raw: string) {
  let msg: ClientMessage
  try { msg = JSON.parse(raw) } catch { return }
  if (msg.type !== 'req') return
  const send = (r: ResMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(r))
  }
  try {
    const data = await dispatch(msg.method, msg.args)
    send({ type: 'res', id: msg.id, ok: true, data })
  } catch (err: any) {
    send({ type: 'res', id: msg.id, ok: false, error: err?.message ?? String(err) })
  }
}

async function dispatch(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'serial.listPorts': return serial.listPorts()
    case 'serial.connect':   return serial.connect(args[0] as string, args[1] as number)
    case 'serial.disconnect': return serial.disconnect()
    case 'serial.write':     serial.write(args[0] as string); return
    case 'serial.writeRealtime': serial.writeRealtime(args[0] as number); return
    case 'stream.load':      streamer.load(args[0] as string[]); return
    case 'stream.start':     streamer.start(); return
    case 'stream.pause':     streamer.pause(); return
    case 'stream.resume':    streamer.resume(); return
    case 'stream.stop':      streamer.stop(); return
    case 'store.get':        return store.get(args[0] as string)
    case 'store.set':        store.set(args[0] as string, args[1]); return
    // Updater is desktop-only; web returns a stable "up-to-date" status.
    case 'updater.check':    return
    case 'updater.install':  return
    case 'updater.openReleasePage': return
    case 'updater.getStatus':   return { state: 'up-to-date' }
    case 'updater.getVersion':  return process.env.npm_package_version ?? 'web'
    default: throw new Error(`Unknown method: ${method}`)
  }
}

// ---------------- start ----------------

server.listen(PORT, HOST, () => {
  console.log(`CNC Controller server listening on ${useHttps ? 'https' : 'http'}://${HOST}:${PORT}`)
  if (!useHttps) {
    console.log('Running over plain HTTP. For exposure beyond LAN, terminate TLS at a reverse proxy / tunnel or set TLS_CERT and TLS_KEY.')
  }
})

const shutdown = async () => {
  console.log('Shutting down...')
  await serial.disconnect().catch(() => {})
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
