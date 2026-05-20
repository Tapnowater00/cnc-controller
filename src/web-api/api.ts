// Implements the same `Api` shape exposed by the Electron preload, backed by
// a WebSocket transport. The renderer source uses `window.api.*` unchanged.

import type { PortInfo, StreamProgress } from '../renderer/src/types'
import type { UpdateStatus } from '../renderer/src/types/api'
import { WsTransport } from './transport'

function pickGcodeFile(): Promise<{ path: string; content: string } | null> {
  // Browser fallback for Electron's native file dialog — used by the G-code sender.
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.nc,.gcode,.gc,.ngc,.tap,.cnc,.txt'
    input.style.display = 'none'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) { resolve(null); return }
      const content = await file.text()
      resolve({ path: file.name, content })
    })
    input.addEventListener('cancel', () => {
      document.body.removeChild(input)
      resolve(null)
    })
    document.body.appendChild(input)
    input.click()
  })
}

export function makeWebApi(t: WsTransport) {
  return {
    serial: {
      listPorts: (): Promise<PortInfo[]> => t.request('serial.listPorts'),
      connect: (path: string, baud: number) => t.request<void>('serial.connect', [path, baud]),
      disconnect: () => t.request<void>('serial.disconnect'),
      write: (data: string) => t.request<void>('serial.write', [data]),
      writeRealtime: (byte: number) => t.request<void>('serial.writeRealtime', [byte]),
      onData: (cb: (line: string) => void) => t.on('serial:data', cb),
      onConnectionChange: (cb: (connected: boolean) => void) => t.on('serial:connectionChange', cb),
      onError: (cb: (msg: string) => void) => t.on('serial:error', cb),
    },
    stream: {
      load: (lines: string[]) => t.request<void>('stream.load', [lines]),
      start: () => t.request<void>('stream.start'),
      pause: () => t.request<void>('stream.pause'),
      resume: () => t.request<void>('stream.resume'),
      stop: () => t.request<void>('stream.stop'),
      onProgress: (cb: (p: StreamProgress) => void) => t.on('stream:progress', cb),
      onComplete: (cb: () => void) => t.on('stream:complete', cb),
      onError: (cb: (e: string) => void) => t.on('stream:error', cb),
    },
    store: {
      get: (key: string) => t.request<any>('store.get', [key]),
      set: (key: string, value: unknown) => t.request<void>('store.set', [key, value]),
    },
    dialog: {
      openFileContent: () => pickGcodeFile(),
    },
    updater: {
      check: () => t.request<void>('updater.check'),
      install: () => t.request<void>('updater.install'),
      openReleasePage: () => t.request<void>('updater.openReleasePage'),
      getStatus: () => t.request<UpdateStatus>('updater.getStatus'),
      getVersion: () => t.request<string>('updater.getVersion'),
      // No push channel for updater on web — UI polls getStatus if it needs to.
      onStatus: (_cb: (s: UpdateStatus) => void) => () => {},
    },
  }
}
