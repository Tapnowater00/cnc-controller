import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'

export function AlarmBanner() {
  const alarmCode = useMachineStore(s => s.alarmCode)
  const alarmDescription = useMachineStore(s => s.alarmDescription)
  const clearAlarm = useMachineStore(s => s.clearAlarm)

  if (alarmCode === null) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/80 border-b border-red-700 text-red-200 flex-shrink-0">
      <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
      <span className="text-xs font-semibold">ALARM {alarmCode}:</span>
      <span className="text-xs">{alarmDescription}</span>
      <div className="flex-1" />
      <button
        onClick={clearAlarm}
        className="flex items-center gap-1 px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs font-medium"
        title="Clear alarm ($X)"
      >
        <X size={12} /> Clear ($X)
      </button>
    </div>
  )
}
