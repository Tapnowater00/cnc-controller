import { CamOperation, CamShape, CamTool } from './types'
import { scanlineIntersect, centroid, bbox } from './geometry'
import { offsetPolygon, concentricRings } from './pathOffset'

export interface Move {
  type: 'rapid' | 'cut' | 'plunge' | 'retract'
  x?: number; y?: number; z: number
  f?: number
}

export interface Toolpath {
  operationId: string
  moves: Move[]
}

function numPasses(op: CamOperation): number {
  return Math.max(1, Math.ceil(op.targetDepth / op.stepDown))
}

function depthAtPass(op: CamOperation, pass: number): number {
  return op.startZ - Math.min(pass * op.stepDown, op.targetDepth)
}

function rasterLines(pts: { x: number; y: number }[], toolRadius: number, stepOver: number): { x: number; y: number }[][] {
  const bb = bbox(pts)
  const lines: { x: number; y: number }[][] = []
  let y = bb.minY + toolRadius
  let dir = 1

  while (y <= bb.maxY - toolRadius + 1e-6) {
    const xs = scanlineIntersect(pts, y)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = xs[k] + toolRadius
      const x1 = xs[k + 1] - toolRadius
      if (x1 > x0) {
        lines.push(dir > 0
          ? [{ x: x0, y }, { x: x1, y }]
          : [{ x: x1, y }, { x: x0, y }])
        dir = -dir
      }
    }
    y += stepOver
  }
  return lines
}

export function generateToolpath(op: CamOperation, shape: CamShape, tool: CamTool): Toolpath {
  const moves: Move[] = []
  const r = tool.diameter / 2
  const stepOver = op.stepOver * tool.diameter
  const passes = numPasses(op)

  // Helper — rapid to XY then plunge
  function plungeTo(x: number, y: number, z: number) {
    moves.push({ type: 'rapid', x, y, z: op.safeZ })
    moves.push({ type: 'rapid', x, y, z: op.safeZ })
    moves.push({ type: 'plunge', x, y, z, f: op.plungeRate })
  }

  function retract() {
    if (moves.length > 0) moves.push({ type: 'retract', z: op.safeZ })
  }

  moves.push({ type: 'rapid', z: op.safeZ })

  const pts = shape.points

  if (op.type === 'engrave') {
    for (let p = 1; p <= passes; p++) {
      const z = depthAtPass(op, p)
      plungeTo(pts[0].x, pts[0].y, z)
      for (let i = 1; i < pts.length; i++)
        moves.push({ type: 'cut', x: pts[i].x, y: pts[i].y, z, f: op.feedRate })
      if (shape.closed)
        moves.push({ type: 'cut', x: pts[0].x, y: pts[0].y, z, f: op.feedRate })
      retract()
    }
  }

  else if (op.type === 'profile') {
    for (let p = 1; p <= passes; p++) {
      const z = depthAtPass(op, p)
      const offset = op.side === 'outside' ? r : op.side === 'inside' ? -r : 0
      const profile = (shape.closed && offset !== 0)
        ? offsetPolygon(pts, offset)
        : pts
      plungeTo(profile[0].x, profile[0].y, z)
      for (let i = 1; i < profile.length; i++)
        moves.push({ type: 'cut', x: profile[i].x, y: profile[i].y, z, f: op.feedRate })
      if (shape.closed)
        moves.push({ type: 'cut', x: profile[0].x, y: profile[0].y, z, f: op.feedRate })
      retract()
    }
  }

  else if (op.type === 'pocket') {
    for (let p = 1; p <= passes; p++) {
      const z = depthAtPass(op, p)

      // Contour rings first (spiral inward)
      const rings = concentricRings(pts, r, stepOver)
      for (const ring of rings) {
        plungeTo(ring[0].x, ring[0].y, z)
        for (let i = 1; i < ring.length; i++)
          moves.push({ type: 'cut', x: ring[i].x, y: ring[i].y, z, f: op.feedRate })
        moves.push({ type: 'cut', x: ring[0].x, y: ring[0].y, z, f: op.feedRate })
        retract()
      }

      // Raster fill for remaining material
      const lines = rasterLines(pts, r, stepOver)
      for (const line of lines) {
        plungeTo(line[0].x, line[0].y, z)
        for (let i = 1; i < line.length; i++)
          moves.push({ type: 'cut', x: line[i].x, y: line[i].y, z, f: op.feedRate })
        retract()
      }
    }
  }

  else if (op.type === 'drill') {
    // Drill at each point, or at centroid if closed shape
    const drillPts = shape.closed ? [centroid(pts)] : pts
    for (let p = 1; p <= passes; p++) {
      const z = depthAtPass(op, p)
      for (const pt of drillPts) {
        plungeTo(pt.x, pt.y, z)
        retract()
      }
    }
  }

  // Final retract
  moves.push({ type: 'rapid', z: op.safeZ + 5 })

  return { operationId: op.id, moves }
}

export function toolpathBounds(tp: Toolpath) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const m of tp.moves) {
    if (m.x !== undefined) { if (m.x < minX) minX = m.x; if (m.x > maxX) maxX = m.x }
    if (m.y !== undefined) { if (m.y < minY) minY = m.y; if (m.y > maxY) maxY = m.y }
  }
  return { minX, minY, maxX, maxY }
}
