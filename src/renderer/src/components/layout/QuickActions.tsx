import React from 'react'
import { PauseCircle, PlayCircle, AlertOctagon, Home } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'

// Realtime command bytes
const RT_FEED_HOLD = 0x21
const RT_CYCLE_START = 0x7E
const RT_SOFT_RESET = 0x18

interface Props { onHomeConfirm: () => void }

export function QuickActions({ onHomeConfirm }: Props) {
  const connected = useMachineStore(s => s.connected)
  const sendRealtime = useMachineStore(s => s.sendRealtime)
  const state = useMachineStore(s => s.state)

  const canFeedHold = connected && (state === 'Run' || state === 'Jog')
  const canCycleStart = connected && (state === 'Hold' || state === 'Idle')
  const canReset = connected

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-zinc-900/50 border-b border-zinc-800 flex-shrink-0">
      <button
        onClick={() => sendRealtime(RT_FEED_HOLD)}
        disabled={!canFeedHold}
        className="flex items-center gap-1.5 px-3 py-1 bg-yellow-600 hover:bg-yellow-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-xs font-semibold transition-colors"
        title="Feed Hold [Space]"
      >
        <PauseCircle size={14} /> Feed Hold
      </button>

      <button
        onClick={() => sendRealtime(RT_CYCLE_START)}
        disabled={!canCycleStart}
        className="flex items-center gap-1.5 px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-xs font-semibold transition-colors"
        title="Cycle Start [R]"
      >
        <PlayCircle size={14} /> Cycle Start
      </button>

      <button
        onClick={() => sendRealtime(RT_SOFT_RESET)}
        disabled={!canReset}
        className="flex items-center gap-1.5 px-3 py-1 bg-red-700 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-xs font-semibold transition-colors"
        title="Soft Reset [Esc]"
      >
        <AlertOctagon size={14} /> Reset
      </button>

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      <button
        onClick={onHomeConfirm}
        disabled={!connected}
        className="flex items-center gap-1.5 px-3 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-200 rounded text-xs font-semibold transition-colors"
        title="Home All Axes [H]"
      >
        <Home size={14} /> Home All
      </button>

      <div className="flex-1" />
      <span className="hidden lg:inline text-xs text-zinc-600">Space=Hold · R=Start · Esc=Reset · H=Home</span>
    </div>
  )
}
