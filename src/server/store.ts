import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

// Drop-in replacement for the subset of electron-store we use, persisted to a
// single JSON file. Supports dotted-key paths (e.g. 'preferences.units') the
// same way electron-store does.

type Json = unknown

export class JsonStore {
  private path: string
  private data: Record<string, Json>
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(path: string, defaults: Record<string, Json>) {
    this.path = path
    if (existsSync(path)) {
      try {
        this.data = { ...defaults, ...JSON.parse(readFileSync(path, 'utf8')) }
      } catch {
        this.data = { ...defaults }
      }
    } else {
      mkdirSync(dirname(path), { recursive: true })
      this.data = { ...defaults }
      this.flush()
    }
  }

  get(key: string): Json {
    const parts = key.split('.')
    let cur: any = this.data
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined
      cur = cur[p]
    }
    return cur
  }

  set(key: string, value: Json): void {
    const parts = key.split('.')
    let cur: any = this.data
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {}
      cur = cur[p]
    }
    cur[parts[parts.length - 1]] = value
    this.scheduleFlush()
  }

  // Coalesce rapid writes (the renderer can fire several setting changes back-to-back).
  private scheduleFlush() {
    if (this.writeTimer) return
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.flush()
    }, 200)
  }

  private flush() {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }
}
