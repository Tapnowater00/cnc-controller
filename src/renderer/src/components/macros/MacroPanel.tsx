import React, { useState, useRef, useEffect } from 'react'
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useMacroStore } from '../../stores/macroStore'
import type { Macro } from '../../types'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899']
const SHORTCUTS = ['None', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']

function MacroEditModal({ macro, onSave, onClose }: {
  macro: Partial<Macro>
  onSave: (m: Macro) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(macro.label ?? '')
  const [gcode, setGcode] = useState(macro.gcode ?? '')
  const [shortcut, setShortcut] = useState(macro.shortcut ?? 'None')
  const [color, setColor] = useState(macro.color ?? COLORS[0])

  function save() {
    if (!label.trim() || !gcode.trim()) return
    onSave({
      id: macro.id ?? crypto.randomUUID(),
      label: label.trim(),
      gcode: gcode.trim(),
      shortcut: shortcut === 'None' ? undefined : shortcut,
      color,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="font-semibold text-zinc-200">Edit Macro</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200"
              placeholder="Macro name" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">G-code</label>
            <textarea value={gcode} onChange={e => setGcode(e.target.value)} rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono text-zinc-200 resize-none"
              placeholder="G0 X0 Y0&#10;M5" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Shortcut</label>
              <select value={shortcut} onChange={e => setShortcut(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200">
                {SHORTCUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Color</label>
              <div className="flex gap-1 flex-wrap w-28">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full transition-transform ${color === c ? 'ring-2 ring-white scale-110' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">Cancel</button>
          <button onClick={save} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-semibold text-white flex items-center justify-center gap-1">
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  )
}

export function MacroPanel() {
  const { send, connected } = useMachineStore()
  const { macros, loaded, load, add, update, remove } = useMacroStore()
  const [editing, setEditing] = useState<Partial<Macro> | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  useEffect(() => { if (!loaded) load() }, [loaded])

  function runMacro(m: Macro) {
    if (!connected) return
    m.gcode.split('\n').forEach(line => { if (line.trim()) send(line.trim()) })
  }

  function handleRightClick(e: React.MouseEvent, id: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, id })
  }

  const SLOTS = 12
  const slots = [...macros.slice(0, SLOTS), ...Array(Math.max(0, SLOTS - macros.length)).fill(null)]

  return (
    <div className="p-3 space-y-2" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Macros</span>
        <button onClick={() => setEditing({})} className="p-0.5 text-zinc-500 hover:text-zinc-300">
          <Plus size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {slots.map((m, i) => m ? (
          <button
            key={m.id}
            disabled={!connected}
            onClick={() => runMacro(m)}
            onContextMenu={e => handleRightClick(e, m.id)}
            className="text-xs py-2 px-1 rounded font-medium text-white truncate transition-opacity disabled:opacity-40 hover:brightness-110"
            style={{ background: m.color ?? '#3b82f6' }}
            title={m.shortcut ? `${m.label} [${m.shortcut}]` : m.label}
          >
            {m.shortcut && <span className="opacity-70 mr-0.5">[{m.shortcut}]</span>}
            {m.label}
          </button>
        ) : (
          <button
            key={`empty-${i}`}
            onClick={() => setEditing({})}
            className="text-xs py-2 px-1 rounded bg-zinc-800/50 text-zinc-700 hover:text-zinc-500 border border-dashed border-zinc-800"
          >
            +
          </button>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded shadow-xl py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { setEditing(macros.find(m => m.id === contextMenu.id) ?? {}); setContextMenu(null) }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 w-full">
            <Edit2 size={12} /> Edit
          </button>
          <button onClick={() => { remove(contextMenu.id); setContextMenu(null) }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-700 w-full">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editing !== null && (
        <MacroEditModal
          macro={editing}
          onSave={(m) => {
            if (editing.id) update(editing.id, m)
            else add(m)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
