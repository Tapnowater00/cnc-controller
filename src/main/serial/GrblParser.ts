export type MachineState =
  | 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm'
  | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Tool' | 'Unknown'

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
  firmware?: string
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
  TLO: number
  PRB: Vec3 & { result: number }
}

const ALARM_CODES: Record<number, string> = {
  1: 'Hard limit triggered — check limit switches',
  2: 'G-code motion target exceeds machine travel',
  3: 'Reset while in motion',
  4: 'Probe fail — probe not in expected initial state',
  5: 'Probe fail — probe did not contact workpiece',
  6: 'Homing fail — reset during homing cycle',
  7: 'Homing fail — door opened during homing',
  8: 'Homing fail — cycle failed to clear limit switch',
  9: 'Homing fail — could not find limit switch',
  10: 'EStop active',
  11: 'Homing required — machine position unknown',
  12: 'Limit switch engaged — clear before continuing',
  13: 'Probe protection triggered',
  14: 'Spindle at speed timeout',
  15: 'Homing fail — second switch not found',
  16: 'Homing fail — spindle running during homing',
  17: 'Safety door opened and closed — resuming',
  18: 'Homing fail — bad configuration',
}

const ERROR_CODES: Record<number, string> = {
  1: 'G-code words consist of a letter and a value — missing value',
  2: 'Numeric value format is not valid or missing',
  3: 'Grbl dollar sign not recognized or supported',
  4: 'Negative value for expected positive value',
  5: 'Homing cycle failure — check limit switch wiring',
  6: 'Minimum step pulse time too small',
  7: 'EEPROM read failed — default values used',
  8: 'Grbl dollar sign command cannot be used unless idle',
  9: 'G-code locked during alarm state',
  10: 'Soft limits cannot be enabled without homing enabled',
  11: 'Max characters per line exceeded',
  12: 'Grbl dollar sign setting exceeds limit',
  13: 'Safety door detected',
  14: 'Build info or startup line exceeded line length',
  15: 'Jog target exceeds machine travel',
  16: 'Jog command with no feed rate',
  17: 'Laser mode requires PWM output',
  20: 'Unsupported or invalid G-code command',
  21: 'More than one G-code command in a modal group',
  22: 'Feed rate has not yet been set',
  23: 'G-code command requires an integer value',
  24: 'More than one G-code command using axis words',
  25: 'Repeated G-code word in block',
  26: 'No axis words found in command block',
  27: 'Line number value is invalid',
  28: 'G-code command is missing a required value word',
  29: 'G59.x work coordinate systems are not supported',
  30: 'G53 only allowed with G0 and G1 motion modes',
  31: 'Unused value words found in block',
  32: 'G2/G3 arcs require at least one in-plane offset',
  33: 'Motion command target is invalid',
  34: 'Arc radius value is invalid',
  35: 'G2/G3 arc missing necessary in-plane word',
  36: 'Unused, reserved',
  37: 'P word is not an integer or out of range',
  38: 'Retract motion not allowed with homing enabled',
  39: 'Non-modal G-code command not allowed with motion',
}

function parseVec3(s: string): Vec3 {
  const parts = s.split(',').map(Number)
  return { x: parts[0] ?? 0, y: parts[1] ?? 0, z: parts[2] ?? 0 }
}

export function parseStatusReport(line: string): MachineStatus | null {
  if (!line.startsWith('<') || !line.endsWith('>')) return null
  const content = line.slice(1, -1)
  const parts = content.split('|')

  const statePart = parts[0]
  const colonIdx = statePart.indexOf(':')
  const stateStr = colonIdx >= 0 ? statePart.slice(0, colonIdx) : statePart
  const subState = colonIdx >= 0 ? parseInt(statePart.slice(colonIdx + 1)) : undefined

  const status: MachineStatus = {
    state: stateStr as MachineState,
    subState,
    mpos: { x: 0, y: 0, z: 0 },
    wpos: { x: 0, y: 0, z: 0 },
    wco: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleRPM: 0,
    plannerBuffer: 15,
    rxBuffer: 128,
    overrides: { feed: 100, rapid: 100, spindle: 100 },
    pins: '',
    accessories: '',
  }

  let hasMPos = false
  let hasWPos = false

  for (let i = 1; i < parts.length; i++) {
    const colonPos = parts[i].indexOf(':')
    if (colonPos < 0) continue
    const key = parts[i].slice(0, colonPos)
    const val = parts[i].slice(colonPos + 1)

    switch (key) {
      case 'MPos':
        status.mpos = parseVec3(val)
        hasMPos = true
        break
      case 'WPos':
        status.wpos = parseVec3(val)
        hasWPos = true
        break
      case 'WCO':
        status.wco = parseVec3(val)
        break
      case 'FS': {
        const fs = val.split(',').map(Number)
        status.feedRate = fs[0] ?? 0
        status.spindleRPM = fs[1] ?? 0
        break
      }
      case 'F':
        status.feedRate = Number(val)
        break
      case 'S':
        status.spindleRPM = Number(val)
        break
      case 'Bf': {
        const bf = val.split(',').map(Number)
        status.plannerBuffer = bf[0] ?? 15
        status.rxBuffer = bf[1] ?? 128
        break
      }
      case 'Ov': {
        const ov = val.split(',').map(Number)
        status.overrides = {
          feed: ov[0] ?? 100,
          rapid: ov[1] ?? 100,
          spindle: ov[2] ?? 100,
        }
        break
      }
      case 'Pn':
        status.pins = val
        break
      case 'A':
        status.accessories = val
        break
      case 'Ln':
        status.lineNumber = Number(val)
        break
      case 'FW':
        status.firmware = val
        break
    }
  }

  // Derive wpos from mpos+wco or mpos from wpos+wco
  if (hasMPos && !hasWPos) {
    status.wpos = {
      x: status.mpos.x - status.wco.x,
      y: status.mpos.y - status.wco.y,
      z: status.mpos.z - status.wco.z,
    }
  } else if (hasWPos && !hasMPos) {
    status.mpos = {
      x: status.wpos.x + status.wco.x,
      y: status.wpos.y + status.wco.y,
      z: status.wpos.z + status.wco.z,
    }
  }

  return status
}

export function parseAlarm(line: string): { code: number; description: string } | null {
  const m = line.match(/^ALARM:(\d+)/)
  if (!m) return null
  const code = parseInt(m[1])
  return { code, description: ALARM_CODES[code] ?? `Alarm ${code}` }
}

export function parseError(line: string): { code: number; description: string } | null {
  const m = line.match(/^error:(\d+)/)
  if (!m) return null
  const code = parseInt(m[1])
  return { code, description: ERROR_CODES[code] ?? `Error ${code}` }
}

export function parseSettings(lines: string[]): Setting[] {
  const GROUPS: Record<number, string> = {
    0: 'Motion', 1: 'Motion', 2: 'Motion', 3: 'Motion', 4: 'Motion',
    5: 'Limits', 6: 'Probing',
    10: 'Display', 11: 'Motion', 12: 'Motion', 13: 'Units',
    14: 'Motion', 15: 'Motion', 16: 'Spindle', 17: 'Spindle',
    18: 'Safety', 19: 'Homing',
    20: 'Limits', 21: 'Limits', 22: 'Homing', 23: 'Homing',
    24: 'Homing', 25: 'Homing', 26: 'Homing', 27: 'Homing',
    28: 'Motion', 29: 'Motion',
    30: 'Spindle', 31: 'Spindle', 32: 'Spindle', 33: 'Spindle',
    34: 'Spindle', 35: 'Spindle', 36: 'Spindle',
    37: 'Safety',
    40: 'Probing', 41: 'Probing', 42: 'Probing', 43: 'Probing', 44: 'Probing',
    100: 'Axes', 101: 'Axes', 102: 'Axes',
    110: 'Axes', 111: 'Axes', 112: 'Axes',
    120: 'Axes', 121: 'Axes', 122: 'Axes',
    130: 'Axes', 131: 'Axes', 132: 'Axes',
  }
  const settings: Setting[] = []
  for (const line of lines) {
    const m = line.match(/^\$(\d+)=(\S+)\s*(?:\((.+)\))?/)
    if (!m) continue
    const id = parseInt(m[1])
    settings.push({
      id,
      value: m[2],
      description: m[3] ?? `Setting $${id}`,
      group: GROUPS[id] ?? 'Other',
    })
  }
  return settings
}

export function parseWCSOffsets(lines: string[]): Partial<Record<string, Vec3 | number | (Vec3 & { result: number })>> {
  const result: Record<string, any> = {}
  for (const line of lines) {
    const m = line.match(/^\[([A-Z0-9]+):([^\]]+)\]/)
    if (!m) continue
    const key = m[1]
    const vals = m[2].split(',').map(Number)
    if (key === 'TLO') {
      result[key] = vals[0]
    } else if (key === 'PRB') {
      result[key] = { x: vals[0], y: vals[1], z: vals[2], result: vals[3] ?? 0 }
    } else {
      result[key] = { x: vals[0], y: vals[1], z: vals[2] }
    }
  }
  return result
}
