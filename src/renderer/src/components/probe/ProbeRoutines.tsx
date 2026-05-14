import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'

type RoutineType = 'z' | 'xyz-corner' | 'bore-center' | null

export function ProbeRoutines() {
  const { send, connected, state } = useMachineStore()
  const { probeThickness, probeApproachSpeed, probeRetract, save } = useSettingsStore()
  const [confirming, setConfirming] = useState<RoutineType>(null)
  const [thickness, setThickness] = useState(probeThickness)
  const [speed, setSpeed] = useState(probeApproachSpeed)
  const [retract, setRetract] = useState(probeRetract)
  const [probeRadius, setProbeRadius] = useState(1.5)
  const [maxDepth, setMaxDepth] = useState(15)

  const canProbe = connected && (state === 'Idle')

  function runZProbe() {
    const cmds = [
      'G91',
      `G38.3 Z-${maxDepth} F${speed}`,
      `G0 Z${retract}`,
      `G90`,
      `G10 L20 P1 Z${thickness}`,
    ]
    cmds.forEach(c => send(c))
    setConfirming(null)
    save('probeThickness', thickness)
    save('probeApproachSpeed', speed)
    save('probeRetract', retract)
  }

  function runXYZCorner() {
    // Probe X- edge, then Y- edge, then Z top
    const r = probeRadius
    const cmds = [
      'G91',
      `G38.3 X-${maxDepth} F${speed}`,
      `G0 X${retract}`,
      `G90`,
      `G10 L20 P1 X${r}`,
      'G91',
      `G38.3 Y-${maxDepth} F${speed}`,
      `G0 Y${retract}`,
      `G90`,
      `G10 L20 P1 Y${r}`,
      'G91',
      `G38.3 Z-${maxDepth} F${speed}`,
      `G0 Z${retract}`,
      `G90`,
      `G10 L20 P1 Z${thickness}`,
    ]
    cmds.forEach(c => send(c))
    setConfirming(null)
  }

  function runBoreCenter() {
    // Probe +X, -X, +Y, -Y then average
    const probe = maxDepth / 2
    const cmds = [
      'G91',
      `G38.3 X${probe} F${speed}`,
      `G0 X-${retract}`,
      `G38.3 X-${probe * 2} F${speed}`,
      `G0 X${retract}`,
      `G38.3 Y${probe} F${speed}`,
      `G0 Y-${retract}`,
      `G38.3 Y-${probe * 2} F${speed}`,
      `G0 Y${retract}`,
      'G90',
    ]
    cmds.forEach(c => send(c))
    setConfirming(null)
  }

  function run() {
    if (confirming === 'z') runZProbe()
    else if (confirming === 'xyz-corner') runXYZCorner()
    else if (confirming === 'bore-center') runBoreCenter()
  }

  const routineLabels: Record<NonNullable<RoutineType>, string> = {
    'z': 'Z Probe',
    'xyz-corner': 'XYZ Corner',
    'bore-center': 'Bore Center',
  }

  return (
    <div className="p-3 space-y-3">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Probe Routines</span>

      {/* Probe settings */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-zinc-500 block mb-0.5">Plate thickness</label>
          <input type="number" value={thickness} onChange={e => setThickness(Number(e.target.value))} step="0.1"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-right text-zinc-200" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-0.5">Approach F</label>
          <input type="number" value={speed} onChange={e => setSpeed(Number(e.target.value))} step="10"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-right text-zinc-200" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-0.5">Retract mm</label>
          <input type="number" value={retract} onChange={e => setRetract(Number(e.target.value))} step="0.5"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-right text-zinc-200" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-0.5">Max depth</label>
          <input type="number" value={maxDepth} onChange={e => setMaxDepth(Number(e.target.value))} step="1"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-right text-zinc-200" />
        </div>
      </div>

      {/* Routine buttons */}
      <div className="space-y-1">
        {(['z', 'xyz-corner', 'bore-center'] as const).map(r => (
          <button
            key={r}
            disabled={!canProbe}
            onClick={() => setConfirming(r)}
            className="w-full text-xs py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-zinc-300 text-left px-2"
          >
            {r === 'z' ? '⬇ Z Probe (set Z zero)' : r === 'xyz-corner' ? '⊞ XYZ Corner Probe' : '◎ Bore Center Probe'}
          </button>
        ))}
      </div>

      {/* Confirmation modal */}
      {confirming !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-yellow-400" />
              <span className="font-semibold text-zinc-200">Confirm: {routineLabels[confirming]}</span>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              Ensure the probe/touch plate is connected and positioned correctly.
              The machine will move — keep hands clear.
            </p>
            <div className="text-xs text-zinc-500 mb-4 space-y-1">
              <div>Plate thickness: <span className="font-mono text-zinc-300">{thickness}mm</span></div>
              <div>Approach speed: <span className="font-mono text-zinc-300">{speed}mm/min</span></div>
              <div>Max depth: <span className="font-mono text-zinc-300">{maxDepth}mm</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(null)}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">
                Cancel
              </button>
              <button onClick={run}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-semibold text-white">
                Run Probe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
