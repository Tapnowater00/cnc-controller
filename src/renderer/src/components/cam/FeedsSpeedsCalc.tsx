import React, { useState, useMemo } from 'react'
import { useCamStore } from '../../stores/camStore'

interface Material {
  name: string
  sfm: [number, number]     // surface feet per minute range (carbide)
  chipLoad: [number, number] // chip load mm per tooth (rough estimate by tool diam)
  color: string
}

const MATERIALS: Material[] = [
  { name: 'Aluminum', sfm: [600, 1200], chipLoad: [0.025, 0.075], color: '#93c5fd' },
  { name: 'Soft Wood (MDF/Pine)', sfm: [1200, 2500], chipLoad: [0.05, 0.15], color: '#86efac' },
  { name: 'Hard Wood (Oak/Maple)', sfm: [800, 1600], chipLoad: [0.04, 0.10], color: '#a3e635' },
  { name: 'Acrylic/Plastics', sfm: [400, 800], chipLoad: [0.02, 0.06], color: '#f9a8d4' },
  { name: 'PCB / FR4', sfm: [500, 1000], chipLoad: [0.01, 0.03], color: '#6ee7b7' },
  { name: 'Soft Steel', sfm: [60, 120], chipLoad: [0.015, 0.04], color: '#fca5a5' },
  { name: 'Stainless Steel', sfm: [40, 80], chipLoad: [0.008, 0.025], color: '#f97316' },
  { name: 'Brass/Copper', sfm: [300, 600], chipLoad: [0.02, 0.06], color: '#fde68a' },
  { name: 'Foam/Wax', sfm: [2000, 4000], chipLoad: [0.1, 0.3], color: '#e879f9' },
]

export function FeedsSpeedsCalc() {
  const { tools, selectedOpId, operations, updateOperation } = useCamStore()
  const [matIdx, setMatIdx] = useState(0)
  const [toolId, setToolId] = useState(tools[1]?.id ?? '')
  const [sfmSlider, setSfmSlider] = useState(0.6)  // 0–1 within the material range
  const [chipSlider, setChipSlider] = useState(0.5)
  const [docMm, setDocMm] = useState(1)  // depth of cut
  const [wodMm, setWodMm] = useState(3)  // width of cut
  const [radialPct, setRadialPct] = useState(0.4) // radial WOC as fraction of diameter

  const mat = MATERIALS[matIdx]
  const tool = tools.find(t => t.id === toolId)

  const results = useMemo(() => {
    if (!tool) return null
    const sfm = mat.sfm[0] + sfmSlider * (mat.sfm[1] - mat.sfm[0])
    const sfmMm = sfm * 304.8  // mm/min
    const rpm = Math.round(sfmMm / (Math.PI * tool.diameter))
    const chipLoad = mat.chipLoad[0] + chipSlider * (mat.chipLoad[1] - mat.chipLoad[0])
    const scaledChip = chipLoad * (tool.diameter / 6)  // scale by tool size vs 6mm reference
    const feed = Math.round(rpm * scaledChip * tool.flutes)
    const plunge = Math.round(feed * 0.33)
    const doc = docMm
    const mrr = (feed * doc * tool.diameter * radialPct / 1000).toFixed(2)  // cm³/min
    return { rpm, feed, plunge, chipLoad: scaledChip.toFixed(4), mrr }
  }, [mat, tool, sfmSlider, chipSlider, docMm, radialPct])

  function pushToOperation() {
    if (!results || !selectedOpId) return
    updateOperation(selectedOpId, {
      feedRate: results.feed,
      plungeRate: results.plunge,
      spindleRPM: results.rpm,
      toolId: toolId,
    })
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Feeds & Speeds</span>
      </div>

      <div className="p-3 space-y-3 text-xs">
        {/* Material */}
        <div>
          <label className="text-zinc-500 block mb-1">Material</label>
          <div className="grid grid-cols-2 gap-1">
            {MATERIALS.map((m, i) => (
              <button key={m.name} onClick={() => setMatIdx(i)}
                className={`px-2 py-1 rounded text-left truncate transition-colors ${i === matIdx ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                style={i === matIdx ? { borderLeft: `3px solid ${m.color}` } : {}}>
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tool */}
        <div>
          <label className="text-zinc-500 block mb-1">Tool</label>
          <select value={toolId} onChange={e => setToolId(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
            {tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Surface speed slider */}
        <div>
          <div className="flex justify-between text-zinc-500 mb-0.5">
            <span>Surface Speed (Aggressiveness)</span>
            <span>{mat.sfm[0] + Math.round(sfmSlider * (mat.sfm[1] - mat.sfm[0]))} SFM</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={sfmSlider}
            onChange={e => setSfmSlider(+e.target.value)}
            className="w-full h-1.5 appearance-none bg-zinc-700 rounded" />
          <div className="flex justify-between text-zinc-600">
            <span>Conservative</span><span>Aggressive</span>
          </div>
        </div>

        {/* Chip load slider */}
        <div>
          <div className="flex justify-between text-zinc-500 mb-0.5">
            <span>Chip Load</span>
            <span>{(mat.chipLoad[0] + chipSlider * (mat.chipLoad[1] - mat.chipLoad[0])).toFixed(3)} mm/tooth</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={chipSlider}
            onChange={e => setChipSlider(+e.target.value)}
            className="w-full h-1.5 appearance-none bg-zinc-700 rounded" />
        </div>

        {/* DOC */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-zinc-500 block mb-1">Depth of Cut (mm)</label>
            <input type="number" value={docMm} onChange={e => setDocMm(+e.target.value)} step="0.5" min="0.1"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 font-mono text-right text-zinc-200" />
          </div>
          <div>
            <label className="text-zinc-500 block mb-1">Radial WOC</label>
            <select value={radialPct} onChange={e => setRadialPct(+e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
              <option value={1.0}>Full slot (100%)</option>
              <option value={0.5}>Half (50%)</option>
              <option value={0.4}>40%</option>
              <option value={0.25}>Quarter (25%)</option>
              <option value={0.1}>10%</option>
            </select>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
            <div className="font-semibold text-zinc-300 mb-2">Recommended Settings</div>
            {[
              ['Spindle RPM', results.rpm.toLocaleString() + ' RPM', '#60a5fa'],
              ['Feed Rate', results.feed + ' mm/min', '#4ade80'],
              ['Plunge Rate', results.plunge + ' mm/min', '#fb923c'],
              ['Chip Load', results.chipLoad + ' mm/tooth', '#a78bfa'],
              ['MRR (est.)', results.mrr + ' cm³/min', '#facc15'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="flex justify-between items-center">
                <span className="text-zinc-500">{label}</span>
                <span className="font-mono font-semibold" style={{ color: color as string }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Push to operation */}
        <button onClick={pushToOperation} disabled={!selectedOpId || !results}
          className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded text-white font-semibold">
          Apply to Selected Operation
        </button>
        {!selectedOpId && (
          <div className="text-zinc-600 text-center">Select an operation to apply values</div>
        )}
      </div>
    </div>
  )
}
