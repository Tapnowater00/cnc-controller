import React, { useState, useCallback } from 'react'
import {
  MousePointer2, Square, Circle, Minus, Trash2, Download, Play,
  Plus, ChevronDown, ChevronRight, Layers, Wrench, Calculator, Upload, X,
  Undo2, Redo2, Egg
} from 'lucide-react'
import { useCamStore, defaultOperation } from '../../stores/camStore'
import { CamCanvas, DrawTool } from './CamCanvas'
import { OperationEditor } from './OperationEditor'
import { ToolLibrary } from './ToolLibrary'
import { FeedsSpeedsCalc } from './FeedsSpeedsCalc'
import { generateToolpath } from '../../lib/cam/toolpath'
import { toolpathToGcode, combineGcode, estimateTime } from '../../lib/cam/gcodeGen'
import { importSVG } from '../../lib/cam/svgImport'
import { importDXF } from '../../lib/cam/dxfImport'
import { Toolpath } from '../../lib/cam/toolpath'

type RightTab = 'operation' | 'tools' | 'feeds'

function fmtTime(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

export function CamWorkspace() {
  const {
    shapes, operations, tools, selectedShapeIds, selectedOpId,
    addOperation, deleteOperation, setSelectedOp, setSelectedShapes,
    deleteShape, setGeneratedGcode, generatedGcode, clearShapes, addShapes,
    undo, redo, past, future,
  } = useCamStore()

  const [drawTool, setDrawTool] = useState<DrawTool>('select')
  const [rightTab, setRightTab] = useState<RightTab>('operation')
  const [toolpaths, setToolpaths] = useState<Toolpath[]>([])
  const [generating, setGenerating] = useState(false)
  const [snapGrid, setSnapGrid] = useState(1)
  const [shapesOpen, setShapesOpen] = useState(true)
  const [opsOpen, setOpsOpen] = useState(true)
  const [showGcode, setShowGcode] = useState(false)

  const handleImport = useCallback(async () => {
    const result = await window.api.dialog.openFileContent()
    if (!result) return
    const ext = result.path.split('.').pop()?.toLowerCase()
    let imported = ext === 'svg'
      ? importSVG(result.content)
      : ext === 'dxf'
      ? importDXF(result.content)
      : []
    if (imported.length > 0) {
      addShapes(imported)
    }
  }, [addShapes])

  function addOp() {
    const shapeId = [...selectedShapeIds][0] ?? shapes[0]?.id
    if (!shapeId) return
    const tool = tools[0]
    if (!tool) return
    const opId = addOperation(defaultOperation(shapeId, tool))
    setSelectedOp(opId)
    setRightTab('operation')
  }

  function generate() {
    setGenerating(true)
    const enabledOps = operations.filter(op => op.enabled)
    const tps: Toolpath[] = []
    const gcodes: string[] = []

    for (const op of enabledOps) {
      const shape = shapes.find(s => s.id === op.shapeId)
      const tool = tools.find(t => t.id === op.toolId)
      if (!shape || !tool) continue
      try {
        const tp = generateToolpath(op, shape, tool)
        tps.push(tp)
        gcodes.push(toolpathToGcode(tp, op, tool))
      } catch (e) {
        console.error('Toolpath generation error for', op.label, e)
      }
    }

    setToolpaths(tps)
    setGeneratedGcode(gcodes.length > 0 ? combineGcode(gcodes) : null)
    setGenerating(false)
  }

  function saveGcode() {
    if (!generatedGcode) return
    const blob = new Blob([generatedGcode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'toolpath.nc'
    a.click()
    URL.revokeObjectURL(url)
  }

  function sendToSender() {
    if (!generatedGcode) return
    // Emit to GcodeSender via a custom event
    window.dispatchEvent(new CustomEvent('cam:gcode', { detail: generatedGcode }))
    setShowGcode(false)
  }

  const totalTime = toolpaths.reduce((acc, tp) => {
    const op = operations.find(o => o.id === tp.operationId)
    if (!op) return acc
    return acc + estimateTime(tp, op)
  }, 0)

  const drawToolBtn = (t: DrawTool, icon: React.ReactNode, label: string) => (
    <button
      key={t}
      title={label}
      onClick={() => setDrawTool(t)}
      className={`p-1.5 rounded transition-colors ${drawTool === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
    >
      {icon}
    </button>
  )

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-200 text-xs overflow-hidden">
      {/* Left sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
        {/* Draw tools */}
        <div className="p-2 border-b border-zinc-800 flex flex-wrap gap-1">
          {drawToolBtn('select', <MousePointer2 size={14} />, 'Select (S)')}
          {drawToolBtn('rect', <Square size={14} />, 'Rectangle · Shift = square')}
          {drawToolBtn('circle', <Circle size={14} />, 'Circle · drag radius from center')}
          {drawToolBtn('ellipse', <Egg size={14} />, 'Ellipse · drag bbox · Shift = circle')}
          {drawToolBtn('polyline', <Minus size={14} />, 'Polyline · dbl-click to finish')}
          <button title="Undo (Ctrl+Z)" onClick={undo} disabled={past.length === 0}
            className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed">
            <Undo2 size={14} />
          </button>
          <button title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0}
            className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed">
            <Redo2 size={14} />
          </button>
          <button title="Import SVG/DXF" onClick={handleImport}
            className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
            <Upload size={14} />
          </button>
          <button title="Clear all" onClick={clearShapes}
            className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700">
            <Trash2 size={14} />
          </button>
        </div>

        {/* Snap grid */}
        <div className="px-2 py-1.5 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-zinc-500">Snap</span>
          <select value={snapGrid} onChange={e => setSnapGrid(+e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200">
            <option value={0}>Off</option>
            <option value={0.1}>0.1mm</option>
            <option value={0.5}>0.5mm</option>
            <option value={1}>1mm</option>
            <option value={5}>5mm</option>
            <option value={10}>10mm</option>
          </select>
        </div>

        {/* Shapes list */}
        <div className="border-b border-zinc-800">
          <button onClick={() => setShapesOpen(v => !v)}
            className="w-full flex items-center gap-1 px-2 py-1.5 hover:bg-zinc-800/50">
            {shapesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Layers size={12} />
            <span className="font-medium text-zinc-400">Shapes</span>
            <span className="ml-auto text-zinc-600">{shapes.length}</span>
          </button>
          {shapesOpen && (
            <div className="max-h-40 overflow-y-auto">
              {shapes.map(s => (
                <div key={s.id}
                  onClick={e => {
                    if (e.shiftKey) {
                      const next = new Set(selectedShapeIds)
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                      setSelectedShapes(next)
                    } else {
                      setSelectedShapes(new Set([s.id]))
                    }
                  }}
                  className={`flex items-center px-3 py-1 cursor-pointer hover:bg-zinc-800 gap-2 ${selectedShapeIds.has(s.id) ? 'bg-blue-950/40 text-blue-300' : 'text-zinc-400'}`}>
                  <span className="flex-1 truncate">{s.label}</span>
                  <button onClick={e => { e.stopPropagation(); deleteShape(s.id) }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5">
                    <X size={10} />
                  </button>
                </div>
              ))}
              {shapes.length === 0 && <div className="px-3 py-2 text-zinc-600">No shapes yet</div>}
            </div>
          )}
        </div>

        {/* Operations list */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <button onClick={() => setOpsOpen(v => !v)}
            className="w-full flex items-center gap-1 px-2 py-1.5 hover:bg-zinc-800/50 flex-shrink-0">
            {opsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="font-medium text-zinc-400">Operations</span>
            <span className="ml-auto text-zinc-600">{operations.length}</span>
          </button>
          {opsOpen && (
            <div className="flex-1 overflow-y-auto">
              {operations.map(op => {
                const shape = shapes.find(s => s.id === op.shapeId)
                return (
                  <div key={op.id}
                    onClick={() => { setSelectedOp(op.id); setRightTab('operation') }}
                    className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-zinc-800 ${selectedOpId === op.id ? 'bg-blue-950/40' : ''} ${!op.enabled ? 'opacity-40' : ''}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      op.type === 'profile' ? 'bg-green-500' :
                      op.type === 'pocket' ? 'bg-yellow-500' :
                      op.type === 'drill' ? 'bg-blue-500' : 'bg-purple-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-zinc-300">{op.label}</div>
                      <div className="text-zinc-600 truncate">{shape?.label}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteOperation(op.id) }}
                      className="text-zinc-600 hover:text-red-400 p-0.5 flex-shrink-0">
                      <X size={10} />
                    </button>
                  </div>
                )
              })}
              {operations.length === 0 && <div className="px-3 py-2 text-zinc-600">No operations yet</div>}
            </div>
          )}
        </div>

        {/* Add operation + Generate */}
        <div className="p-2 border-t border-zinc-800 space-y-1.5 flex-shrink-0">
          <button onClick={addOp} disabled={shapes.length === 0}
            className="w-full flex items-center justify-center gap-1 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 rounded">
            <Plus size={12} /> Add Operation
          </button>
          <button onClick={generate} disabled={operations.length === 0 || generating}
            className="w-full flex items-center justify-center gap-1 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-30 rounded font-semibold">
            <Play size={12} /> Generate G-code
          </button>
          {generatedGcode && (
            <div className="flex gap-1">
              <button onClick={() => setShowGcode(true)}
                className="flex-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-center">Preview</button>
              <button onClick={saveGcode}
                className="flex-1 py-1 bg-zinc-700 hover:bg-zinc-600 rounded flex items-center justify-center gap-1">
                <Download size={11} /> Save
              </button>
              <button onClick={sendToSender}
                className="flex-1 py-1 bg-blue-700 hover:bg-blue-600 rounded text-white">
                Send
              </button>
            </div>
          )}
          {toolpaths.length > 0 && (
            <div className="text-zinc-500 text-center">Est. {fmtTime(totalTime)} · {toolpaths.length} ops</div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative">
        <CamCanvas
          toolpaths={toolpaths}
          activeTool={drawTool}
          onToolChange={setDrawTool}
          snapGrid={snapGrid}
        />
        {/* Canvas hint */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-zinc-600 pointer-events-none select-none text-xs">
          Scroll: zoom · Alt+drag: pan · Ctrl+Z / Ctrl+Shift+Z: undo/redo · Ctrl+A: all · Ctrl+D: duplicate · arrows: nudge
        </div>
      </div>

      {/* Right panel */}
      <div className="w-60 flex-shrink-0 border-l border-zinc-800 flex flex-col overflow-hidden">
        <div className="flex border-b border-zinc-800 flex-shrink-0">
          {([
            ['operation', <Layers size={12} />, 'Operation'],
            ['tools', <Wrench size={12} />, 'Tools'],
            ['feeds', <Calculator size={12} />, 'F&S'],
          ] as [RightTab, React.ReactNode, string][]).map(([id, icon, label]) => (
            <button key={id} onClick={() => setRightTab(id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs ${rightTab === id ? 'bg-zinc-800 text-zinc-200 border-b-2 border-blue-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {icon} {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {rightTab === 'operation' && <OperationEditor />}
          {rightTab === 'tools' && <ToolLibrary />}
          {rightTab === 'feeds' && <FeedsSpeedsCalc />}
        </div>
      </div>

      {/* G-code preview modal */}
      {showGcode && generatedGcode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-3xl h-3/4 flex flex-col mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <span className="font-semibold text-zinc-200">Generated G-code</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">{generatedGcode.split('\n').length} lines</span>
                <button onClick={saveGcode}
                  className="flex items-center gap-1 px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">
                  <Download size={13} /> Save .nc
                </button>
                <button onClick={sendToSender}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white">
                  Send to Sender
                </button>
                <button onClick={() => setShowGcode(false)} className="text-zinc-400 hover:text-zinc-200 ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap">
              {generatedGcode}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
