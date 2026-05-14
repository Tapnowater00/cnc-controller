import { Vec2 } from './types'
import { add, sub, normalize, perpRight, dot, scale, len } from './geometry'

/**
 * Offset a closed polygon by `d` mm.
 * d > 0 expands a CCW polygon (outside offset).
 * d < 0 shrinks a CCW polygon (inside offset).
 * Uses miter joins with a 4× miter limit.
 */
export function offsetPolygon(pts: Vec2[], d: number): Vec2[] {
  if (pts.length < 3) return pts
  const n = pts.length
  const result: Vec2[] = []

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const curr = pts[i]
    const next = pts[(i + 1) % n]

    // Edge directions
    const d1 = normalize(sub(curr, prev))   // incoming
    const d2 = normalize(sub(next, curr))   // outgoing

    // Outward normals (right-hand perp for CCW polygon)
    const n1 = perpRight(d1)
    const n2 = perpRight(d2)

    // Angle bisector
    const bisSum = { x: n1.x + n2.x, y: n1.y + n2.y }
    const bisLen = len(bisSum)

    if (bisLen < 1e-9) {
      // Anti-parallel edges — straight offset
      result.push(add(curr, scale(n1, d)))
      continue
    }

    const bisector = normalize(bisSum)
    const cosHalf = dot(bisector, n1)

    // miter_length = d / cos(half-angle), clamped to 4× limit
    const miterLen = Math.abs(cosHalf) > 0.1
      ? d / cosHalf
      : d * Math.sign(cosHalf || 1)
    const limit = Math.abs(d) * 4
    const clamped = Math.max(-limit, Math.min(limit, miterLen))

    result.push(add(curr, scale(bisector, clamped)))
  }

  return result
}

/**
 * Shrink polygon inward in concentric rings for contour pocket clearing.
 * Returns rings ordered outward→inward (first ring is the first inward pass).
 */
export function concentricRings(pts: Vec2[], toolRadius: number, stepOver: number): Vec2[][] {
  const rings: Vec2[][] = []
  let offset = toolRadius

  // Estimate max rings based on bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const maxDim = Math.max(maxX - minX, maxY - minY)
  const maxRings = Math.ceil(maxDim / stepOver / 2) + 2

  for (let i = 0; i < maxRings; i++) {
    const ring = offsetPolygon(pts, -offset)
    if (ring.length < 3) break

    // Check ring hasn't collapsed (all points near same location)
    let rMinX = Infinity, rMaxX = -Infinity
    for (const p of ring) {
      if (p.x < rMinX) rMinX = p.x; if (p.x > rMaxX) rMaxX = p.x
    }
    if (rMaxX - rMinX < stepOver * 0.1) break

    rings.push(ring)
    offset += stepOver
  }

  return rings
}
