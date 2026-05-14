import React, { useState, useRef, useEffect, useMemo } from 'react'
import { FolderOpen, Play, Pause, Square, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'

function estimateETA(lines: string[]): number {
  let seconds = 0
  let feed = 1000
  let pos = { x: 0, y: 0, z: 0 }
  for (const line of lines) {
    const clean = line.split(';')[0].trim().toUpperCase()
    if (!clean) continue
    const tokens: Record<string, number> = {}
    const re = /([A-Z])([+-]?\d+\.?\d*)/g
    let m
    while ((m = re.exec(clean)) !== null) tokens[m[1]] = parseFloat(m[2])
    if (tokens.F !== undefined) feed = tokens.F
    const g = tokens.G
    if (g === 1 || g === 2 || g === 3) {
      const nx = tokens.X ?? pos.x, ny = tokens.Y ?? pos.y, nz = tokens.Z ?? pos.z
      const dx = nx - pos.x, dy = ny - pos.y, dz = nz - pos.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (feed > 0) seconds += (dist / feed) * 60
      pos = { x: nx, y: ny, z: nz }
    }
  }
  return Math.round(seconds)
}

function fmtTime(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), sec = s % 60
  if (m < 60) return `${m}m ${sec}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function GcodeSender({ onFileLoaded, externalLines }: { onFileLoaded?: (lines: string[]) => void; externalLines?: string[] } = {}) {
  const { streaming, streamingFile, streamingProgress, streamingCurrentLine, streamingTotalLines, streamingETA, setStreaming, updateStreamProgress, state, connected } = useMachineStore()

  const [lines, setLines] = useState<string[]>([])
  const [filePath, setFilePath] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<{ path: string; date: string }[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  const LINE_HEIGHT = 20
  const OVERSCAN = 30

  const eta = useMemo(() => lines.length > 0 ? estimateETA(lines) : 0, [lines])

  // Accept lines pushed from CAM workspace
  useEffect(() => {
    if (externalLines && externalLines.length > 0) {
      setLines(externalLines)
      setFilePath('[CAM Generated]')
    }
  }, [externalLines])

  useEffect(() => {
    window.api.store.get('jobHistory').then((h: any) => setHistory(h ?? []))
  }, [])

  useEffect(() => {
    const unsub1 = window.api.stream.onProgress(p => updateStreamProgress(p.current, p.total, p.eta))
    const unsub2 = window.api.stream.onComplete(() => {
      setStreaming(false)
      const entry = { path: filePath, date: new Date().toLocaleString() }
      const newHistory = [entry, ...history].slice(0, 10)
      setHistory(newHistory)
      window.api.store.set('jobHistory', newHistory)
    })
    return () => { unsub1(); unsub2() }
  }, [filePath, history])

  // Track viewport height so virtualization can react to resizes
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const obs = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Auto-scroll to current line (scroll container directly — children are virtualized)
  useEffect(() => {
    if (streaming && listRef.current) {
      const target = (streamingCurrentLine - 1) * LINE_HEIGHT - viewportHeight / 2
      listRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
  }, [streamingCurrentLine, streaming, viewportHeight])

  async function openFile() {
    const result = await window.api.dialog.openFileContent()
    if (!result) return
    const fileLines = result.content.split('\n').map(l => l.trim())
    setLines(fileLines)
    setFilePath(result.path)
    onFileLoaded?.(fileLines)
    await window.api.stream.load(fileLines)
  }

  async function loadHistoryFile(path: string) {
    // Re-open from history — just store path, user needs to re-open
    setFilePath(path)
  }

  async function startJob() {
    if (!connected || state !== 'Idle' || lines.length === 0) return
    setStreaming(true, filePath)
    await window.api.stream.start()
  }

  async function pauseJob() {
    await window.api.stream.pause()
  }

  async function resumeJob() {
    await window.api.stream.resume()
  }

  async function stopJob() {
    await window.api.stream.stop()
    setStreaming(false)
    window.api.serial.writeRealtime(0x18) // reset
  }

  const canStart = connected && state === 'Idle' && lines.length > 0 && !streaming
  const progressPct = streamingProgress * 100

  return (
    <div className="flex flex-col h-full bg-zinc-900/30">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <button onClick={openFile} className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">
          <FolderOpen size={13} /> Open
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-zinc-400 truncate block">{filePath ? filePath.split(/[\\/]/).pop() : 'No file loaded'}</span>
          {lines.length > 0 && <span className="text-xs text-zinc-600">{lines.length} lines · ~{fmtTime(eta)}</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        {!streaming ? (
          <button onClick={startJob} disabled={!canStart}
            className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 rounded text-xs font-semibold text-white">
            <Play size={13} /> Start
          </button>
        ) : (
          <>
            <button onClick={pauseJob} className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-semibold text-white">
              <Pause size={13} /> Pause
            </button>
            <button onClick={resumeJob} className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-semibold text-white">
              <Play size={13} /> Resume
            </button>
          </>
        )}
        {streaming && (
          <button onClick={stopJob} className="flex items-center gap-1 px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-semibold text-white">
            <Square size={13} /> Stop
          </button>
        )}

        {streaming && (
          <div className="flex items-center gap-1 ml-auto text-xs text-zinc-400">
            <Clock size={12} />
            {fmtTime(streamingETA)} · {streamingCurrentLine}/{streamingTotalLines}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {streaming && (
        <div className="px-3 py-1 flex-shrink-0">
          <div className="bg-zinc-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="text-xs text-zinc-500 text-right mt-0.5">{progressPct.toFixed(1)}%</div>
        </div>
      )}

      {/* G-code preview (virtualized) */}
      <div
        ref={listRef}
        onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="flex-1 overflow-y-auto font-mono text-xs px-2 py-1 relative"
      >
        {lines.length > 0 ? (
          (() => {
            const startIdx = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN)
            const endIdx = Math.min(
              lines.length,
              Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN
            )
            const visible = lines.slice(startIdx, endIdx)
            return (
              <div style={{ height: lines.length * LINE_HEIGHT, position: 'relative' }}>
                <div style={{ position: 'absolute', top: startIdx * LINE_HEIGHT, left: 0, right: 0 }}>
                  {visible.map((line, k) => {
                    const i = startIdx + k
                    return (
                      <div
                        key={i}
                        style={{ height: LINE_HEIGHT }}
                        className={`px-1 leading-5 ${
                          streaming && i === streamingCurrentLine - 1
                            ? 'bg-blue-600/40 text-blue-200'
                            : i < streamingCurrentLine
                            ? 'text-zinc-600'
                            : line.trim().startsWith(';') || line.trim().startsWith('(')
                            ? 'text-zinc-500 italic'
                            : 'text-zinc-300'
                        }`}
                      >
                        <span className="text-zinc-700 select-none mr-1.5">{i + 1}</span>
                        {line}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()
        ) : (
          <div className="text-zinc-600 text-center py-8">Open a G-code file to preview</div>
        )}
      </div>

      {/* Recent jobs accordion */}
      {history.length > 0 && (
        <div className="border-t border-zinc-800 flex-shrink-0">
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
          >
            {historyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Recent jobs ({history.length})
          </button>
          {historyOpen && (
            <div className="max-h-24 overflow-y-auto">
              {history.map((h, i) => (
                <div key={i} className="flex items-center px-3 py-1 hover:bg-zinc-800/50 gap-2">
                  <span className="text-xs text-zinc-400 flex-1 truncate">{h.path.split(/[\\/]/).pop()}</span>
                  <span className="text-xs text-zinc-600">{h.date}</span>
                  <button onClick={() => setFilePath(h.path)} className="text-xs text-blue-400 hover:text-blue-300">Load</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
