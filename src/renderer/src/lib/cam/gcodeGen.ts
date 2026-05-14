import { CamOperation, CamTool } from './types'
import { Toolpath, Move } from './toolpath'

function fmt(n: number) { return n.toFixed(3) }

export function toolpathToGcode(tp: Toolpath, op: CamOperation, tool: CamTool): string {
  const lines: string[] = []

  lines.push(`; =============================================`)
  lines.push(`; Operation : ${op.label}`)
  lines.push(`; Type      : ${op.type}`)
  lines.push(`; Tool      : ${tool.name} (Ø${tool.diameter}mm, ${tool.flutes} flute)`)
  lines.push(`; Depth     : ${op.targetDepth}mm in ${Math.ceil(op.targetDepth / op.stepDown)} passes`)
  lines.push(`; Feed      : ${op.feedRate}mm/min  Plunge: ${op.plungeRate}mm/min`)
  lines.push(`; Spindle   : ${op.spindleRPM} RPM`)
  lines.push(`; =============================================`)
  lines.push('')
  lines.push('G90 G21      ; absolute coordinates, metric')
  lines.push('G17          ; XY plane')
  lines.push(`S${op.spindleRPM} M3  ; spindle on CW at ${op.spindleRPM} RPM`)
  lines.push('G4 P2        ; 2-second dwell for spindle spin-up')
  lines.push('')

  let curX: number | undefined, curY: number | undefined, curZ: number | undefined
  let curF: number | undefined

  for (const m of tp.moves) {
    const parts: string[] = []

    if (m.type === 'rapid' || m.type === 'retract') {
      const hasX = m.x !== undefined && m.x !== curX
      const hasY = m.y !== undefined && m.y !== curY
      const hasZ = m.z !== curZ

      if (!hasX && !hasY && !hasZ) continue

      parts.push('G0')
      if (hasZ) { parts.push(`Z${fmt(m.z)}`); curZ = m.z }
      if (hasX) { parts.push(`X${fmt(m.x!)}`); curX = m.x }
      if (hasY) { parts.push(`Y${fmt(m.y!)}`); curY = m.y }

    } else if (m.type === 'plunge') {
      parts.push('G1')
      if (m.z !== curZ) { parts.push(`Z${fmt(m.z)}`); curZ = m.z }
      if (m.f && m.f !== curF) { parts.push(`F${m.f}`); curF = m.f }

    } else if (m.type === 'cut') {
      const hasX = m.x !== undefined && m.x !== curX
      const hasY = m.y !== undefined && m.y !== curY
      const hasZ = m.z !== curZ
      if (!hasX && !hasY && !hasZ) continue

      parts.push('G1')
      if (hasX) { parts.push(`X${fmt(m.x!)}`); curX = m.x }
      if (hasY) { parts.push(`Y${fmt(m.y!)}`); curY = m.y }
      if (hasZ) { parts.push(`Z${fmt(m.z)}`); curZ = m.z }
      if (m.f && m.f !== curF) { parts.push(`F${m.f}`); curF = m.f }
    }

    if (parts.length > 1) lines.push(parts.join(' '))
  }

  lines.push('')
  lines.push('M5           ; spindle off')
  lines.push(`G0 Z${fmt(op.safeZ + 10)}  ; safe retract`)
  lines.push('M30          ; program end')

  return lines.join('\n')
}

export function combineGcode(gcodes: string[]): string {
  return gcodes.join('\n\n') + '\n'
}

// Estimate runtime in seconds
export function estimateTime(tp: Toolpath, op: CamOperation): number {
  let secs = 0
  let curX = 0, curY = 0, curZ = 0

  for (const m of tp.moves) {
    const nx = m.x ?? curX
    const ny = m.y ?? curY
    const nz = m.z

    const dx = nx - curX, dy = ny - curY, dz = nz - curZ
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (m.type === 'rapid' || m.type === 'retract') {
      secs += dist / 3000 * 60   // assume 3000mm/min rapid
    } else if (m.type === 'plunge') {
      secs += dist / (m.f ?? op.plungeRate) * 60
    } else if (m.type === 'cut') {
      secs += dist / op.feedRate * 60
    }

    curX = nx; curY = ny; curZ = nz
  }

  return Math.round(secs)
}
