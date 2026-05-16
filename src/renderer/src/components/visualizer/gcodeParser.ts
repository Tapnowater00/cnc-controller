import type { Segment, Vec3 } from '../../types'

interface ModalState {
  motionMode: number // 0=rapid, 1=linear, 2=cw arc, 3=ccw arc
  units: 'mm' | 'inch'
  absolute: boolean
  plane: 'XY' | 'XZ' | 'YZ'
  spindleOn: boolean
  feed: number
}

function tokenize(line: string): Record<string, number> {
  const clean = line.split(';')[0].split('(')[0].trim().toUpperCase()
  const tokens: Record<string, number> = {}
  const re = /([A-Z])([+-]?\d+\.?\d*)/g
  let m
  while ((m = re.exec(clean)) !== null) {
    tokens[m[1]] = parseFloat(m[2])
  }
  return tokens
}

function arcToSegments(start: Vec3, end: Vec3, center: Vec3, clockwise: boolean, plane: 'XY' | 'XZ' | 'YZ'): Vec3[] {
  // Get axes for this plane
  const [ax1, ax2, ax3] = plane === 'XY' ? ['x', 'y', 'z'] : plane === 'XZ' ? ['x', 'z', 'y'] : ['y', 'z', 'x']

  const r = Math.sqrt(
    Math.pow((start as any)[ax1] - (center as any)[ax1], 2) +
    Math.pow((start as any)[ax2] - (center as any)[ax2], 2)
  )
  if (r < 0.0001) return [end]

  let startAngle = Math.atan2(
    (start as any)[ax2] - (center as any)[ax2],
    (start as any)[ax1] - (center as any)[ax1]
  )
  let endAngle = Math.atan2(
    (end as any)[ax2] - (center as any)[ax2],
    (end as any)[ax1] - (center as any)[ax1]
  )

  if (clockwise && endAngle > startAngle) endAngle -= Math.PI * 2
  if (!clockwise && endAngle < startAngle) endAngle += Math.PI * 2

  const angleDiff = Math.abs(endAngle - startAngle)
  const segments = Math.max(8, Math.ceil((angleDiff / (Math.PI * 2)) * 64))
  const points: Vec3[] = []

  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const angle = startAngle + (endAngle - startAngle) * t
    const p: Vec3 = { ...start }
    ;(p as any)[ax1] = (center as any)[ax1] + r * Math.cos(angle)
    ;(p as any)[ax2] = (center as any)[ax2] + r * Math.sin(angle)
    // Interpolate the linear axis
    ;(p as any)[ax3] = (start as any)[ax3] + ((end as any)[ax3] - (start as any)[ax3]) * t
    points.push(p)
  }
  return points
}

export function parseGcode(lines: string[]): Segment[] {
  const segments: Segment[] = []
  const modal: ModalState = {
    motionMode: 0,
    units: 'mm',
    absolute: true,
    plane: 'XY',
    spindleOn: false,
    feed: 1000,
  }
  let pos: Vec3 = { x: 0, y: 0, z: 0 }

  for (const line of lines) {
    const t = tokenize(line)
    if (Object.keys(t).length === 0) continue

    // Modal group updates
    if (t.G !== undefined) {
      const g = t.G
      if (g === 20) modal.units = 'inch'
      else if (g === 21) modal.units = 'mm'
      else if (g === 90) modal.absolute = true
      else if (g === 91) modal.absolute = false
      else if (g === 17) modal.plane = 'XY'
      else if (g === 18) modal.plane = 'XZ'
      else if (g === 19) modal.plane = 'YZ'
      else if (g === 0 || g === 1 || g === 2 || g === 3) modal.motionMode = g
    }
    if (t.M !== undefined) {
      if (t.M === 3 || t.M === 4) modal.spindleOn = true
      else if (t.M === 5) modal.spindleOn = false
    }
    if (t.F !== undefined) modal.feed = t.F

    // Determine target position
    const resolve = (axis: 'x' | 'y' | 'z', word: 'X' | 'Y' | 'Z') => {
      if (t[word] === undefined) return pos[axis]
      return modal.absolute ? t[word] : pos[axis] + t[word]
    }

    const motionCode = t.G !== undefined && [0, 1, 2, 3].includes(t.G) ? t.G : modal.motionMode
    const hasMotion = t.X !== undefined || t.Y !== undefined || t.Z !== undefined

    if (!hasMotion) continue
    if (motionCode !== 0 && motionCode !== 1 && motionCode !== 2 && motionCode !== 3) continue

    const target: Vec3 = {
      x: resolve('x', 'X'),
      y: resolve('y', 'Y'),
      z: resolve('z', 'Z'),
    }

    if (motionCode === 0 || motionCode === 1) {
      const isCut = motionCode === 1
      segments.push({
        type: isCut ? 'cut' : 'rapid',
        start: { ...pos }, end: { ...target },
        feed: isCut ? modal.feed : undefined,
      })
      pos = target
    } else if (motionCode === 2 || motionCode === 3) {
      const center: Vec3 = {
        x: pos.x + (t.I ?? 0),
        y: pos.y + (t.J ?? 0),
        z: pos.z + (t.K ?? 0),
      }
      const arcPoints = arcToSegments(pos, target, center, motionCode === 2, modal.plane)
      let prev = pos
      for (const pt of arcPoints) {
        segments.push({ type: 'cut', start: { ...prev }, end: { ...pt }, feed: modal.feed })
        prev = pt
      }
      pos = target
    }
  }

  return segments
}
