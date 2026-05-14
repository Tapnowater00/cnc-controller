import React, { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Home, StopCircle, Keyboard } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'

const STEP_SIZES = [0.001, 0.01, 0.1, 1, 10, 100]
const RT_JOG_CANCEL = 0x85

interface Props { onHomeConfirm: () => void }

export function JogControls({ onHomeConfirm }: Props) {
  const connected = useMachineStore(s => s.connected)
  const state = useMachineStore(s => s.state)
  const send = useMachineStore(s => s.send)
  const sendRealtime = useMachineStore(s => s.sendRealtime)
  const units = useMachineStore(s => s.units)
  const { safeZ } = useSettingsStore()

  const [stepIdx, setStepIdx] = useState(3) // default 1mm
  const [feed, setFeed] = useState(1000)
  const [contMode, setContMode] = useState(false)

  const step = STEP_SIZES[stepIdx]
  const canJog = connected && (state === 'Idle' || state === 'Jog')
  const unit = units === 'mm' ? 'G21' : 'G20'

  async function jog(axes: string) {
    if (!canJog) return
    if (safeZ > 0 && (axes.includes('X') || axes.includes('Y'))) {
      send(`G90 G0 Z${safeZ}`)
      await new Promise(r => setTimeout(r, 200))
    }
    send(`$J=G91 ${unit} ${axes} F${feed}`)
  }

  function stopJog() { sendRealtime(RT_JOG_CANCEL) }

  const btnClass = `w-9 h-9 flex items-center justify-center bg-zinc-800 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-zinc-200 transition-colors border border-zinc-700`

  return (
    <div className="p-3 space-y-3 bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Jog Controls</span>
        <button
          onClick={() => setContMode(v => !v)}
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${contMode ? 'bg-blue-700 text-blue-200' : 'bg-zinc-800 text-zinc-400'}`}
          title="Continuous jog mode"
        >
          <Keyboard size={11} /> Cont
        </button>
      </div>

      {/* Step size */}
      <div className="flex gap-1">
        {STEP_SIZES.map((s, i) => (
          <button
            key={s}
            onClick={() => setStepIdx(i)}
            className={`flex-1 text-xs py-1 rounded font-mono ${stepIdx === i ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            {s < 1 ? s : s >= 10 ? s.toFixed(0) : s.toFixed(0)}
          </button>
        ))}
      </div>

      {/* XY pad */}
      <div className="grid grid-cols-3 gap-1 justify-items-center">
        <button disabled={!canJog} onClick={() => jog(`X-${step} Y${step}`)} className={btnClass} title="X- Y+">↖</button>
        <button disabled={!canJog} onClick={() => jog(`Y${step}`)} className={btnClass} title="Y+">
          <ChevronUp size={16} />
        </button>
        <button disabled={!canJog} onClick={() => jog(`X${step} Y${step}`)} className={btnClass} title="X+ Y+">↗</button>

        <button disabled={!canJog} onClick={() => jog(`X-${step}`)} className={btnClass} title="X-">
          <ChevronLeft size={16} />
        </button>
        <button disabled={!connected} onClick={stopJog} className={`${btnClass} bg-red-900/40 hover:bg-red-800`} title="Stop jog">
          <StopCircle size={14} />
        </button>
        <button disabled={!canJog} onClick={() => jog(`X${step}`)} className={btnClass} title="X+">
          <ChevronRight size={16} />
        </button>

        <button disabled={!canJog} onClick={() => jog(`X-${step} Y-${step}`)} className={btnClass} title="X- Y-">↙</button>
        <button disabled={!canJog} onClick={() => jog(`Y-${step}`)} className={btnClass} title="Y-">
          <ChevronDown size={16} />
        </button>
        <button disabled={!canJog} onClick={() => jog(`X${step} Y-${step}`)} className={btnClass} title="X+ Y-">↘</button>
      </div>

      {/* Z axis */}
      <div className="flex gap-2 justify-center">
        <button disabled={!canJog} onClick={() => jog(`Z${step}`)} className={`${btnClass} w-16`} title="Z+">
          Z <ChevronUp size={14} />
        </button>
        <button disabled={!canJog} onClick={() => jog(`Z-${step}`)} className={`${btnClass} w-16`} title="Z-">
          Z <ChevronDown size={14} />
        </button>
      </div>

      {/* Feed rate */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-10">Feed</span>
        <input
          type="number"
          value={feed}
          onChange={e => setFeed(Number(e.target.value))}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
          min={1} max={10000} step={100}
        />
        <span className="text-xs text-zinc-500">{units}/m</span>
      </div>

      {/* Home buttons */}
      <div className="flex gap-1">
        <button
          disabled={!connected}
          onClick={onHomeConfirm}
          className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-zinc-300"
        >
          <Home size={12} /> All
        </button>
        {['X', 'Y', 'Z'].map(ax => (
          <button
            key={ax}
            disabled={!connected}
            onClick={() => send(`$H${ax}`)}
            className="flex-1 text-xs py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-zinc-300"
          >
            H{ax}
          </button>
        ))}
      </div>
    </div>
  )
}
