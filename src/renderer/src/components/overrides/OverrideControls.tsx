import React from 'react'
import { useMachineStore } from '../../stores/machineStore'

// Realtime override bytes
const OV = {
  feedReset: 0x90, feedPlus10: 0x91, feedMinus10: 0x92, feedPlus1: 0x93, feedMinus1: 0x94,
  rapidReset: 0x95, rapid50: 0x96, rapid25: 0x97,
  spindleReset: 0x99, spindlePlus10: 0x9A, spindleMinus10: 0x9B, spindlePlus1: 0x9C, spindleMinus1: 0x9D,
}

function OverrideRow({ label, value, rtReset, rtPlus10, rtMinus10, rtPlus1, rtMinus1, extras }: {
  label: string; value: number
  rtReset: number; rtPlus10: number; rtMinus10: number; rtPlus1?: number; rtMinus1?: number
  extras?: { label: string; rt: number }[]
}) {
  const sendRealtime = useMachineStore(s => s.sendRealtime)
  const connected = useMachineStore(s => s.connected)
  const disabled = !connected

  const btn = (label: string, rt: number, color = 'bg-zinc-800 hover:bg-zinc-700') =>
    <button disabled={disabled} onClick={() => sendRealtime(rt)}
      className={`px-1.5 py-0.5 rounded text-xs font-mono ${color} disabled:opacity-30 transition-colors`}>
      {label}
    </button>

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400 w-12">{label}</span>
        <span className="text-sm font-mono font-bold text-zinc-200">{value}%</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {btn('▲10', rtPlus10)}
        {btn('▼10', rtMinus10)}
        {rtPlus1 !== undefined && btn('+1', rtPlus1)}
        {rtMinus1 !== undefined && btn('-1', rtMinus1)}
        {btn('↺', rtReset, 'bg-zinc-700 hover:bg-zinc-600')}
        {extras?.map(e => <React.Fragment key={e.label}>{btn(e.label, e.rt)}</React.Fragment>)}
      </div>
      <div className="mt-1.5 bg-zinc-800 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${value > 100 ? 'bg-orange-500' : value < 100 ? 'bg-blue-500' : 'bg-green-500'}`}
          style={{ width: `${Math.min(200, value) / 2}%` }}
        />
      </div>
    </div>
  )
}

export function OverrideControls() {
  const { overrides } = useMachineStore()

  return (
    <div className="p-3 bg-zinc-900/50 space-y-3">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Overrides</span>
      <OverrideRow label="Feed" value={overrides.feed}
        rtReset={OV.feedReset} rtPlus10={OV.feedPlus10} rtMinus10={OV.feedMinus10}
        rtPlus1={OV.feedPlus1} rtMinus1={OV.feedMinus1} />
      <OverrideRow label="Rapid" value={overrides.rapid}
        rtReset={OV.rapidReset} rtPlus10={OV.rapidReset} rtMinus10={OV.rapid50}
        extras={[{ label: '50%', rt: OV.rapid50 }, { label: '25%', rt: OV.rapid25 }]} />
      <OverrideRow label="Spindle" value={overrides.spindle}
        rtReset={OV.spindleReset} rtPlus10={OV.spindlePlus10} rtMinus10={OV.spindleMinus10}
        rtPlus1={OV.spindlePlus1} rtMinus1={OV.spindleMinus1} />
    </div>
  )
}
