import React, { useState } from 'react'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { useCamStore } from '../../stores/camStore'
import { CamTool } from '../../lib/cam/types'

function ToolRow({ tool, onEdit }: { tool: CamTool; onEdit: () => void }) {
  const { deleteTool } = useCamStore()
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800/60 rounded group">
      <div className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: tool.material === 'carbide' ? '#60a5fa' : tool.material === 'hss' ? '#f59e0b' : '#a78bfa' }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-200 truncate">{tool.name}</div>
        <div className="text-xs text-zinc-500">Ø{tool.diameter}mm · {tool.flutes}fl · {tool.material}</div>
      </div>
      <div className="hidden group-hover:flex items-center gap-1">
        <button onClick={onEdit} className="p-0.5 hover:text-blue-400 text-zinc-500"><Edit2 size={12} /></button>
        <button onClick={() => deleteTool(tool.id)} className="p-0.5 hover:text-red-400 text-zinc-500"><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

interface EditForm { name: string; diameter: string; flutes: string; material: CamTool['material']; notes: string }

const BLANK: EditForm = { name: '', diameter: '3', flutes: '2', material: 'carbide', notes: '' }

export function ToolLibrary() {
  const { tools, addTool, updateTool } = useCamStore()
  const [editing, setEditing] = useState<string | null>(null)  // 'new' or tool id
  const [form, setForm] = useState<EditForm>(BLANK)

  function startAdd() { setForm(BLANK); setEditing('new') }
  function startEdit(t: CamTool) {
    setForm({ name: t.name, diameter: String(t.diameter), flutes: String(t.flutes), material: t.material, notes: t.notes ?? '' })
    setEditing(t.id)
  }
  function save() {
    const t = { name: form.name, diameter: parseFloat(form.diameter), flutes: parseInt(form.flutes), material: form.material, notes: form.notes }
    if (editing === 'new') addTool(t)
    else if (editing) updateTool(editing, t)
    setEditing(null)
  }

  const field = (label: string, key: keyof EditForm, type = 'text') => (
    <div>
      <label className="text-xs text-zinc-500 block mb-0.5">{label}</label>
      <input type={type} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Tool Library</span>
        <button onClick={startAdd} className="flex items-center gap-1 px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
          <Plus size={11} /> New
        </button>
      </div>

      {editing !== null && (
        <div className="p-3 border-b border-zinc-800 flex-shrink-0 space-y-2 bg-zinc-900">
          <div className="text-xs font-medium text-zinc-300">{editing === 'new' ? 'New Tool' : 'Edit Tool'}</div>
          {field('Name', 'name')}
          <div className="grid grid-cols-2 gap-2">
            {field('Diameter (mm)', 'diameter', 'number')}
            {field('Flutes', 'flutes', 'number')}
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-0.5">Material</label>
            <select value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value as CamTool['material'] }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200">
              <option value="carbide">Carbide</option>
              <option value="hss">HSS</option>
              <option value="cobalt">Cobalt</option>
              <option value="diamond">Diamond</option>
            </select>
          </div>
          {field('Notes', 'notes')}
          <div className="flex gap-2">
            <button onClick={() => setEditing(null)} className="flex-1 flex items-center justify-center gap-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
              <X size={11} /> Cancel
            </button>
            <button onClick={save} disabled={!form.name || !form.diameter}
              className="flex-1 flex items-center justify-center gap-1 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded text-xs text-white">
              <Check size={11} /> Save
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {tools.map(t => (
          <ToolRow key={t.id} tool={t} onEdit={() => startEdit(t)} />
        ))}
        {tools.length === 0 && (
          <div className="text-xs text-zinc-600 text-center py-4">No tools — add one above</div>
        )}
      </div>
    </div>
  )
}
