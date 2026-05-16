import { create } from 'zustand'
import type { MachineState, Vec3, Setting, WCSOffsets, WCSName } from '../types'

// Reuse parser logic in renderer (shared constants only, no Node deps)
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
}

// Standard grbl 1.1 error codes 1-30 (also valid on grblHAL). Anything
// unrecognised falls back to "Error N" so newer firmwares still parse.
const ERROR_CODES: Record<number, string> = {
  1: 'G-code words consist of a letter and a value',
  2: 'Numeric value format is not valid or missing',
  3: '$ system command was not recognized or supported',
  4: 'Negative value received for an expected positive value',
  5: 'Homing cycle is not enabled via settings',
  6: 'Minimum step pulse time must be greater than 3µs',
  7: 'EEPROM read failed — reset and restored to defaults',
  8: '$ command cannot be used unless controller is Idle',
  9: 'G-code locked out during alarm or jog state',
  10: 'Soft limits cannot be enabled without homing also enabled',
  11: 'Max characters per line exceeded',
  12: '$ setting value exceeds the maximum step rate supported',
  13: 'Safety door opened — door state initiated',
  14: 'Build info or startup line exceeded EEPROM length limit',
  15: 'Jog target exceeds machine travel',
  16: 'Jog command missing "=" or contains prohibited G-code',
  17: 'Laser mode requires PWM output',
  20: 'Unsupported or invalid G-code command',
  21: 'More than one G-code command from the same modal group',
  22: 'Feed rate has not yet been set or is undefined',
  23: 'G-code command requires an integer value',
  24: 'Two G-code commands both requiring XYZ axis words',
  25: 'A G-code word was repeated in the block',
  26: 'G-code requires XYZ axis words but none were detected',
  27: 'N line number is not within 1–9,999,999',
  28: 'Missing required P or L value word',
  29: 'G59.1, G59.2, G59.3 are not supported',
  30: 'G53 requires G0 or G1 motion mode to be active',
}

function parseVec3(s: string): Vec3 {
  const p = s.split(',').map(Number)
  return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 }
}

function parseStatus(line: string) {
  const content = line.slice(1, -1)
  const parts = content.split('|')
  const statePart = parts[0]
  const ci = statePart.indexOf(':')
  const state = (ci >= 0 ? statePart.slice(0, ci) : statePart) as MachineState
  const subState = ci >= 0 ? parseInt(statePart.slice(ci + 1)) : undefined

  let mpos: Vec3 = { x: 0, y: 0, z: 0 }
  let wpos: Vec3 = { x: 0, y: 0, z: 0 }
  let wco: Vec3 = { x: 0, y: 0, z: 0 }
  let feedRate = 0, spindleRPM = 0, plannerBuffer = 15, rxBuffer = 128
  let overrides = { feed: 100, rapid: 100, spindle: 100 }
  let pins = '', accessories = '', firmware = ''
  let hasMPos = false, hasWPos = false, lineNumber: number | undefined

  for (let i = 1; i < parts.length; i++) {
    const ci2 = parts[i].indexOf(':')
    if (ci2 < 0) continue
    const k = parts[i].slice(0, ci2)
    const v = parts[i].slice(ci2 + 1)
    if (k === 'MPos') { mpos = parseVec3(v); hasMPos = true }
    else if (k === 'WPos') { wpos = parseVec3(v); hasWPos = true }
    else if (k === 'WCO') { wco = parseVec3(v) }
    else if (k === 'FS') { const fs = v.split(',').map(Number); feedRate = fs[0]??0; spindleRPM = fs[1]??0 }
    else if (k === 'F') { feedRate = Number(v) }
    else if (k === 'S') { spindleRPM = Number(v) }
    else if (k === 'Bf') { const bf = v.split(',').map(Number); plannerBuffer = bf[0]??15; rxBuffer = bf[1]??128 }
    else if (k === 'Ov') { const ov = v.split(',').map(Number); overrides = { feed: ov[0]??100, rapid: ov[1]??100, spindle: ov[2]??100 } }
    else if (k === 'Pn') { pins = v }
    else if (k === 'A') { accessories = v }
    else if (k === 'Ln') { lineNumber = Number(v) }
    else if (k === 'FW') { firmware = v }
  }

  if (hasMPos && !hasWPos) {
    wpos = { x: mpos.x - wco.x, y: mpos.y - wco.y, z: mpos.z - wco.z }
  } else if (hasWPos && !hasMPos) {
    mpos = { x: wpos.x + wco.x, y: wpos.y + wco.y, z: wpos.z + wco.z }
  }

  return { state, subState, mpos, wpos, wco, feedRate, spindleRPM, plannerBuffer, rxBuffer, overrides, pins, accessories, lineNumber, firmware }
}

interface MachineStore {
  connected: boolean
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
  alarmCode: number | null
  alarmDescription: string | null
  errorMessage: string | null
  activeWCS: WCSName
  units: 'mm' | 'inch'
  firmware: string
  firmwareFamily: 'grbl' | 'grblhal' | 'unknown'
  // Streaming
  streaming: boolean
  streamingFile: string
  streamingProgress: number
  streamingCurrentLine: number
  streamingTotalLines: number
  streamingETA: number
  // Settings
  grblSettings: Setting[]
  settingsBuffer: string[]
  wcsOffsets: Partial<WCSOffsets>
  wcsBuffer: string[]
  // Console log
  consoleLines: { ts: number; text: string; dir: 'rx' | 'tx' }[]
  // Actions
  setConnected: (v: boolean) => void
  handleIncomingLine: (line: string) => void
  send: (data: string) => void
  sendRealtime: (byte: number) => void
  clearAlarm: () => void
  clearError: () => void
  setUnits: (u: 'mm' | 'inch') => void
  setActiveWCS: (wcs: WCSName) => void
  setStreaming: (v: boolean, file?: string) => void
  updateStreamProgress: (current: number, total: number, eta: number) => void
  fetchSettings: () => void
  fetchWCS: () => void
  addConsoleLine: (text: string, dir: 'rx' | 'tx') => void
  clearConsole: () => void
}

const MAX_CONSOLE = 1000

export const useMachineStore = create<MachineStore>((set, get) => ({
  connected: false,
  state: 'Unknown' as MachineState,
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
  alarmCode: null,
  alarmDescription: null,
  errorMessage: null,
  activeWCS: 'G54',
  units: 'mm',
  firmware: '',
  firmwareFamily: 'unknown',
  streaming: false,
  streamingFile: '',
  streamingProgress: 0,
  streamingCurrentLine: 0,
  streamingTotalLines: 0,
  streamingETA: 0,
  grblSettings: [],
  settingsBuffer: [],
  wcsOffsets: {},
  wcsBuffer: [],
  consoleLines: [],

  setConnected: (v) => set({ connected: v }),

  handleIncomingLine: (line) => {
    const { settingsBuffer, wcsBuffer } = get()
    get().addConsoleLine(line, 'rx')

    if (line.startsWith('<') && line.endsWith('>')) {
      try {
        const s = parseStatus(line)
        set({
          state: s.state,
          subState: s.subState,
          mpos: s.mpos,
          wpos: s.wpos,
          wco: s.wco,
          feedRate: s.feedRate,
          spindleRPM: s.spindleRPM,
          plannerBuffer: s.plannerBuffer,
          rxBuffer: s.rxBuffer,
          overrides: s.overrides,
          pins: s.pins,
          accessories: s.accessories,
          ...(s.firmware ? { firmware: s.firmware } : {}),
        })
      } catch {}
      return
    }

    if (line.startsWith('ALARM:')) {
      const code = parseInt(line.split(':')[1] ?? '0')
      set({ alarmCode: code, alarmDescription: ALARM_CODES[code] ?? `Alarm ${code}`, state: 'Alarm' })
      return
    }

    if (line.startsWith('error:')) {
      const code = parseInt(line.split(':')[1] ?? '0')
      set({ errorMessage: ERROR_CODES[code] ?? `Error ${code}` })
      return
    }

    // Settings accumulation
    if (line.match(/^\$\d+=\S/)) {
      set({ settingsBuffer: [...settingsBuffer, line] })
      return
    }

    // WCS offsets accumulation
    if (line.match(/^\[(G5[4-9]|G28|G30|G92|TLO|PRB):/)) {
      set({ wcsBuffer: [...wcsBuffer, line] })
      return
    }

    // End of settings dump
    if (line === 'ok') {
      const sb = get().settingsBuffer
      if (sb.length > 0) {
        const settings: Setting[] = sb.map(l => {
          const m = l.match(/^\$(\d+)=(\S+)\s*(?:\((.+)\))?/)
          if (!m) return null
          return { id: parseInt(m[1]), value: m[2], description: m[3] ?? `$${m[1]}`, group: 'Other' }
        }).filter(Boolean) as Setting[]
        set({ grblSettings: settings, settingsBuffer: [] })
      }
      const wb = get().wcsBuffer
      if (wb.length > 0) {
        const offsets: Record<string, any> = {}
        for (const l of wb) {
          const m = l.match(/^\[([A-Z0-9]+):([^\]]+)\]/)
          if (!m) continue
          const vals = m[2].split(',').map(Number)
          if (m[1] === 'TLO') offsets[m[1]] = vals[0]
          else if (m[1] === 'PRB') offsets[m[1]] = { x: vals[0], y: vals[1], z: vals[2], result: vals[3] ?? 0 }
          else offsets[m[1]] = { x: vals[0], y: vals[1], z: vals[2] }
        }
        set({ wcsOffsets: offsets, wcsBuffer: [] })
      }
    }

    // Welcome / build info — supports both standard grbl 1.1 and grblHAL.
    if (line.startsWith('Grbl') || line.startsWith('GrblHAL') || line.startsWith('[MSG:')) {
      if (!get().firmware && (line.startsWith('Grbl') || line.startsWith('GrblHAL'))) {
        set({
          firmware: line.split(' ')[1] ?? line,
          firmwareFamily: /grblhal/i.test(line) ? 'grblhal' : 'grbl',
        })
      }
    }
  },

  send: (data) => {
    get().addConsoleLine(data, 'tx')
    window.api.serial.write(data)
  },

  sendRealtime: (byte) => {
    window.api.serial.writeRealtime(byte)
  },

  clearAlarm: () => {
    get().send('$X')
    set({ alarmCode: null, alarmDescription: null })
  },

  clearError: () => set({ errorMessage: null }),

  setUnits: (u) => {
    get().send(u === 'mm' ? 'G21' : 'G20')
    set({ units: u })
    window.api.store.set('preferences.units', u)
  },

  setActiveWCS: (wcs) => {
    get().send(wcs)
    set({ activeWCS: wcs })
  },

  setStreaming: (v, file) => set({
    streaming: v,
    streamingFile: file ?? get().streamingFile,
    ...(v ? {} : { streamingProgress: 0, streamingCurrentLine: 0, streamingTotalLines: 0, streamingETA: 0 }),
  }),

  updateStreamProgress: (current, total, eta) => set({
    streamingCurrentLine: current,
    streamingTotalLines: total,
    streamingProgress: total > 0 ? current / total : 0,
    streamingETA: eta,
  }),

  fetchSettings: () => get().send('$$'),
  fetchWCS: () => get().send('$#'),

  addConsoleLine: (text, dir) => {
    set(state => {
      const lines = [...state.consoleLines, { ts: Date.now(), text, dir }]
      return { consoleLines: lines.length > MAX_CONSOLE ? lines.slice(-MAX_CONSOLE) : lines }
    })
  },

  clearConsole: () => set({ consoleLines: [] }),
}))
