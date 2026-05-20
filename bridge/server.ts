// Bridge server for Pi / local access.
// Run with: npx tsx bridge/server.ts
// Serves the web app from dist/web/ and a WebSocket serial bridge on /ws.

import { createServer } from 'node:http'
import { readFile, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { SerialManager } from '../src/main/serial/SerialManager'
import { GrblStreamer } from '../src/main/serial/GrblStreamer'

const PORT = Number(process.env.PORT ?? 3001)
const STATIC_DIR = path.join(__dirname, '..', 'dist', 'web')
const STORE_PATH = path.join(__dirname, '..', '.bridge-store.json')

// ── Simple file-backed key-value store ────────────────────────────────────────

function storeLoad(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function storeSave(data: Record<string, unknown>) {
  try { writeFileSync(STORE_PATH, JSON.stringify(data, null, 2)) } catch {}
}

const storeData = storeLoad()

const store = {
  get: (key: string) => storeData[key] ?? null,
  set: (key: string, value: unknown) => {
    storeData[key] = value
    storeSave(storeData)
  },
}

// ── Mime types ────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
}

// ── HTTP server (static SPA) ──────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  const rawPath = req.url?.split('?')[0] ?? '/'
  const ext = path.extname(rawPath)

  // Only serve static assets if dist/web exists; otherwise hint to build first
  if (!existsSync(STATIC_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('CNC Bridge running. Run "npm run build:web" and restart to serve the UI.')
    return
  }

  // For extensionless paths (SPA routes) fall back to index.html
  const filePath = ext
    ? path.join(STATIC_DIR, rawPath)
    : path.join(STATIC_DIR, 'index.html')

  readFile(filePath, (err, data) => {
    if (err) {
      // Try index.html as catch-all
      readFile(path.join(STATIC_DIR, 'index.html'), (_e2, d2) => {
        if (_e2) { res.writeHead(404); res.end('Not found'); return }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(d2)
      })
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/html' })
    res.end(data)
  })
})

// ── WebSocket bridge ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

wss.on('connection', (ws: WebSocket) => {
  const serial = new SerialManager()
  const streamer = new GrblStreamer(serial)

  function broadcast(channel: string, data?: unknown) {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'event', channel, data }))
  }

  serial.on('data', (line: string) => {
    broadcast('serial:data', line)
    if (line === 'ok') streamer.onOk()
  })
  serial.on('connectionChange', (connected: boolean) => broadcast('serial:connectionChange', connected))
  serial.on('error', (err: Error) => broadcast('serial:error', err.message))
  streamer.on('progress', (p: unknown) => broadcast('stream:progress', p))
  streamer.on('complete', () => broadcast('stream:complete'))
  streamer.on('error', (e: string) => broadcast('stream:error', e))

  ws.on('close', () => serial.disconnect().catch(() => {}))

  ws.on('message', async (raw: Buffer) => {
    let msg: { id: string; type: string; channel: string; args: unknown[] }
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (msg.type !== 'invoke') return

    const { id, channel, args } = msg

    function ok(result?: unknown) {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'response', id, result: result ?? null }))
    }
    function fail(error: string) {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'response', id, error }))
    }

    try {
      switch (channel) {
        case 'serial:listPorts':      ok(await serial.listPorts()); break
        case 'serial:connect':        await serial.connect(args[0] as string, args[1] as number); ok(); break
        case 'serial:disconnect':     await serial.disconnect(); ok(); break
        case 'serial:write':          serial.write(args[0] as string); ok(); break
        case 'serial:writeRealtime':  serial.writeRealtime(args[0] as number); ok(); break

        case 'stream:load':           streamer.load(args[0] as string[]); ok(); break
        case 'stream:start':          streamer.start(); ok(); break
        case 'stream:pause':          streamer.pause(); ok(); break
        case 'stream:resume':         streamer.resume(); ok(); break
        case 'stream:stop':           streamer.stop(); ok(); break

        case 'store:get':             ok(store.get(args[0] as string)); break
        case 'store:set':             store.set(args[0] as string, args[1]); ok(); break

        default: fail(`Unknown channel: ${channel}`)
      }
    } catch (err: any) {
      fail(err?.message ?? String(err))
    }
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`CNC Bridge running on http://0.0.0.0:${PORT}`)
  console.log(`WebSocket: ws://0.0.0.0:${PORT}/ws`)
})
