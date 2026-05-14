import { EventEmitter } from 'events'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

export class SerialManager extends EventEmitter {
  private port: SerialPort | null = null
  private parser: ReadlineParser | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private currentPath = ''
  private currentBaud = 115200
  private shouldReconnect = false

  async listPorts() {
    return SerialPort.list()
  }

  async connect(path: string, baud = 115200): Promise<void> {
    if (this.port?.isOpen) await this.disconnect()
    this.currentPath = path
    this.currentBaud = baud
    this.shouldReconnect = true
    return this._open()
  }

  private _open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path: this.currentPath, baudRate: this.currentBaud, autoOpen: false })
      const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))

      port.open((err) => {
        if (err) { reject(err); return }
        this.port = port
        this.parser = parser

        parser.on('data', (line: string) => {
          this.emit('data', line.trim())
        })

        port.on('error', (err) => this.emit('error', err))

        port.on('close', () => {
          this.emit('connectionChange', false)
          if (this.shouldReconnect) this._scheduleReconnect()
        })

        // Wait briefly for grblHAL welcome message before signalling connected
        setTimeout(() => {
          this.emit('connectionChange', true)
          resolve()
        }, 500)
      })
    })
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (!this.shouldReconnect) return
      try { await this._open() } catch { this._scheduleReconnect() }
    }, 3000)
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    return new Promise((resolve) => {
      if (!this.port?.isOpen) { resolve(); return }
      this.port.close(() => resolve())
    })
  }

  write(data: string): void {
    if (!this.port?.isOpen) return
    const line = data.endsWith('\n') ? data : data + '\n'
    this.port.write(line)
  }

  writeRealtime(byte: number): void {
    if (!this.port?.isOpen) return
    this.port.write(Buffer.from([byte]))
  }

  get isOpen() { return this.port?.isOpen ?? false }
}
