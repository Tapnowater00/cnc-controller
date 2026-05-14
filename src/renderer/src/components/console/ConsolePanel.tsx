import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2, Clock } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'

export function ConsolePanel() {
  const consoleLines = useMachineStore(s => s.consoleLines)
  const clearConsole = useMachineStore(s => s.clearConsole)
  const send = useMachineStore(s => s.send)
  const connected = useMachineStore(s => s.connected)

  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [hideStatus, setHideStatus] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoScroll = useRef(true)

  useEffect(() => {
    if (autoScroll.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [consoleLines])

  function submit() {
    const cmd = input.trim()
    if (!cmd) return
    send(cmd)
    setHistory(h => [cmd, ...h.slice(0, 49)])
    setHistIdx(-1)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { submit(); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(idx)
      setInput(history[idx] ?? '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.max(histIdx - 1, -1)
      setHistIdx(idx)
      setInput(idx < 0 ? '' : history[idx] ?? '')
    }
  }

  function lineColor(line: { text: string; dir: 'rx' | 'tx' }) {
    if (line.dir === 'tx') return 'text-blue-400'
    if (line.text.startsWith('<')) return 'text-zinc-600'
    if (line.text === 'ok') return 'text-zinc-600'
    if (line.text.startsWith('error:')) return 'text-red-400'
    if (line.text.startsWith('ALARM:')) return 'text-red-400'
    if (line.text.startsWith('[MSG:')) return 'text-yellow-400'
    if (line.text.startsWith('Grbl') || line.text.startsWith('GrblHAL')) return 'text-green-400'
    return 'text-zinc-300'
  }

  const filtered = hideStatus ? consoleLines.filter(l => !l.text.startsWith('<') && l.text !== 'ok') : consoleLines

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex-1">Console</span>
        <button
          onClick={() => setShowTimestamps(v => !v)}
          className={`p-1 rounded ${showTimestamps ? 'text-blue-400' : 'text-zinc-600'} hover:text-zinc-300`}
          title="Toggle timestamps"
        >
          <Clock size={12} />
        </button>
        <button
          onClick={() => setHideStatus(v => !v)}
          className={`text-xs px-1.5 py-0.5 rounded ${hideStatus ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-800 text-zinc-500'}`}
          title="Filter status reports"
        >
          Filter
        </button>
        <button onClick={clearConsole} className="p-1 text-zinc-600 hover:text-zinc-300" title="Clear">
          <Trash2 size={12} />
        </button>
      </div>

      <div
        ref={logRef}
        className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-px"
        onScroll={e => {
          const el = e.currentTarget
          autoScroll.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
        }}
      >
        {filtered.map((line, i) => (
          <div key={i} className={`leading-4 ${lineColor(line)}`}>
            {showTimestamps && (
              <span className="text-zinc-700 mr-1.5">
                {new Date(line.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <span className={line.dir === 'tx' ? '' : ''}>{line.dir === 'tx' ? '> ' : ''}{line.text}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-1 px-2 py-1.5 border-t border-zinc-800 flex-shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
          placeholder={connected ? 'Enter G-code or $ command…' : 'Not connected'}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200 disabled:opacity-40"
        />
        <button onClick={submit} disabled={!connected || !input.trim()}
          className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 rounded text-xs text-zinc-200">
          Send
        </button>
      </div>
    </div>
  )
}
