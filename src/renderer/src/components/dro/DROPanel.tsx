import React, { useState } from 'react'
import { useMachineStore } from '../../stores/machineStore'
import type { MachineState } from '../../types'

const STATE_COLORS: Record<MachineState | string, string> = {
  Idle: 'bg-green-700 text-green-200',
  Run: 'bg-blue-700 text-blue-200',
  Jog: 'bg-blue-600 text-blue-200',
  Hold: 'bg-yellow-700 text-yellow-200',
  Alarm: 'bg-red-700 text-red-200',
  Door: 'bg-orange-700 text-orange-200',
  Check: 'bg-purple-700 text-purple-200',
  Home: 'bg-teal-700 text-teal-200',
  Sleep: 'bg-zinc-600 text-zinc-300',
  Unknown: 'bg-zinc-700 text-zinc-400',
}

function fmt(v: number, digits = 3) {
  return v.toFixed(digits).padStart(8, ' ')
}

export function DROPanel() {
  const { state, mpos, wpos, overrides, feedRate, spindleRPM, plannerBuffer, rxBuffer, pins, accessories, units } = useMachineStore()
  const [showMPos, setShowMPos] = useState(false)
  const pos = showMPos ? mpos : wpos
  const stateClass = STATE_COLORS[state] ?? STATE_COLORS.Unknown
  const dec = units === 'inch' ? 4 : 3

  const pinFlags = {
    limitX: pins.includes('X'), limitY: pins.includes('Y'), limitZ: pins.includes('Z'),
    probe: pins.includes('P'), door: pins.includes('D'),
  }
  const spindleOn = accessories.includes('S') || accessories.includes('C')
  const floodOn = accessories.includes('F')
  const mistOn = accessories.includes('M')

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex-shrink-0">
      {/* State + coord toggle */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${stateClass}`}>{state.toUpperCase()}</span>
        <button
          onClick={() => setShowMPos(v => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {showMPos ? 'MPos' : 'WPos'}
        </button>
      </div>

      {/* Position display */}
      <div className="font-mono space-y-1 mb-2">
        {(['x', 'y', 'z'] as const).map(axis => (
          <div key={axis} className="flex items-baseline gap-1">
            <span className="text-zinc-500 text-xs w-3 uppercase">{axis}</span>
            <span className={`text-2xl font-bold tracking-tight leading-none ${
              axis === 'z' ? 'text-sky-300' : axis === 'y' ? 'text-green-300' : 'text-orange-300'
            }`}>
              {fmt(pos[axis], dec)}
            </span>
            <span className="text-xs text-zinc-600">{units}</span>
          </div>
        ))}
      </div>

      {/* Feed / spindle actual */}
      <div className="flex gap-3 text-xs mb-2">
        <div>
          <span className="text-zinc-500">Feed </span>
          <span className="font-mono text-zinc-200">{feedRate.toFixed(0)}</span>
          <span className="text-zinc-600"> {units}/min</span>
        </div>
        <div>
          <span className="text-zinc-500">Spnd </span>
          <span className="font-mono text-zinc-200">{spindleRPM.toFixed(0)}</span>
          <span className="text-zinc-600"> rpm</span>
        </div>
      </div>

      {/* Override badges */}
      <div className="flex gap-1.5 mb-2">
        <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
          F{overrides.feed}%
        </span>
        <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
          R{overrides.rapid}%
        </span>
        <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
          S{overrides.spindle}%
        </span>
      </div>

      {/* Buffer bars */}
      <div className="space-y-1 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 w-10">Plan</span>
          <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${(plannerBuffer / 15) * 100}%` }} />
          </div>
          <span className="text-xs text-zinc-500 font-mono w-4">{plannerBuffer}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 w-10">RX</span>
          <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
            <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${(rxBuffer / 128) * 100}%` }} />
          </div>
          <span className="text-xs text-zinc-500 font-mono w-4">{rxBuffer}</span>
        </div>
      </div>

      {/* Pin + accessory indicators */}
      <div className="flex flex-wrap gap-1">
        {pinFlags.limitX && <span className="text-xs px-1 py-0.5 bg-red-900 text-red-300 rounded">LimX</span>}
        {pinFlags.limitY && <span className="text-xs px-1 py-0.5 bg-red-900 text-red-300 rounded">LimY</span>}
        {pinFlags.limitZ && <span className="text-xs px-1 py-0.5 bg-red-900 text-red-300 rounded">LimZ</span>}
        {pinFlags.probe && <span className="text-xs px-1 py-0.5 bg-yellow-900 text-yellow-300 rounded">Probe</span>}
        {pinFlags.door && <span className="text-xs px-1 py-0.5 bg-orange-900 text-orange-300 rounded">Door</span>}
        {spindleOn && <span className="text-xs px-1 py-0.5 bg-green-900 text-green-300 rounded">Spndle</span>}
        {floodOn && <span className="text-xs px-1 py-0.5 bg-blue-900 text-blue-300 rounded">Flood</span>}
        {mistOn && <span className="text-xs px-1 py-0.5 bg-blue-900 text-blue-300 rounded">Mist</span>}
      </div>
    </div>
  )
}
