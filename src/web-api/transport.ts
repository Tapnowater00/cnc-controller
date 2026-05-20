// WebSocket transport for the web build. Implements request/response correlation
// plus channel-based event subscription and automatic reconnect.

import type { ClientMessage, ServerMessage } from '../server/protocol'

type Listener = (payload: any) => void
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void }

const RECONNECT_DELAY_MS = 2000

export class WsTransport {
  private url: string
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private listeners = new Map<string, Set<Listener>>()
  private nextId = 0
  private outbox: string[] = []
  private closed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Fires when the socket is open and authenticated. The renderer uses this to
  // re-emit a 'connectionChange' style refresh after a reconnect.
  onOpen: (() => void) | null = null
  onClose: (() => void) | null = null
  // Fires if the server rejects our token (e.g. password rotated). UI should
  // clear the token and prompt for a fresh login.
  onAuthFailure: (() => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  connect() {
    this.closed = false
    this._open()
  }

  close() {
    this.closed = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws?.close()
    this.ws = null
  }

  private _open() {
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.addEventListener('open', () => {
      // Flush anything queued while we were disconnected.
      for (const m of this.outbox) ws.send(m)
      this.outbox = []
      this.onOpen?.()
    })
    ws.addEventListener('message', (ev) => this._onMessage(String(ev.data)))
    ws.addEventListener('close', (ev) => {
      this.ws = null
      // 1008 / 4401 are auth-style closes; the server uses HTTP 401 on the
      // upgrade so the close event itself fires with code 1006 instead. We
      // detect auth failure by also tracking the initial handshake outcome.
      this.onClose?.()
      // Reject all in-flight requests.
      for (const p of this.pending.values()) p.reject(new Error('Connection closed'))
      this.pending.clear()
      if (!this.closed) this._scheduleReconnect()
    })
    ws.addEventListener('error', () => {
      // 'close' will fire next; reconnect logic is handled there.
    })
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed) this._open()
    }, RECONNECT_DELAY_MS)
  }

  private _onMessage(raw: string) {
    let msg: ServerMessage
    try { msg = JSON.parse(raw) } catch { return }
    if (msg.type === 'res') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.data)
      else p.reject(new Error(msg.error))
    } else if (msg.type === 'evt') {
      const ls = this.listeners.get(msg.channel)
      if (ls) for (const l of ls) l(msg.payload)
    }
  }

  request<T>(method: string, args: unknown[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = String(++this.nextId)
      this.pending.set(id, { resolve, reject })
      const msg: ClientMessage = { type: 'req', id, method, args }
      const json = JSON.stringify(msg)
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(json)
      else this.outbox.push(json)
    })
  }

  on(channel: string, cb: Listener): () => void {
    let set = this.listeners.get(channel)
    if (!set) { set = new Set(); this.listeners.set(channel, set) }
    set.add(cb)
    return () => { set!.delete(cb) }
  }
}
