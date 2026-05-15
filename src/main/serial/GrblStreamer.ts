import { EventEmitter } from 'events'
import { SerialManager } from './SerialManager'

const DEFAULT_BUFFER_SIZE = 127       // standard grbl 1.1 RX buffer
const GRBLHAL_BUFFER_SIZE = 1024      // grblHAL RX buffer (larger)

export class GrblStreamer extends EventEmitter {
  private serial: SerialManager
  private queue: string[] = []
  private sentQueue: number[] = []   // byte lengths of in-flight lines
  private inFlight = 0
  private totalLines = 0
  private completedLines = 0
  private startTime = 0
  private running = false
  private paused = false
  private bufferSize = DEFAULT_BUFFER_SIZE

  constructor(serial: SerialManager) {
    super()
    this.serial = serial
  }

  load(lines: string[]): void {
    this.stop()
    this.queue = lines.filter(l => {
      const t = l.trim()
      return t.length > 0 && !t.startsWith(';') && !t.startsWith('%')
    })
    this.totalLines = this.queue.length
    this.completedLines = 0
    this.sentQueue = []
    this.inFlight = 0
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.paused = false
    this.startTime = Date.now()
    this._pump()
  }

  pause(): void { this.paused = true }

  resume(): void {
    if (!this.running) return
    this.paused = false
    this._pump()
  }

  stop(): void {
    this.running = false
    this.paused = false
    this.queue = []
    this.sentQueue = []
    this.inFlight = 0
    this.totalLines = 0
    this.completedLines = 0
  }

  onOk(): void {
    if (!this.running) return
    const len = this.sentQueue.shift()
    if (len !== undefined) {
      this.inFlight -= len
      this.completedLines++
      const elapsed = (Date.now() - this.startTime) / 1000
      const rate = this.completedLines / elapsed
      const remaining = this.totalLines - this.completedLines
      const eta = rate > 0 ? remaining / rate : 0

      this.emit('progress', {
        current: this.completedLines,
        total: this.totalLines,
        eta: Math.round(eta),
      })

      if (this.completedLines >= this.totalLines && this.queue.length === 0) {
        this.running = false
        this.emit('complete')
        return
      }
    }
    if (!this.paused) this._pump()
  }

  private _pump(): void {
    while (this.running && !this.paused && this.queue.length > 0) {
      const line = this.queue[0]
      const encoded = Buffer.from(line + '\n', 'utf8')
      const len = encoded.length

      if (this.inFlight + len > this.bufferSize) break

      this.queue.shift()
      this.sentQueue.push(len)
      this.inFlight += len
      this.serial.write(line)
    }
  }

  setFirmwareFamily(family: 'grbl' | 'grblhal' | 'unknown') {
    this.bufferSize = family === 'grblhal' ? GRBLHAL_BUFFER_SIZE : DEFAULT_BUFFER_SIZE
  }

  get isRunning() { return this.running }
  get isPaused() { return this.paused }
  get progress() {
    return this.totalLines > 0 ? this.completedLines / this.totalLines : 0
  }
}
