import { Vec2, CamShape } from './types'
import { tessellateCircle, tessellateArc } from './geometry'

function uid() { return Math.random().toString(36).slice(2, 9) }

// Minimal DXF parser — handles LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE, SPLINE
type DxfEntity = { type: string; [key: string]: any }

function parseDXF(content: string): DxfEntity[] {
  // DXF is group-code pairs: even lines = code, odd lines = value
  const lines = content.split(/\r?\n/).map(l => l.trim())
  const entities: DxfEntity[] = []
  let inEntities = false
  let i = 0

  function nextPair(): [number, string] | null {
    while (i < lines.length - 1) {
      const code = parseInt(lines[i])
      const val = lines[i + 1]
      i += 2
      if (!isNaN(code)) return [code, val]
    }
    return null
  }

  // Find ENTITIES section
  while (i < lines.length) {
    const pair = nextPair()
    if (!pair) break
    if (pair[0] === 2 && pair[1] === 'ENTITIES') { inEntities = true; break }
  }
  if (!inEntities) return []

  let current: DxfEntity | null = null

  while (i < lines.length) {
    const pair = nextPair()
    if (!pair) break
    const [code, val] = pair

    if (code === 0) {
      if (current) entities.push(current)
      if (val === 'ENDSEC') break
      current = { type: val }
    } else if (current) {
      // Store by group code — append suffix for repeated codes
      const key = String(code)
      if (key in current) {
        // Make array
        if (!Array.isArray(current[key])) current[key] = [current[key]]
        current[key].push(val)
      } else {
        current[key] = val
      }
    }
  }
  if (current) entities.push(current)
  return entities
}

function n(v: any): number { return parseFloat(v ?? '0') || 0 }

function dxfEntityToShape(e: DxfEntity): CamShape | null {
  const layer = e['8'] ?? 'default'

  if (e.type === 'LINE') {
    return {
      id: uid(), label: `Line (${layer})`, kind: 'imported', closed: false,
      points: [{ x: n(e['10']), y: n(e['20']) }, { x: n(e['11']), y: n(e['21']) }]
    }
  }

  if (e.type === 'CIRCLE') {
    const cx = n(e['10']), cy = n(e['20']), r = n(e['40'])
    return {
      id: uid(), label: `Circle r${r.toFixed(1)} (${layer})`, kind: 'circle', closed: true,
      points: tessellateCircle(cx, cy, r, 64),
      params: { type: 'circle', cx, cy, r }
    }
  }

  if (e.type === 'ARC') {
    const cx = n(e['10']), cy = n(e['20']), r = n(e['40'])
    const startDeg = n(e['50']), endDeg = n(e['51'])
    const startRad = startDeg * Math.PI / 180
    const endRad = endDeg * Math.PI / 180
    const pts = tessellateArc(cx, cy, r, startRad, endRad, true, 32)
    return { id: uid(), label: `Arc (${layer})`, kind: 'imported', closed: false, points: pts }
  }

  if (e.type === 'LWPOLYLINE') {
    // Group codes 10/20 repeated for each vertex
    const xs = Array.isArray(e['10']) ? e['10'].map(n) : [n(e['10'])]
    const ys = Array.isArray(e['20']) ? e['20'].map(n) : [n(e['20'])]
    const pts: Vec2[] = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }))
    const closed = (parseInt(e['70']) & 1) === 1
    if (closed && pts.length > 0) pts.push(pts[0])
    return { id: uid(), label: `Polyline (${layer})`, kind: 'imported', closed, points: pts }
  }

  if (e.type === 'SPLINE') {
    // Approximate with control points
    const xs = Array.isArray(e['10']) ? e['10'].map(n) : [n(e['10'])]
    const ys = Array.isArray(e['20']) ? e['20'].map(n) : [n(e['20'])]
    const pts: Vec2[] = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }))
    return { id: uid(), label: `Spline (${layer})`, kind: 'imported', closed: false, points: pts }
  }

  return null
}

export function importDXF(content: string): CamShape[] {
  const entities = parseDXF(content)
  const shapes: CamShape[] = []
  for (const e of entities) {
    const s = dxfEntityToShape(e)
    if (s && s.points.length >= 2) shapes.push(s)
  }
  return shapes
}
