import { create } from 'zustand'
import { CamTool, CamShape, CamOperation } from '../lib/cam/types'

function uid() { return Math.random().toString(36).slice(2, 9) }

const DEFAULT_TOOLS: CamTool[] = [
  { id: 'T1', name: '1mm Flat End Mill', diameter: 1, flutes: 2, material: 'carbide' },
  { id: 'T2', name: '3mm Flat End Mill', diameter: 3, flutes: 2, material: 'carbide' },
  { id: 'T3', name: '6mm Flat End Mill', diameter: 6, flutes: 2, material: 'carbide' },
  { id: 'T4', name: '1/4" Flat End Mill', diameter: 6.35, flutes: 2, material: 'carbide' },
  { id: 'T5', name: '3mm Ball End Mill', diameter: 3, flutes: 2, material: 'carbide' },
  { id: 'T6', name: '60° V-Bit', diameter: 3.175, flutes: 1, material: 'carbide', notes: '60° included angle' },
  { id: 'T7', name: '90° V-Bit', diameter: 6.35, flutes: 1, material: 'carbide', notes: '90° included angle' },
]

const MAX_HISTORY = 50

type Snapshot = { shapes: CamShape[]; operations: CamOperation[] }

interface CamStore {
  tools: CamTool[]
  shapes: CamShape[]
  operations: CamOperation[]
  selectedShapeIds: Set<string>
  selectedOpId: string | null
  generatedGcode: string | null
  // Undo stack
  past: Snapshot[]
  future: Snapshot[]

  // History API
  pushHistory: () => void
  undo: () => void
  redo: () => void

  // Tool CRUD
  addTool: (t: Omit<CamTool, 'id'>) => void
  updateTool: (id: string, u: Partial<CamTool>) => void
  deleteTool: (id: string) => void

  // Shape CRUD
  addShape: (s: Omit<CamShape, 'id'>) => string
  updateShape: (id: string, u: Partial<CamShape>) => void
  deleteShape: (id: string) => void
  addShapes: (ss: Omit<CamShape, 'id'>[]) => void
  setSelectedShapes: (ids: Set<string>) => void
  clearShapes: () => void

  // Operation CRUD
  addOperation: (op: Omit<CamOperation, 'id'>) => string
  updateOperation: (id: string, u: Partial<CamOperation>) => void
  deleteOperation: (id: string) => void
  setSelectedOp: (id: string | null) => void

  setGeneratedGcode: (g: string | null) => void
}

// Internal: build the "snapshot now, clear future" patch for a mutating action
function _snap(s: Pick<CamStore, 'shapes' | 'operations' | 'past'>) {
  return {
    past: [...s.past.slice(-(MAX_HISTORY - 1)), { shapes: s.shapes, operations: s.operations }],
    future: [] as Snapshot[],
  }
}

export const useCamStore = create<CamStore>((set) => ({
  tools: DEFAULT_TOOLS,
  shapes: [],
  operations: [],
  selectedShapeIds: new Set(),
  selectedOpId: null,
  generatedGcode: null,
  past: [],
  future: [],

  pushHistory: () => set(s => _snap(s)),

  undo: () => set(s => {
    if (s.past.length === 0) return s
    const prev = s.past[s.past.length - 1]
    return {
      past: s.past.slice(0, -1),
      future: [...s.future, { shapes: s.shapes, operations: s.operations }],
      shapes: prev.shapes,
      operations: prev.operations,
      // Drop selections that point to deleted shapes/ops
      selectedShapeIds: new Set(
        [...s.selectedShapeIds].filter(id => prev.shapes.some(sh => sh.id === id))
      ),
      selectedOpId: prev.operations.some(o => o.id === s.selectedOpId) ? s.selectedOpId : null,
    }
  }),

  redo: () => set(s => {
    if (s.future.length === 0) return s
    const next = s.future[s.future.length - 1]
    return {
      past: [...s.past, { shapes: s.shapes, operations: s.operations }],
      future: s.future.slice(0, -1),
      shapes: next.shapes,
      operations: next.operations,
      selectedShapeIds: new Set(
        [...s.selectedShapeIds].filter(id => next.shapes.some(sh => sh.id === id))
      ),
      selectedOpId: next.operations.some(o => o.id === s.selectedOpId) ? s.selectedOpId : null,
    }
  }),

  addTool: (t) => set(s => ({ tools: [...s.tools, { ...t, id: uid() }] })),
  updateTool: (id, u) => set(s => ({ tools: s.tools.map(t => t.id === id ? { ...t, ...u } : t) })),
  deleteTool: (id) => set(s => ({ tools: s.tools.filter(t => t.id !== id) })),

  addShape: (shape) => {
    const id = uid()
    set(s => ({ ..._snap(s), shapes: [...s.shapes, { ...shape, id }] }))
    return id
  },
  updateShape: (id, u) => set(s => ({
    shapes: s.shapes.map(sh => sh.id === id ? { ...sh, ...u } : sh)
  })),
  deleteShape: (id) => set(s => ({
    ..._snap(s),
    shapes: s.shapes.filter(sh => sh.id !== id),
    operations: s.operations.filter(op => op.shapeId !== id),
    selectedShapeIds: new Set([...s.selectedShapeIds].filter(i => i !== id)),
  })),
  addShapes: (ss) => set(s => ({
    ..._snap(s),
    shapes: [...s.shapes, ...ss.map(sh => ({ ...sh, id: uid() }))]
  })),
  setSelectedShapes: (ids) => set({ selectedShapeIds: ids }),
  clearShapes: () => set(s => ({
    ..._snap(s),
    shapes: [],
    operations: [],
    selectedShapeIds: new Set(),
    generatedGcode: null,
  })),

  addOperation: (op) => {
    const id = uid()
    set(s => ({ ..._snap(s), operations: [...s.operations, { ...op, id }] }))
    return id
  },
  updateOperation: (id, u) => set(s => ({
    ..._snap(s),
    operations: s.operations.map(op => op.id === id ? { ...op, ...u } : op)
  })),
  deleteOperation: (id) => set(s => ({
    ..._snap(s),
    operations: s.operations.filter(op => op.id !== id),
    selectedOpId: s.selectedOpId === id ? null : s.selectedOpId,
  })),
  setSelectedOp: (id) => set({ selectedOpId: id }),
  setGeneratedGcode: (g) => set({ generatedGcode: g }),
}))

// Default operation values given a tool
export function defaultOperation(
  shapeId: string,
  tool: CamTool,
  type: CamOperation['type'] = 'profile'
): Omit<CamOperation, 'id'> {
  const isVBit = tool.name.includes('V-Bit') || tool.notes?.includes('angle')
  return {
    type,
    label: `${type.charAt(0).toUpperCase()}${type.slice(1)} - ${tool.name}`,
    shapeId,
    toolId: tool.id,
    enabled: true,
    safeZ: 5,
    startZ: 0,
    targetDepth: 3,
    stepDown: isVBit ? 3 : 1,
    side: 'outside',
    stepOver: 0.4,
    feedRate: 600,
    plungeRate: 200,
    spindleRPM: 18000,
  }
}
