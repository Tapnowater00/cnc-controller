export interface Vec2 { x: number; y: number }

export interface CamTool {
  id: string
  name: string
  diameter: number       // mm
  flutes: number
  material: 'hss' | 'carbide' | 'diamond' | 'cobalt'
  notes?: string
}

export type ShapeKind = 'rect' | 'circle' | 'polyline' | 'imported'

export interface CamShape {
  id: string
  label: string
  kind: ShapeKind
  points: Vec2[]   // polyline representation (circles tessellated, etc.)
  closed: boolean
  // parametric data for display/editing
  params?: RectParams | CircleParams
}

export interface RectParams {
  type: 'rect'
  x: number; y: number; w: number; h: number
}

export interface CircleParams {
  type: 'circle'
  cx: number; cy: number; r: number
}

export type OperationType = 'profile' | 'pocket' | 'drill' | 'engrave'
export type ProfileSide = 'inside' | 'outside' | 'on'

export interface CamOperation {
  id: string
  type: OperationType
  label: string
  shapeId: string
  toolId: string
  enabled: boolean
  // depth
  safeZ: number
  startZ: number
  targetDepth: number   // mm below startZ (positive number)
  stepDown: number      // mm per pass
  // profile options
  side: ProfileSide
  // pocket options
  stepOver: number      // fraction of tool diameter (e.g. 0.4 = 40%)
  // feeds
  feedRate: number      // mm/min
  plungeRate: number    // mm/min
  spindleRPM: number
  // tabs (optional, simplified)
  tabHeight?: number    // mm above bottom — not cut through
  tabWidth?: number     // mm
  tabCount?: number
}
