import React, { useState } from 'react'
import { useMachineStore } from '../../stores/machineStore'

export function SpindleCoolant() {
  const { send, connected, accessories } = useMachineStore()
  const [rpm, setRpm] = useState(10000)

  const spindleOn = accessories.includes('S') || accessories.includes('C')
  const floodOn = accessories.includes('F')
  const mistOn = accessories.includes('M')

  const btnClass = (active: boolean, color = 'blue') =>
    `flex-1 text-xs py-1.5 rounded font-medium transition-colors disabled:opacity-30 ${
      active ? `bg-${color}-600 text-white` : `bg-zinc-800 text-zinc-400 hover:bg-zinc-700`
    }`

  return (
    <div className="p-3 space-y-3">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Spindle & Coolant</span>

      {/* Spindle speed */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-10">RPM</span>
        <input
          type="number"
          value={rpm}
          onChange={e => setRpm(Number(e.target.value))}
          min={0} max={30000} step={500}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200 text-right"
        />
        <button disabled={!connected} onClick={() => send(`S${rpm}`)}
          className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs disabled:opacity-30">
          Set S
        </button>
      </div>

      {/* Spindle on/off */}
      <div className="flex gap-1">
        <button disabled={!connected} onClick={() => send(`M3 S${rpm}`)}
          className={btnClass(spindleOn && !accessories.includes('C'), 'green')}>
          M3 CW
        </button>
        <button disabled={!connected} onClick={() => send(`M4 S${rpm}`)}
          className={btnClass(accessories.includes('C'), 'teal')}>
          M4 CCW
        </button>
        <button disabled={!connected} onClick={() => send('M5')}
          className={btnClass(!spindleOn, 'red')}>
          M5 Off
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <span className="text-xs text-zinc-500 mb-1 block">Coolant</span>
        <div className="flex gap-1">
          <button disabled={!connected} onClick={() => send('M7')}
            className={btnClass(mistOn, 'blue')}>
            M7 Mist
          </button>
          <button disabled={!connected} onClick={() => send('M8')}
            className={btnClass(floodOn, 'blue')}>
            M8 Flood
          </button>
          <button disabled={!connected} onClick={() => send('M9')}
            className={btnClass(!floodOn && !mistOn, 'zinc' as any)}>
            M9 Off
          </button>
        </div>
      </div>
    </div>
  )
}
