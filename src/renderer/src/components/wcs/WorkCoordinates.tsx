import React, { useState } from 'react'
import { useMachineStore } from '../../stores/machineStore'
import type { WCSName } from '../../types'

const WCS_LIST: WCSName[] = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']

export function WorkCoordinates() {
  const { send, activeWCS, setActiveWCS, wpos, connected, units } = useMachineStore()
  const [customX, setCustomX] = useState('')
  const [customY, setCustomY] = useState('')
  const [customZ, setCustomZ] = useState('')

  const wcsNum = WCS_LIST.indexOf(activeWCS) + 1

  function zeroAxis(axis: string) {
    send(`G10 L20 P${wcsNum} ${axis}0`)
  }

  function zeroAll() {
    send(`G10 L20 P${wcsNum} X0 Y0 Z0`)
  }

  function setCustomPos() {
    let cmd = `G10 L20 P${wcsNum}`
    if (customX !== '') cmd += ` X${customX}`
    if (customY !== '') cmd += ` Y${customY}`
    if (customZ !== '') cmd += ` Z${customZ}`
    if (cmd !== `G10 L20 P${wcsNum}`) {
      send(cmd)
      setCustomX(''); setCustomY(''); setCustomZ('')
    }
  }

  function goToWZero() {
    send('G90 G0 Z5')
    setTimeout(() => send('G90 G0 X0 Y0'), 200)
  }

  function goToMZero() {
    send('G53 G0 Z0')
    setTimeout(() => send('G53 G0 X0 Y0'), 200)
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200 text-right"
  const btnSm = "px-2 py-1 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 transition-colors text-zinc-200"

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Work Coordinates</span>
        <span className="text-xs text-zinc-500">{units}</span>
      </div>

      {/* WCS tabs */}
      <div className="flex gap-1">
        {WCS_LIST.map(wcs => (
          <button
            key={wcs}
            disabled={!connected}
            onClick={() => setActiveWCS(wcs)}
            className={`flex-1 text-xs py-1 rounded font-mono transition-colors ${
              activeWCS === wcs ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {wcs}
          </button>
        ))}
      </div>

      {/* Current work position */}
      <div className="font-mono text-xs space-y-1 bg-zinc-800/50 rounded p-2">
        {(['x', 'y', 'z'] as const).map(ax => (
          <div key={ax} className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase">{ax}</span>
            <span className="text-zinc-200">{wpos[ax].toFixed(units === 'inch' ? 4 : 3)}</span>
          </div>
        ))}
      </div>

      {/* Zero buttons */}
      <div className="grid grid-cols-4 gap-1">
        {['X', 'Y', 'Z'].map(ax => (
          <button key={ax} disabled={!connected} onClick={() => zeroAxis(ax)} className={btnSm}>
            Z {ax}
          </button>
        ))}
        <button disabled={!connected} onClick={zeroAll} className={`${btnSm} bg-blue-900/60 hover:bg-blue-800`}>
          All
        </button>
      </div>

      {/* Set custom position */}
      <div className="space-y-1">
        <span className="text-xs text-zinc-500">Set position:</span>
        <div className="grid grid-cols-3 gap-1">
          {['X', 'Y', 'Z'].map((ax, i) => (
            <div key={ax}>
              <label className="text-xs text-zinc-600">{ax}</label>
              <input
                type="number"
                step="0.001"
                value={[customX, customY, customZ][i]}
                onChange={e => [setCustomX, setCustomY, setCustomZ][i](e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setCustomPos()}
                placeholder="—"
                className={inputClass}
              />
            </div>
          ))}
        </div>
        <button disabled={!connected} onClick={setCustomPos} className={`w-full ${btnSm}`}>
          Set Position
        </button>
      </div>

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-1">
        <button disabled={!connected} onClick={goToWZero} className={btnSm}>→ Work Zero</button>
        <button disabled={!connected} onClick={goToMZero} className={`${btnSm} text-zinc-400`}>→ Mach Zero</button>
      </div>
    </div>
  )
}
