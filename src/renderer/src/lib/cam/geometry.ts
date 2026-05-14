import { Vec2 } from './types'

export function v2(x: number, y: number): Vec2 { return { x, y } }
export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y } }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y } }
export function scale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s } }
export function len(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y) }
export function dist(a: Vec2, b: Vec2): number { return len(sub(b, a)) }
export function normalize(v: Vec2): Vec2 {
  const l = len(v)
  return l > 1e-10 ? scale(v, 1 / l) : { x: 0, y: 0 }
}
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y }
export function cross(a: Vec2, b: Vec2): number { return a.x * b.y - a.y * b.x }
// Right-hand perpendicular (90° CW): for CCW polygon this points outward
export function perpRight(v: Vec2): Vec2 { return { x: v.y, y: -v.x } }
// Left-hand perpendicular (90° CCW)
export function perpLeft(v: Vec2): Vec2 { return { x: -v.y, y: v.x } }

// Signed area (positive = CCW winding)
export function signedArea(pts: Vec2[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return a / 2
}

export function isCCW(pts: Vec2[]): boolean { return signedArea(pts) > 0 }

export function centroid(pts: Vec2[]): Vec2 {
  let x = 0, y = 0
  for (const p of pts) { x += p.x; y += p.y }
  return { x: x / pts.length, y: y / pts.length }
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

export function bbox(pts: Vec2[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

// Tessellate a circle to polyline
export function tessellateCircle(cx: number, cy: number, r: number, segs = 64): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

// Tessellate an arc (angles in radians, CCW from startAngle to endAngle)
export function tessellateArc(cx: number, cy: number, r: number,
  startAngle: number, endAngle: number, ccw: boolean, segs = 32): Vec2[] {
  const pts: Vec2[] = []
  let span = endAngle - startAngle
  if (ccw && span < 0) span += Math.PI * 2
  if (!ccw && span > 0) span -= Math.PI * 2
  for (let i = 0; i <= segs; i++) {
    const a = startAngle + (i / segs) * span
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

// Point in polygon (even-odd rule)
export function pointInPolygon(pt: Vec2, pts: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y
    const xj = pts[j].x, yj = pts[j].y
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// Scanline intersections for raster fill
export function scanlineIntersect(pts: Vec2[], y: number): number[] {
  const xs: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    const y0 = pts[i].y, y1 = pts[j].y
    if (Math.abs(y1 - y0) < 1e-9) continue
    if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
      const t = (y - y0) / (y1 - y0)
      xs.push(pts[i].x + t * (pts[j].x - pts[i].x))
    }
  }
  return xs.sort((a, b) => a - b)
}
