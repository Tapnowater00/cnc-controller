import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useCamStore } from '../../stores/camStore'
import { CamShape, Vec2 } from '../../lib/cam/types'
import { tessellateCircle, tessellateEllipse, bbox, centroid } from '../../lib/cam/geometry'
import { Toolpath } from '../../lib/cam/toolpath'

export type DrawTool = 'select' | 'rect' | 'circle' | 'ellipse' | 'polyline' | 'move'

interface Props {
  toolpaths: Toolpath[]
  activeTool: DrawTool
  onToolChange: (t: DrawTool) => void
  snapGrid: number
}

interface ViewState { panX: number; panY: number; zoom: number }

function worldToScreen(wx: number, wy: number, v: ViewState, h: number): [number, number] {
  return [wx * v.zoom + v.panX, h - (wy * v.zoom + v.panY)]
}
function screenToWorld(sx: number, sy: number, v: ViewState, h: number): Vec2 {
  return { x: (sx - v.panX) / v.zoom, y: (h - sy - v.panY) / v.zoom }
}
function snapToGrid(val: number, g: number): number {
  return g > 0 ? Math.round(val / g) * g : val
}
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size = 6) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < size * 2) return
  const ux = dx / len, uy = dy / len
  const mx = x1 + dx * 0.5, my = y1 + dy * 0.5
  ctx.beginPath()
  ctx.moveTo(mx, my)
  ctx.lineTo(mx - ux * size - uy * size * 0.5, my - uy * size + ux * size * 0.5)
  ctx.lineTo(mx - ux * size + uy * size * 0.5, my - uy * size - ux * size * 0.5)
  ctx.closePath()
  ctx.fill()
}

// Build object-snap candidates for a shape (vertices, edge midpoints, centers).
// Imported / dense polylines are limited to vertices + bbox corners + center to avoid spam.
function snapPointsForShape(s: CamShape): Vec2[] {
  const pts = s.points
  if (pts.length < 2) return []
  const out: Vec2[] = []
  const isDense = s.kind === 'imported' || pts.length > 24

  if (isDense) {
    const bb = bbox(pts)
    out.push(
      { x: bb.minX, y: bb.minY }, { x: bb.maxX, y: bb.minY },
      { x: bb.maxX, y: bb.maxY }, { x: bb.minX, y: bb.maxY },
      { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 },
    )
    if (s.kind === 'circle' || s.kind === 'ellipse') {
      // Cardinal points
      out.push(
        { x: bb.minX, y: (bb.minY + bb.maxY) / 2 },
        { x: bb.maxX, y: (bb.minY + bb.maxY) / 2 },
        { x: (bb.minX + bb.maxX) / 2, y: bb.minY },
        { x: (bb.minX + bb.maxX) / 2, y: bb.maxY },
      )
    }
    return out
  }

  for (const p of pts) out.push(p)
  const segs = s.closed ? pts.length : pts.length - 1
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  }
  if (s.closed) out.push(centroid(pts))
  return out
}

const OP_COLORS: Record<string, string> = {
  profile: '#22c55e',
  pocket: '#f59e0b',
  engrave: '#a78bfa',
  drill: '#38bdf8',
}

const SNAP_TOLERANCE_PX = 10

export function CamCanvas({ toolpaths, activeTool, onToolChange, snapGrid }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const store = useCamStore

  // All mutable draw-time state lives in refs so draw() always reads fresh values
  const view = useRef<ViewState>({ panX: 0, panY: 0, zoom: 8 })
  const panning = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const drawStart = useRef<Vec2 | null>(null)
  const polyPts = useRef<Vec2[]>([])
  const mouseWorld = useRef<Vec2>({ x: 0, y: 0 })
  const dragOffset = useRef<Vec2 | null>(null)
  const dragHistoryPushed = useRef(false)
  const marquee = useRef<{ start: Vec2; cur: Vec2 } | null>(null)
  const lastSnap = useRef<Vec2 | null>(null)   // for snap indicator
  const shiftHeld = useRef(false)
  const nudgeTimer = useRef<number | null>(null)
  const activeToolRef = useRef(activeTool)
  const snapGridRef = useRef(snapGrid)
  const toolpathsRef = useRef(toolpaths)
  const showToolpathsRef = useRef(true)
  const [showToolpaths, setShowToolpaths] = useState(true)
  const animFrame = useRef<number | null>(null)

  // Keep refs in sync with props/state
  activeToolRef.current = activeTool
  snapGridRef.current = snapGrid
  toolpathsRef.current = toolpaths
  showToolpathsRef.current = showToolpaths

  // ── Snap resolution: object snap beats grid snap ────────────────────────
  // excludeIds: shapes to skip as snap targets (e.g. the shape being dragged
  // would otherwise self-snap and freeze the drag).
  function resolveSnap(rawWorld: Vec2, excludeIds?: Set<string>): { point: Vec2; objectSnap: Vec2 | null } {
    const canvas = canvasRef.current
    const v = view.current
    if (!canvas) return { point: rawWorld, objectSnap: null }
    const H = canvas.height
    const [sx, sy] = worldToScreen(rawWorld.x, rawWorld.y, v, H)
    let best: { p: Vec2; d: number } | null = null
    const { shapes } = store.getState()
    for (const s of shapes) {
      if (excludeIds && excludeIds.has(s.id)) continue
      for (const p of snapPointsForShape(s)) {
        const [px, py] = worldToScreen(p.x, p.y, v, H)
        const d = Math.hypot(px - sx, py - sy)
        if (d < SNAP_TOLERANCE_PX && (!best || d < best.d)) best = { p, d }
      }
    }
    if (best) return { point: best.p, objectSnap: best.p }
    return {
      point: { x: snapToGrid(rawWorld.x, snapGridRef.current), y: snapToGrid(rawWorld.y, snapGridRef.current) },
      objectSnap: null,
    }
  }

  // ── Core draw — reads everything fresh from refs/store ──────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const v = view.current
    const { shapes, selectedShapeIds, operations } = store.getState()
    const activeTool = activeToolRef.current
    const tps = toolpathsRef.current
    const mw = mouseWorld.current

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, W, H)

    // ── Grid ───────────────────────────────────────────────────────────────
    const worldBL = screenToWorld(0, H, v, H)
    const worldTR = screenToWorld(W, 0, v, H)

    if (v.zoom >= 4) {
      ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = 0.5
      for (let x = Math.floor(worldBL.x); x <= Math.ceil(worldTR.x); x++) {
        if (x % 10 === 0) continue
        const [px] = worldToScreen(x, 0, v, H)
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
      }
      for (let y = Math.floor(worldBL.y); y <= Math.ceil(worldTR.y); y++) {
        if (y % 10 === 0) continue
        const [, py] = worldToScreen(0, y, v, H)
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke()
      }
    }

    ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 0.5
    for (let x = Math.floor(worldBL.x / 10) * 10; x <= Math.ceil(worldTR.x / 10) * 10; x += 10) {
      const [px] = worldToScreen(x, 0, v, H)
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
    }
    for (let y = Math.floor(worldBL.y / 10) * 10; y <= Math.ceil(worldTR.y / 10) * 10; y += 10) {
      const [, py] = worldToScreen(0, y, v, H)
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke()
    }

    // Axes
    const [ox, oy] = worldToScreen(0, 0, v, H)
    ctx.strokeStyle = '#3f3f46'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke()
    ctx.fillStyle = '#52525b'
    ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#71717a'; ctx.font = '10px monospace'
    ctx.fillText('0', ox + 4, oy - 4)

    // ── Toolpaths ──────────────────────────────────────────────────────────
    if (showToolpathsRef.current && tps.length > 0) {
      for (const tp of tps) {
        const op = operations.find(o => o.id === tp.operationId)
        drawToolpathFn(ctx, tp, v, H, op?.type ?? 'profile', op)
      }
    }

    // ── Shapes ─────────────────────────────────────────────────────────────
    for (const shape of shapes) {
      const selected = selectedShapeIds.has(shape.id)
      drawShapeFn(ctx, shape, v, H, selected)
    }

    // ── In-progress draw previews ──────────────────────────────────────────
    const constrained = shiftHeld.current
    if (drawStart.current && activeTool === 'rect') {
      const s = drawStart.current
      let dx = mw.x - s.x, dy = mw.y - s.y
      if (constrained) {
        // Square: use the larger magnitude for both, preserve signs
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        dx = Math.sign(dx || 1) * m
        dy = Math.sign(dy || 1) * m
      }
      const x0 = Math.min(s.x, s.x + dx), y0 = Math.min(s.y, s.y + dy)
      const ww = Math.abs(dx), hh = Math.abs(dy)
      const [sx0, sy0] = worldToScreen(x0, y0 + hh, v, H)
      const [sx1, sy1] = worldToScreen(x0 + ww, y0, v, H)
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(96,165,250,0.07)'
      ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0)
      if (ww > 0.05 || hh > 0.05) {
        const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2
        const label = constrained
          ? `${ww.toFixed(2)} × ${hh.toFixed(2)} mm  ▢ square`
          : `${ww.toFixed(2)} × ${hh.toFixed(2)} mm`
        ctx.font = '11px monospace'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(cx - tw / 2 - 4, cy - 9, tw + 8, 16)
        ctx.fillStyle = '#93c5fd'; ctx.textAlign = 'center'
        ctx.fillText(label, cx, cy + 3)
        ctx.textAlign = 'left'
      }
    }

    if (drawStart.current && activeTool === 'circle') {
      const s = drawStart.current
      const r = Math.hypot(mw.x - s.x, mw.y - s.y)
      const [cx2, cy2] = worldToScreen(s.x, s.y, v, H)
      const rpx = r * v.zoom
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.arc(cx2, cy2, Math.max(0, rpx), 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(96,165,250,0.07)'
      ctx.beginPath(); ctx.arc(cx2, cy2, Math.max(0, rpx), 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#60a5fa60'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(cx2 - 8, cy2); ctx.lineTo(cx2 + 8, cy2)
      ctx.moveTo(cx2, cy2 - 8); ctx.lineTo(cx2, cy2 + 8); ctx.stroke()
      if (r > 0.05) {
        const [rx2, ry2] = worldToScreen(s.x + r * 0.707, s.y + r * 0.707, v, H)
        const label = `r=${r.toFixed(2)} ∅${(r * 2).toFixed(2)}mm`
        ctx.font = '11px monospace'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(rx2 + 4, ry2 - 9, tw + 8, 16)
        ctx.fillStyle = '#93c5fd'
        ctx.fillText(label, rx2 + 8, ry2 + 3)
      }
    }

    if (drawStart.current && activeTool === 'ellipse') {
      const s = drawStart.current
      let dx = mw.x - s.x, dy = mw.y - s.y
      if (constrained) {
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        dx = Math.sign(dx || 1) * m
        dy = Math.sign(dy || 1) * m
      }
      const cx = s.x + dx / 2, cy = s.y + dy / 2
      const rx = Math.abs(dx) / 2, ry = Math.abs(dy) / 2
      const [scx, scy] = worldToScreen(cx, cy, v, H)
      const sRx = rx * v.zoom, sRy = ry * v.zoom
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      if (sRx > 0 && sRy > 0) {
        ctx.beginPath()
        ctx.ellipse(scx, scy, sRx, sRy, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(96,165,250,0.07)'
        ctx.beginPath()
        ctx.ellipse(scx, scy, sRx, sRy, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.setLineDash([])
      if (rx > 0.05 || ry > 0.05) {
        const label = constrained
          ? `∅${(rx * 2).toFixed(2)} × ${(ry * 2).toFixed(2)} mm  ◯ circle`
          : `∅${(rx * 2).toFixed(2)} × ${(ry * 2).toFixed(2)} mm`
        ctx.font = '11px monospace'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(scx - tw / 2 - 4, scy - sRy - 18, tw + 8, 16)
        ctx.fillStyle = '#93c5fd'; ctx.textAlign = 'center'
        ctx.fillText(label, scx, scy - sRy - 6)
        ctx.textAlign = 'left'
      }
    }

    if (activeTool === 'polyline' && polyPts.current.length > 0) {
      const pts = [...polyPts.current, mw]
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.setLineDash([])
      ctx.beginPath()
      pts.forEach((p, i) => {
        const [sx, sy] = worldToScreen(p.x, p.y, v, H)
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
      })
      ctx.stroke()
      ctx.fillStyle = '#93c5fd'
      for (const p of polyPts.current) {
        const [sx, sy] = worldToScreen(p.x, p.y, v, H)
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill()
      }
    }

    // ── Marquee select rectangle ───────────────────────────────────────────
    if (marquee.current) {
      const [sx0, sy0] = worldToScreen(marquee.current.start.x, marquee.current.start.y, v, H)
      const [sx1, sy1] = worldToScreen(marquee.current.cur.x, marquee.current.cur.y, v, H)
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
      ctx.strokeRect(Math.min(sx0, sx1), Math.min(sy0, sy1), Math.abs(sx1 - sx0), Math.abs(sy1 - sy0))
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(59,130,246,0.08)'
      ctx.fillRect(Math.min(sx0, sx1), Math.min(sy0, sy1), Math.abs(sx1 - sx0), Math.abs(sy1 - sy0))
    }

    // ── Cursor indicator (object snap = yellow, grid snap = blue) ─────────
    if (activeTool !== 'select' || lastSnap.current) {
      const [sx, sy] = worldToScreen(mw.x, mw.y, v, H)
      if (lastSnap.current) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 8, sy)
        ctx.moveTo(sx, sy - 8); ctx.lineTo(sx, sy + 8)
        ctx.stroke()
        ctx.strokeRect(sx - 5, sy - 5, 10, 10)
      } else if (snapGridRef.current > 0 && activeTool !== 'select') {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy)
        ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7)
        ctx.stroke()
        ctx.strokeStyle = '#60a5fa'
        ctx.strokeRect(sx - 3, sy - 3, 6, 6)
      }
    }

    // Status bar
    ctx.fillStyle = 'rgba(9,9,11,0.88)'
    ctx.fillRect(0, H - 20, W, 20)
    ctx.fillStyle = '#71717a'; ctx.font = '10px monospace'; ctx.textAlign = 'left'
    const snapNote = lastSnap.current ? '  |  snap' : ''
    ctx.fillText(
      `X:${mw.x.toFixed(3)}  Y:${mw.y.toFixed(3)} mm  |  zoom: ${v.zoom.toFixed(1)}px/mm  |  shapes: ${shapes.length}` +
      (tps.length > 0 ? `  |  paths: ${tps.length}` : '') + snapNote,
      8, H - 6
    )
  }, [store])

  function drawShapeFn(ctx: CanvasRenderingContext2D, shape: CamShape, v: ViewState, H: number, selected: boolean) {
    const pts = shape.points
    if (pts.length < 2) return
    ctx.setLineDash([])
    ctx.beginPath()
    pts.forEach((p, i) => {
      const [sx, sy] = worldToScreen(p.x, p.y, v, H)
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)
    })
    if (shape.closed) ctx.closePath()
    ctx.strokeStyle = selected ? '#3b82f6' : '#a1a1aa'
    ctx.lineWidth = selected ? 2 : 1.5
    ctx.stroke()
    if (selected) {
      ctx.fillStyle = 'rgba(59,130,246,0.08)'
      ctx.fill()
      const bb = bbox(pts)
      const corners: [number, number][] = [
        [bb.minX, bb.minY], [bb.maxX, bb.minY],
        [bb.maxX, bb.maxY], [bb.minX, bb.maxY],
      ]
      for (const [cx, cy] of corners) {
        const [sx, sy] = worldToScreen(cx, cy, v, H)
        ctx.fillStyle = '#3b82f6'
        ctx.fillRect(sx - 3, sy - 3, 6, 6)
      }
      // Dimension label above shape
      const [bx0] = worldToScreen(bb.minX, bb.maxY, v, H)
      const [bx1, by1] = worldToScreen(bb.maxX, bb.maxY, v, H)
      const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY
      const label = shape.kind === 'circle'
        ? `∅${w.toFixed(2)} mm`
        : shape.kind === 'ellipse'
        ? `∅${w.toFixed(2)} × ${h.toFixed(2)} mm`
        : `${w.toFixed(2)} × ${h.toFixed(2)} mm`
      const cx2 = (bx0 + bx1) / 2
      ctx.font = '10px monospace'
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.fillRect(cx2 - tw / 2 - 4, by1 - 18, tw + 8, 15)
      ctx.fillStyle = '#93c5fd'; ctx.textAlign = 'center'
      ctx.fillText(label, cx2, by1 - 7)
      ctx.textAlign = 'left'
    }
  }

  function drawToolpathFn(ctx: CanvasRenderingContext2D, tp: Toolpath, v: ViewState, H: number, type: string, op: any) {
    const color = OP_COLORS[type] ?? '#a1a1aa'
    const toolDiam = op
      ? (store.getState().tools.find((t: any) => t.id === op.toolId)?.diameter ?? 3)
      : 3
    const toolR = toolDiam / 2
    const totalPasses = op ? Math.max(1, Math.ceil(op.targetDepth / op.stepDown)) : 1
    let curX = 0, curY = 0, passIdx = 0, prevZ = op?.safeZ ?? 5

    ctx.setLineDash([])
    for (const m of tp.moves) {
      const nx = m.x ?? curX, ny = m.y ?? curY

      const [x0, y0] = worldToScreen(curX, curY, v, H)
      const [x1, y1] = worldToScreen(nx, ny, v, H)

      if (m.type === 'plunge') {
        if (m.z < prevZ) passIdx = Math.min(passIdx + 1, totalPasses)
        prevZ = m.z
        ctx.globalAlpha = 0.9
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x1, y1, Math.max(3, toolR * v.zoom * 0.4), 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#09090b'; ctx.lineWidth = 1
        const s = 3
        ctx.beginPath()
        ctx.moveTo(x1 - s, y1 - s); ctx.lineTo(x1 + s, y1 + s)
        ctx.moveTo(x1 + s, y1 - s); ctx.lineTo(x1 - s, y1 + s)
        ctx.stroke()
        ctx.globalAlpha = 1

      } else if (m.type === 'cut') {
        const alpha = totalPasses <= 1 ? 1 : 0.4 + 0.6 * (passIdx / (totalPasses - 1))
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1.5, toolR * v.zoom * 0.3)
        ctx.lineCap = 'round'
        ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
        if (Math.hypot(x1 - x0, y1 - y0) > 35) {
          ctx.fillStyle = color
          drawArrow(ctx, x0, y0, x1, y1, 5)
        }
        ctx.globalAlpha = 1

      } else if (m.type === 'rapid' || m.type === 'retract') {
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 0.5
        ctx.setLineDash([3, 4])
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }

      ctx.lineCap = 'butt'
      curX = nx; curY = ny; prevZ = m.z
    }
  }

  const schedDraw = useCallback(() => {
    if (animFrame.current) cancelAnimationFrame(animFrame.current)
    animFrame.current = requestAnimationFrame(() => draw())
  }, [draw])

  // Fit all shapes into view
  const fitView = useCallback(() => {
    const canvas = canvasRef.current
    const { shapes } = store.getState()
    if (!canvas || shapes.length === 0) return
    const allPts = shapes.flatMap((s: CamShape) => s.points)
    const bb = bbox(allPts)
    const pad = 60
    const W = canvas.width, H = canvas.height
    const zx = (W - pad * 2) / Math.max(bb.maxX - bb.minX, 1)
    const zy = (H - pad * 2) / Math.max(bb.maxY - bb.minY, 1)
    view.current.zoom = Math.min(zx, zy, 80)
    view.current.panX = W / 2 - ((bb.minX + bb.maxX) / 2) * view.current.zoom
    view.current.panY = H / 2 - ((bb.minY + bb.maxY) / 2) * view.current.zoom
    schedDraw()
  }, [store, schedDraw])

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      if (view.current.panX === 0 && view.current.panY === 0) {
        view.current.panX = canvas.width / 2
        view.current.panY = canvas.height / 4
      }
      schedDraw()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [schedDraw])

  // Redraw when store state or props change
  useEffect(() => {
    const unsub = store.subscribe(() => schedDraw())
    return unsub
  }, [store, schedDraw])

  useEffect(() => { schedDraw() }, [schedDraw, toolpaths, activeTool, showToolpaths])

  // Window-level Shift tracking so the constraint indicator reacts even
  // when the canvas hasn't received focus yet.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') { shiftHeld.current = true; schedDraw() } }
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') { shiftHeld.current = false; schedDraw() } }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [schedDraw])

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const H = canvas.height
    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const resolved = resolveSnap(raw)
    const sw = resolved.point
    lastSnap.current = resolved.objectSnap

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.button !== 0) return

    if (activeToolRef.current === 'rect' || activeToolRef.current === 'circle' || activeToolRef.current === 'ellipse') {
      drawStart.current = sw
    } else if (activeToolRef.current === 'polyline') {
      polyPts.current = [...polyPts.current, sw]
      schedDraw()
    } else if (activeToolRef.current === 'select') {
      const hit = hitTest(e.nativeEvent.offsetX, e.nativeEvent.offsetY, H)
      const { selectedShapeIds, setSelectedShapes } = store.getState()
      if (hit) {
        if (e.shiftKey) {
          const next = new Set(selectedShapeIds)
          next.has(hit.id) ? next.delete(hit.id) : next.add(hit.id)
          setSelectedShapes(next)
        } else {
          if (!selectedShapeIds.has(hit.id)) setSelectedShapes(new Set([hit.id]))
        }
        dragOffset.current = sw
        dragHistoryPushed.current = false
      } else {
        // Begin marquee
        marquee.current = { start: raw, cur: raw }
        dragOffset.current = null
        if (!e.shiftKey) setSelectedShapes(new Set())
      }
    }
  }, [schedDraw, store])

  function hitTest(sx: number, sy: number, H: number): CamShape | null {
    const { shapes } = store.getState()
    const v = view.current
    for (let i = shapes.length - 1; i >= 0; i--) {
      const sh = shapes[i]
      const pts = sh.points
      if (pts.length < 2) continue
      const segs = sh.closed ? pts.length : pts.length - 1
      for (let j = 0; j < segs; j++) {
        const a = pts[j], b = pts[(j + 1) % pts.length]
        const [ax, ay] = worldToScreen(a.x, a.y, v, H)
        const [bx, by] = worldToScreen(b.x, b.y, v, H)
        if (distToSegment(sx, sy, ax, ay, bx, by) < 8) return sh
      }
    }
    return null
  }

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const H = canvas.height
    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const dragging = activeToolRef.current === 'select' && dragOffset.current && e.buttons === 1
    const exclude = dragging ? store.getState().selectedShapeIds : undefined
    const resolved = resolveSnap(raw, exclude)
    mouseWorld.current = resolved.point
    lastSnap.current = resolved.objectSnap

    if (panning.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      view.current.panX += dx
      view.current.panY -= dy
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }

    // Marquee update
    if (marquee.current && activeToolRef.current === 'select') {
      marquee.current = { start: marquee.current.start, cur: raw }
    }

    // Drag to move selected shapes
    if (activeToolRef.current === 'select' && dragOffset.current && e.buttons === 1) {
      const dx = mouseWorld.current.x - dragOffset.current.x
      const dy = mouseWorld.current.y - dragOffset.current.y
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        const { shapes, selectedShapeIds, updateShape, pushHistory } = store.getState()
        if (!dragHistoryPushed.current) {
          pushHistory()
          dragHistoryPushed.current = true
        }
        for (const id of selectedShapeIds) {
          const sh = shapes.find((s: CamShape) => s.id === id)
          if (!sh) continue
          updateShape(id, {
            points: sh.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
            params: sh.params ? patchParams(sh.params, dx, dy) : undefined,
          })
        }
        dragOffset.current = mouseWorld.current
      }
    }

    schedDraw()
  }, [schedDraw, store])

  function patchParams(params: any, dx: number, dy: number): any {
    if (params.type === 'rect') return { ...params, x: params.x + dx, y: params.y + dy }
    if (params.type === 'circle') return { ...params, cx: params.cx + dx, cy: params.cy + dy }
    if (params.type === 'ellipse') return { ...params, cx: params.cx + dx, cy: params.cy + dy }
    return params
  }

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const H = canvas.height
    panning.current = false
    dragOffset.current = null

    // Finish marquee
    if (marquee.current) {
      const m = marquee.current
      marquee.current = null
      const x0 = Math.min(m.start.x, m.cur.x), x1 = Math.max(m.start.x, m.cur.x)
      const y0 = Math.min(m.start.y, m.cur.y), y1 = Math.max(m.start.y, m.cur.y)
      const dxPx = (x1 - x0) * view.current.zoom
      const dyPx = (y1 - y0) * view.current.zoom
      if (dxPx > 3 || dyPx > 3) {
        const { shapes, selectedShapeIds, setSelectedShapes } = store.getState()
        const next = new Set(e.shiftKey ? selectedShapeIds : new Set<string>())
        for (const s of shapes) {
          const bb = bbox(s.points)
          if (bb.maxX >= x0 && bb.minX <= x1 && bb.maxY >= y0 && bb.minY <= y1) {
            next.add(s.id)
          }
        }
        setSelectedShapes(next)
      }
      schedDraw()
    }

    if (e.button !== 0 || !drawStart.current) return

    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const resolved = resolveSnap(raw)
    const end = resolved.point
    const start = drawStart.current
    drawStart.current = null

    const { addShape } = store.getState()
    const constrained = e.shiftKey

    if (activeToolRef.current === 'rect') {
      let dx = end.x - start.x, dy = end.y - start.y
      if (constrained) {
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        dx = Math.sign(dx || 1) * m
        dy = Math.sign(dy || 1) * m
      }
      const x = Math.min(start.x, start.x + dx), y = Math.min(start.y, start.y + dy)
      const ww = Math.abs(dx), hh = Math.abs(dy)
      if (ww > 0.1 && hh > 0.1) {
        addShape({
          label: `Rect ${ww.toFixed(1)}×${hh.toFixed(1)}`,
          kind: 'rect', closed: true,
          params: { type: 'rect', x, y, w: ww, h: hh },
          points: [{ x, y }, { x: x + ww, y }, { x: x + ww, y: y + hh }, { x, y: y + hh }],
        })
      }
    } else if (activeToolRef.current === 'circle') {
      const r = Math.hypot(end.x - start.x, end.y - start.y)
      if (r > 0.1) {
        addShape({
          label: `Circle ∅${(r * 2).toFixed(1)}`,
          kind: 'circle', closed: true,
          params: { type: 'circle', cx: start.x, cy: start.y, r },
          points: tessellateCircle(start.x, start.y, r, 64),
        })
      }
    } else if (activeToolRef.current === 'ellipse') {
      let dx = end.x - start.x, dy = end.y - start.y
      if (constrained) {
        const m = Math.max(Math.abs(dx), Math.abs(dy))
        dx = Math.sign(dx || 1) * m
        dy = Math.sign(dy || 1) * m
      }
      const cx = start.x + dx / 2, cy = start.y + dy / 2
      const rx = Math.abs(dx) / 2, ry = Math.abs(dy) / 2
      if (rx > 0.05 && ry > 0.05) {
        addShape({
          label: `Ellipse ∅${(rx * 2).toFixed(1)}×${(ry * 2).toFixed(1)}`,
          kind: 'ellipse', closed: true,
          params: { type: 'ellipse', cx, cy, rx, ry },
          points: tessellateEllipse(cx, cy, rx, ry, 64),
        })
      }
    }
    schedDraw()
  }, [schedDraw, store])

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeToolRef.current !== 'polyline' || polyPts.current.length < 2) return
    const canvas = canvasRef.current!
    const H = canvas.height
    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const last = resolveSnap(raw).point
    const first = polyPts.current[0]
    const closed = Math.hypot(last.x - first.x, last.y - first.y) < 2
    const { addShape } = store.getState()
    addShape({
      label: `Polyline (${polyPts.current.length} pts)`,
      kind: 'polyline', closed, points: [...polyPts.current],
    })
    polyPts.current = []
    schedDraw()
  }, [schedDraw, store])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (activeToolRef.current === 'polyline' && polyPts.current.length > 0) {
      polyPts.current.pop()
      schedDraw()
    } else if (activeToolRef.current !== 'select') {
      drawStart.current = null
      onToolChange('select')
      schedDraw()
    }
  }, [onToolChange, schedDraw])

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current!
    const H = canvas.height
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const mx = e.nativeEvent.offsetX, my = e.nativeEvent.offsetY
    view.current.panX = mx - (mx - view.current.panX) * factor
    view.current.panY = (H - my) - ((H - my) - view.current.panY) * factor
    view.current.zoom = Math.max(0.5, Math.min(200, view.current.zoom * factor))
    schedDraw()
  }, [schedDraw])

  function nudgeSelected(dx: number, dy: number) {
    const { shapes, selectedShapeIds, updateShape, pushHistory } = store.getState()
    if (selectedShapeIds.size === 0) return
    // Coalesce rapid nudges into one history entry per "burst"
    if (!nudgeTimer.current) pushHistory()
    if (nudgeTimer.current) window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = window.setTimeout(() => { nudgeTimer.current = null }, 600)
    for (const id of selectedShapeIds) {
      const sh = shapes.find(s => s.id === id)
      if (!sh) continue
      updateShape(id, {
        points: sh.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
        params: sh.params ? patchParams(sh.params, dx, dy) : undefined,
      })
    }
  }

  function duplicateSelected() {
    const { shapes, selectedShapeIds, setSelectedShapes, addShapes } = store.getState()
    const toCopy = shapes.filter(s => selectedShapeIds.has(s.id))
    if (toCopy.length === 0) return
    const dx = 5, dy = 5
    const newShapes = toCopy.map(s => ({
      label: `${s.label} copy`,
      kind: s.kind,
      closed: s.closed,
      points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
      params: s.params ? patchParams(s.params, dx, dy) : undefined,
    }))
    addShapes(newShapes)
    // Select the new ones — they're the last N shapes in the store
    const afterShapes = store.getState().shapes
    const newIds = new Set(afterShapes.slice(-newShapes.length).map(s => s.id))
    setSelectedShapes(newIds)
  }

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      if (e.shiftKey) store.getState().redo()
      else store.getState().undo()
      schedDraw()
      return
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault()
      store.getState().redo()
      schedDraw()
      return
    }
    if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      const { shapes, setSelectedShapes } = store.getState()
      setSelectedShapes(new Set(shapes.map(s => s.id)))
      return
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      duplicateSelected()
      return
    }
    if (e.key === 'Escape') {
      polyPts.current = []; drawStart.current = null; marquee.current = null
      onToolChange('select'); schedDraw()
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeToolRef.current === 'select') {
      const { deleteShape, selectedShapeIds } = store.getState()
      selectedShapeIds.forEach((id: string) => deleteShape(id))
      schedDraw()
    }
    if (e.key === 'f' || e.key === 'F') fitView()
    if (e.key === '+' || e.key === '=') { view.current.zoom *= 1.2; schedDraw() }
    if (e.key === '-') { view.current.zoom /= 1.2; schedDraw() }

    // Arrow-key nudge for selected shapes
    if (activeToolRef.current === 'select' && store.getState().selectedShapeIds.size > 0) {
      const baseStep = snapGridRef.current > 0 ? snapGridRef.current : 1
      const step = e.shiftKey ? baseStep * 10 : baseStep
      if (e.key === 'ArrowLeft')  { e.preventDefault(); nudgeSelected(-step, 0) }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(+step, 0) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); nudgeSelected(0, +step) }
      if (e.key === 'ArrowDown')  { e.preventDefault(); nudgeSelected(0, -step) }
    }
  }, [onToolChange, schedDraw, fitView, store])

  const polyHint = polyPts.current.length > 0
    ? `Polyline — ${polyPts.current.length} pts · dbl-click to finish · right-click to undo`
    : null
  const toolLabel = polyHint
    ?? (activeTool === 'select' ? 'Select · drag empty to marquee · arrows nudge · Ctrl+D dupe'
    : activeTool === 'rect' ? 'Rectangle · drag to draw · hold Shift for square'
    : activeTool === 'circle' ? 'Circle · drag center→edge · right-click to cancel'
    : activeTool === 'ellipse' ? 'Ellipse · drag bbox · hold Shift for circle'
    : activeTool)

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: panning.current ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair' }}
        tabIndex={0}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />

      {/* Overlay toolbar */}
      <div className="absolute top-2 right-2 flex flex-col gap-1.5 pointer-events-auto">
        <button onClick={fitView} title="Fit to view (F)"
          className="px-2 py-1 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono border border-zinc-700">
          ⊡ Fit
        </button>
        <button onClick={() => { setShowToolpaths(v => !v) }} title="Toggle toolpaths"
          className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${showToolpaths ? 'bg-green-900/60 border-green-700 text-green-300' : 'bg-zinc-800/90 border-zinc-700 text-zinc-500'}`}>
          {showToolpaths ? '◉ Paths' : '○ Paths'}
        </button>
        <button onClick={() => { view.current.zoom *= 1.25; schedDraw() }} title="Zoom in (+)"
          className="px-2 py-1 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono border border-zinc-700 w-full text-center">+</button>
        <button onClick={() => { view.current.zoom /= 1.25; schedDraw() }} title="Zoom out (-)"
          className="px-2 py-1 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono border border-zinc-700 w-full text-center">−</button>
      </div>

      {/* Tool hint */}
      <div className="absolute top-2 left-2 px-2 py-0.5 bg-zinc-900/80 border border-zinc-700 rounded text-xs text-zinc-400 font-mono select-none pointer-events-none">
        {toolLabel}
      </div>

      {/* Toolpath legend */}
      {showToolpaths && toolpaths.length > 0 && (
        <div className="absolute bottom-6 right-2 bg-zinc-900/85 border border-zinc-700 rounded px-2 py-1.5 pointer-events-none">
          {Object.entries(OP_COLORS).map(([type, color]) => {
            const { operations } = store.getState()
            const count = operations.filter((o: any) => o.type === type).length
            if (!count) return null
            return (
              <div key={type} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-zinc-400 capitalize">{type}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5 text-xs mt-0.5 border-t border-zinc-700 pt-0.5">
            <div className="w-3 border-t border-dashed border-zinc-500" />
            <span className="text-zinc-500">Rapid</span>
          </div>
        </div>
      )}
    </div>
  )
}
