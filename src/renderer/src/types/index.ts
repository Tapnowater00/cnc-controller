export type MachineState =
  | 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm'
  | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Unknown'

export interface Vec3 { x: number; y: number; z: number }

export interface MachineStatus {
  state: MachineState
  subState?: number
  mpos: Vec3
  wpos: Vec3
  wco: Vec3
  feedRate: number
  spindleRPM: number
  plannerBuffer: number
  rxBuffer: number
  overrides: { feed: number; rapid: number; spindle: number }
  pins: string
  accessories: string
  lineNumber?: number
}

export interface Setting {
  id: number
  value: string
  description: string
  group: string
}

export interface WCSOffsets {
  G54: Vec3; G55: Vec3; G56: Vec3
  G57: Vec3; G58: Vec3; G59: Vec3
  G28: Vec3; G30: Vec3; G92: Vec3
  TLO: number; PRB: Vec3 & { result: number }
}

export interface Macro {
  id: string
  label: string
  gcode: string
  shortcut?: string
  color?: string
}

export interface MachineProfile {
  id: string
  name: string
  workArea: { x: number; y: number; z: number }
  safeZ: number
  probeThickness: number
  probeApproachSpeed: number
  probeRetract: number
}

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  productId?: string
  vendorId?: string
}

export interface StreamProgress {
  current: number
  total: number
  eta: number
}

export interface Segment {
  type: 'rapid' | 'cut'
  start: Vec3
  end: Vec3
}

export type WCSName = 'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59'
