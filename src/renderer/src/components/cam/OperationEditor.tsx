import React from 'react'
import { useCamStore } from '../../stores/camStore'
import { CamOperation } from '../../lib/cam/types'

interface FieldProps {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  step?: string
  unit?: string
}

function Field({ label, value, onChange, type = 'number', step = '0.1', unit }: FieldProps) {
  return (
    <div>
      <label className="text-xs text-zinc-500 block mb-0.5">{label}{unit && <span className="ml-1 text-zinc-600">({unit})</span>}</label>
      <input type={type} value={value} step={step}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-right text-zinc-200" />
    </div>
  )
}

export function OperationEditor() {
  const { operations, selectedOpId, updateOperation, shapes, tools } = useCamStore()
  const op = operations.find(o => o.id === selectedOpId)

  if (!op) {
    return (
      <div className="p-3 text-xs text-zinc-600 text-center">
        Select an operation to edit its parameters
      </div>
    )
  }

  function upd<K extends keyof CamOperation>(key: K, val: string) {
    const num = parseFloat(val)
    updateOperation(op!.id, { [key]: isNaN(num) ? val : num } as Pick<CamOperation, K>)
  }

  const shape = shapes.find(s => s.id === op.shapeId)
  const tool = tools.find(t => t.id === op.toolId)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Operation</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={op.enabled}
            onChange={e => updateOperation(op.id, { enabled: e.target.checked })}
            className="rounded" />
          <span className="text-xs text-zinc-400">Enabled</span>
        </label>
      </div>

      <div className="p-3 space-y-3 text-xs">
        {/* Label */}
        <div>
          <label className="text-zinc-500 block mb-0.5">Label</label>
          <input type="text" value={op.label}
            onChange={e => updateOperation(op.id, { label: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200" />
        </div>

        {/* Operation type */}
        <div>
          <label className="text-zinc-500 block mb-1">Type</label>
          <div className="grid grid-cols-4 gap-1">
            {(['profile', 'pocket', 'drill', 'engrave'] as const).map(t => (
              <button key={t} onClick={() => updateOperation(op.id, { type: t })}
                className={`py-1 rounded text-xs capitalize ${op.type === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Shape */}
        <div>
          <label className="text-zinc-500 block mb-0.5">Shape</label>
          <select value={op.shapeId} onChange={e => updateOperation(op.id, { shapeId: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
            {shapes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* Tool */}
        <div>
          <label className="text-zinc-500 block mb-0.5">Tool</label>
          <select value={op.toolId} onChange={e => updateOperation(op.id, { toolId: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
            {tools.map(t => <option key={t.id} value={t.id}>{t.name} (Ø{t.diameter}mm)</option>)}
          </select>
          {tool && <div className="text-zinc-600 mt-0.5">{tool.flutes} flutes · {tool.material}</div>}
        </div>

        <div className="border-t border-zinc-800 pt-2">
          <div className="text-zinc-500 font-medium mb-2">Depth</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Safe Z" unit="mm" value={op.safeZ} onChange={v => upd('safeZ', v)} step="1" />
            <Field label="Start Z" unit="mm" value={op.startZ} onChange={v => upd('startZ', v)} step="0.1" />
            <Field label="Target Depth" unit="mm" value={op.targetDepth} onChange={v => upd('targetDepth', v)} step="0.5" />
            <Field label="Step Down" unit="mm" value={op.stepDown} onChange={v => upd('stepDown', v)} step="0.1" />
          </div>
          {op.targetDepth > 0 && op.stepDown > 0 && (
            <div className="text-zinc-600 mt-1">
              {Math.ceil(op.targetDepth / op.stepDown)} passes
            </div>
          )}
        </div>

        {op.type === 'profile' && (
          <div className="border-t border-zinc-800 pt-2">
            <div className="text-zinc-500 font-medium mb-2">Profile Side</div>
            <div className="grid grid-cols-3 gap-1">
              {(['inside', 'outside', 'on'] as const).map(s => (
                <button key={s} onClick={() => updateOperation(op.id, { side: s })}
                  className={`py-1 rounded text-xs capitalize ${op.side === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {op.type === 'pocket' && (
          <div className="border-t border-zinc-800 pt-2">
            <div className="text-zinc-500 font-medium mb-2">Pocket</div>
            <div>
              <label className="text-zinc-500 block mb-0.5">Step Over (% of diameter)</label>
              <input type="range" min={0.1} max={0.95} step={0.05} value={op.stepOver}
                onChange={e => updateOperation(op.id, { stepOver: +e.target.value })}
                className="w-full" />
              <div className="flex justify-between text-zinc-600">
                <span>10%</span>
                <span className="text-blue-400 font-mono">{(op.stepOver * 100).toFixed(0)}%</span>
                <span>95%</span>
              </div>
              {tool && <div className="text-zinc-600">= {(op.stepOver * tool.diameter).toFixed(2)}mm per pass</div>}
            </div>
          </div>
        )}

        <div className="border-t border-zinc-800 pt-2">
          <div className="text-zinc-500 font-medium mb-2">Feeds</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Feed Rate" unit="mm/min" value={op.feedRate} onChange={v => upd('feedRate', v)} step="50" />
            <Field label="Plunge Rate" unit="mm/min" value={op.plungeRate} onChange={v => upd('plungeRate', v)} step="20" />
            <div className="col-span-2">
              <Field label="Spindle RPM" value={op.spindleRPM} onChange={v => upd('spindleRPM', v)} step="100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
