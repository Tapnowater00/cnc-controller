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

interface CamStore {
  tools: CamTool[]
  shapes: CamShape[]
  operations: CamOperation[]
  selectedShapeIds: Set<string>
  selectedOpId: string | null
  generatedGcode: string | null

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

export const useCamStore = create<CamStore>((set) => ({
  tools: DEFAULT_TOOLS,
  shapes: [],
  operations: [],
  selectedShapeIds: new Set(),
  selectedOpId: null,
  generatedGcode: null,

  addTool: (t) => set(s => ({ tools: [...s.tools, { ...t, id: uid() }] })),
  updateTool: (id, u) => set(s => ({ tools: s.tools.map(t => t.id === id ? { ...t, ...u } : t) })),
  deleteTool: (id) => set(s => ({ tools: s.tools.filter(t => t.id !== id) })),

  addShape: (shape) => {
    const id = uid()
    set(s => ({ shapes: [...s.shapes, { ...shape, id }] }))
    return id
  },
  updateShape: (id, u) => set(s => ({ shapes: s.shapes.map(sh => sh.id === id ? { ...sh, ...u } : sh) })),
  deleteShape: (id) => set(s => ({
    shapes: s.shapes.filter(sh => sh.id !== id),
    operations: s.operations.filter(op => op.shapeId !== id),
    selectedShapeIds: new Set([...s.selectedShapeIds].filter(i => i !== id)),
  })),
  addShapes: (ss) => set(s => ({
    shapes: [...s.shapes, ...ss.map(sh => ({ ...sh, id: uid() }))]
  })),
  setSelectedShapes: (ids) => set({ selectedShapeIds: ids }),
  clearShapes: () => set({ shapes: [], operations: [], selectedShapeIds: new Set(), generatedGcode: null }),

  addOperation: (op) => {
    const id = uid()
    set(s => ({ operations: [...s.operations, { ...op, id }] }))
    return id
  },
  updateOperation: (id, u) => set(s => ({
    operations: s.operations.map(op => op.id === id ? { ...op, ...u } : op)
  })),
  deleteOperation: (id) => set(s => ({
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
