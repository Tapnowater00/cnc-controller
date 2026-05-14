import { contextBridge, ipcRenderer } from 'electron'

function on(channel: string, cb: (...args: any[]) => void) {
  const handler = (_: Electron.IpcRendererEvent, ...args: any[]) => cb(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:listPorts'),
    connect: (path: string, baud: number) => ipcRenderer.invoke('serial:connect', path, baud),
    disconnect: () => ipcRenderer.invoke('serial:disconnect'),
    write: (data: string) => ipcRenderer.invoke('serial:write', data),
    writeRealtime: (byte: number) => ipcRenderer.invoke('serial:writeRealtime', byte),
    onData: (cb: (line: string) => void) => on('serial:data', cb),
    onConnectionChange: (cb: (connected: boolean) => void) => on('serial:connectionChange', cb),
    onError: (cb: (msg: string) => void) => on('serial:error', cb),
  },
  stream: {
    load: (lines: string[]) => ipcRenderer.invoke('stream:load', lines),
    start: () => ipcRenderer.invoke('stream:start'),
    pause: () => ipcRenderer.invoke('stream:pause'),
    resume: () => ipcRenderer.invoke('stream:resume'),
    stop: () => ipcRenderer.invoke('stream:stop'),
    onProgress: (cb: (p: { current: number; total: number; eta: number }) => void) => on('stream:progress', cb),
    onComplete: (cb: () => void) => on('stream:complete', cb),
    onError: (cb: (e: string) => void) => on('stream:error', cb),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },
  dialog: {
    openFileContent: () => ipcRenderer.invoke('dialog:openFileContent'),
  },
})

// Type declaration merged into window
export {}
