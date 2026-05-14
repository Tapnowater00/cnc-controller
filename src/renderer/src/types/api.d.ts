import type { PortInfo, StreamProgress } from './index'

interface Api {
  serial: {
    listPorts(): Promise<PortInfo[]>
    connect(path: string, baud: number): Promise<void>
    disconnect(): Promise<void>
    write(data: string): Promise<void>
    writeRealtime(byte: number): Promise<void>
    onData(cb: (line: string) => void): () => void
    onConnectionChange(cb: (connected: boolean) => void): () => void
    onError(cb: (msg: string) => void): () => void
  }
  stream: {
    load(lines: string[]): Promise<void>
    start(): Promise<void>
    pause(): Promise<void>
    resume(): Promise<void>
    stop(): Promise<void>
    onProgress(cb: (p: StreamProgress) => void): () => void
    onComplete(cb: () => void): () => void
    onError(cb: (e: string) => void): () => void
  }
  store: {
    get(key: string): Promise<any>
    set(key: string, value: unknown): Promise<void>
  }
  dialog: {
    openFileContent(): Promise<{ path: string; content: string } | null>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
