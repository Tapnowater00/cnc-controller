// Implements window.api for browser contexts (no Electron).
//
// Mode selection (happens once on initWebApi):
//   hosted URL + Chrome/Edge  → Web Serial API  (no bridge app needed)
//   hosted URL + other        → WebSocket bridge (ws://localhost:3001/ws)
//   local / LAN / Pi          → WebSocket bridge (ws://<same-host>/ws)

function isLocalNetwork(): boolean {
  const h = window.location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || // Tailscale CGNAT
    /^\d+\.\d+\.\d+\.\d+$/.test(h)  // any raw IP → treat as direct bridge
  )
}

function resolveWsUrl(): string {
  if (isLocalNetwork()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }
  return 'ws://localhost:3001/ws'
}

// ── Web Serial shim ───────────────────────────────────────────────────────────

function installWebSerialApi(): void {
  let port: any = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let readActive = false

  // Simple event bus
  const listeners = new Map<string, Set<(data: any) => void>>()
  function emit(ch: string, data?: any) {
    listeners.get(ch)?.forEach(cb => cb(data))
  }
  function on(ch: string, cb: (data: any) => void): () => void {
    if (!listeners.has(ch)) listeners.set(ch, new Set())
    listeners.get(ch)!.add(cb)
    return () => listeners.get(ch)?.delete(cb)
  }

  function rawWrite(text: string) {
    if (!writer) return
    writer.write(new TextEncoder().encode(text.endsWith('\n') ? text : text + '\n')).catch(() => {})
  }

  // ok-wait streamer state
  let streamLines: string[] = []
  let streamIdx = 0
  let streaming = false
  let streamPaused = false
  let streamStart = 0

  function advanceStream() {
    if (!streaming || streamPaused || streamIdx >= streamLines.length) {
      if (streaming && streamIdx >= streamLines.length) {
        streaming = false
        emit('stream:complete')
      }
      return
    }
    const line = streamLines[streamIdx++]
    const elapsed = (Date.now() - streamStart) / 1000
    const rate = elapsed > 0 ? streamIdx / elapsed : 0
    emit('stream:progress', {
      current: streamIdx,
      total: streamLines.length,
      eta: rate > 0 ? Math.round((streamLines.length - streamIdx) / rate) : 0,
    })
    rawWrite(line)
  }

  async function startReadLoop() {
    const decoder = new TextDecoder()
    let buf = ''
    try {
      const reader = port.readable!.getReader()
      while (readActive) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const raw of lines) {
          const line = raw.trim()
          if (!line) continue
          emit('serial:data', line)
          if (line === 'ok' && streaming) advanceStream()
        }
      }
      reader.releaseLock()
    } catch {
      emit('serial:error', 'Serial read error')
      emit('serial:connectionChange', false)
    }
  }

  // Simple localStorage store
  function storeGet(key: string) {
    try { return JSON.parse(localStorage.getItem(`cnc:${key}`) ?? 'null') } catch { return null }
  }
  function storeSet(key: string, value: unknown) {
    localStorage.setItem(`cnc:${key}`, JSON.stringify(value))
  }

  ;(window as any).api = {
    serial: {
      listPorts: async () => [],   // browser doesn't list — user picks in the OS dialog
      connect: async (_path: string, baud: number) => {
        port = await (navigator as any).serial.requestPort()
        await port.open({ baudRate: baud })
        writer = port.writable.getWriter()
        readActive = true
        startReadLoop()
        emit('serial:connectionChange', true)
      },
      disconnect: async () => {
        readActive = false
        streaming = false
        try { writer?.releaseLock() } catch {}
        writer = null
        try { await port?.close() } catch {}
        port = null
        emit('serial:connectionChange', false)
      },
      write: async (data: string) => rawWrite(data),
      writeRealtime: async (byte: number) => {
        writer?.write(new Uint8Array([byte])).catch(() => {})
      },
      onData:             (cb: (l: string) => void)    => on('serial:data', cb),
      onConnectionChange: (cb: (c: boolean) => void)   => on('serial:connectionChange', cb),
      onError:            (cb: (m: string) => void)    => on('serial:error', cb),
    },
    stream: {
      load: async (lines: string[]) => {
        streamLines = lines; streamIdx = 0; streaming = false
      },
      start: async () => {
        streaming = true; streamPaused = false; streamIdx = 0
        streamStart = Date.now()
        advanceStream()
      },
      pause: async () => {
        streamPaused = true
        writer?.write(new Uint8Array([0x21])).catch(() => {})  // feed hold
      },
      resume: async () => {
        streamPaused = false
        writer?.write(new Uint8Array([0x7e])).catch(() => {})  // cycle start
        advanceStream()
      },
      stop: async () => {
        streaming = false
        writer?.write(new Uint8Array([0x21])).catch(() => {})
        setTimeout(() => writer?.write(new Uint8Array([0x18])).catch(() => {}), 200)
      },
      onProgress: (cb: (p: any) => void) => on('stream:progress', cb),
      onComplete: (cb: () => void)        => on('stream:complete', cb),
      onError:    (cb: (e: string) => void) => on('stream:error', cb),
    },
    store: {
      get: async (key: string) => storeGet(key),
      set: async (key: string, value: unknown) => storeSet(key, value),
    },
    dialog: {
      openFileContent: async () => new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.nc,.gcode,.gc,.ngc,.tap,.cnc,.txt'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) { resolve(null); return }
          resolve({ path: file.name, content: await file.text() })
        }
        input.click()
      }),
    },
    updater: {
      check: async () => {},
      install: async () => {},
      openReleasePage: async () => {},
      getStatus: async () => ({ state: 'up-to-date' }),
      getVersion: async () => 'web',
      onStatus: () => () => {},
    },
  }
}

// ── WebSocket bridge shim ─────────────────────────────────────────────────────

function installWebSocketApi(wsUrl: string): Promise<void> {
  return new Promise((resolveReady, rejectReady) => {
    const ws = new WebSocket(wsUrl)
    const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>()
    const listeners = new Map<string, Set<(data: any) => void>>()

    function on(ch: string, cb: (data: any) => void): () => void {
      if (!listeners.has(ch)) listeners.set(ch, new Set())
      listeners.get(ch)!.add(cb)
      return () => listeners.get(ch)?.delete(cb)
    }

    function invoke(channel: string, ...args: any[]): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2)
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, type: 'invoke', channel, args }))
      })
    }

    ws.onopen = () => resolveReady()
    ws.onerror = () => rejectReady(new Error('Bridge WebSocket failed — is the CNC Bridge running?'))

    ws.onmessage = (event: MessageEvent) => {
      let msg: any
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.type === 'response') {
        const p = pending.get(msg.id)
        if (p) {
          msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result)
          pending.delete(msg.id)
        }
      } else if (msg.type === 'event') {
        listeners.get(msg.channel)?.forEach(cb => cb(msg.data))
      }
    }

    // File dialog must live in the browser regardless of bridge mode
    function openFileContent(): Promise<{ path: string; content: string } | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.nc,.gcode,.gc,.ngc,.tap,.cnc,.txt'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) { resolve(null); return }
          resolve({ path: file.name, content: await file.text() })
        }
        input.click()
      })
    }

    ;(window as any).api = {
      serial: {
        listPorts:          ()           => invoke('serial:listPorts'),
        connect:            (p, b)       => invoke('serial:connect', p, b),
        disconnect:         ()           => invoke('serial:disconnect'),
        write:              (d)          => invoke('serial:write', d),
        writeRealtime:      (b)          => invoke('serial:writeRealtime', b),
        onData:             (cb) => on('serial:data', cb),
        onConnectionChange: (cb) => on('serial:connectionChange', cb),
        onError:            (cb) => on('serial:error', cb),
      },
      stream: {
        load:       (lines) => invoke('stream:load', lines),
        start:      ()      => invoke('stream:start'),
        pause:      ()      => invoke('stream:pause'),
        resume:     ()      => invoke('stream:resume'),
        stop:       ()      => invoke('stream:stop'),
        onProgress: (cb) => on('stream:progress', cb),
        onComplete: (cb) => on('stream:complete', cb),
        onError:    (cb) => on('stream:error', cb),
      },
      store: {
        get: (k)    => invoke('store:get', k),
        set: (k, v) => invoke('store:set', k, v),
      },
      dialog: { openFileContent },
      updater: {
        check: async () => {},
        install: async () => {},
        openReleasePage: async () => {},
        getStatus: async () => ({ state: 'up-to-date' }),
        getVersion: async () => 'web',
        onStatus: () => () => {},
      },
    }
  })
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function installWebApi(): Promise<void> {
  // Chrome/Edge on a hosted (non-LAN) URL → Web Serial, no bridge needed
  if (!isLocalNetwork() && 'serial' in navigator) {
    installWebSerialApi()
    return
  }
  // Everything else → WebSocket bridge
  await installWebSocketApi(resolveWsUrl())
}
