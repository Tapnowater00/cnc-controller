import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useCamStore } from '../../stores/camStore'
import { CamShape, Vec2 } from '../../lib/cam/types'
import { tessellateCircle, bbox, centroid } from '../../lib/cam/geometry'
import { Toolpath } from '../../lib/cam/toolpath'

export type DrawTool = 'select' | 'rect' | 'circle' | 'polyline' | 'move'

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
function snap(val: number, g: number): number {
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

const OP_COLORS: Record<string, string> = {
  profile: '#22c55e',
  pocket: '#f59e0b',
  engrave: '#a78bfa',
  drill: '#38bdf8',
}

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
    if (drawStart.current && activeTool === 'rect') {
      const s = drawStart.current
      const x0 = Math.min(s.x, mw.x), y0 = Math.min(s.y, mw.y)
      const ww = Math.abs(mw.x - s.x), hh = Math.abs(mw.y - s.y)
      const [sx0, sy0] = worldToScreen(x0, y0 + hh, v, H)
      const [sx1, sy1] = worldToScreen(x0 + ww, y0, v, H)
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(96,165,250,0.07)'
      ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0)
      if (ww > 0.05 || hh > 0.05) {
        const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2
        const label = `${ww.toFixed(2)} × ${hh.toFixed(2)} mm`
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

    // Snap cursor indicator
    if (activeTool !== 'select' && snapGridRef.current > 0) {
      const [sx, sy] = worldToScreen(mw.x, mw.y, v, H)
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy)
      ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7)
      ctx.stroke()
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1
      ctx.strokeRect(sx - 3, sy - 3, 6, 6)
    }

    // Status bar
    ctx.fillStyle = 'rgba(9,9,11,0.88)'
    ctx.fillRect(0, H - 20, W, 20)
    ctx.fillStyle = '#71717a'; ctx.font = '10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(
      `X:${mw.x.toFixed(3)}  Y:${mw.y.toFixed(3)} mm  |  zoom: ${v.zoom.toFixed(1)}px/mm  |  shapes: ${shapes.length}` +
      (tps.length > 0 ? `  |  paths: ${tps.length}` : ''),
      8, H - 6
    )
  }, [store])   // store reference never changes

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
        // Entry circle
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
        // Direction arrow on longer segments
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

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const H = canvas.height
    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const sw = { x: snap(raw.x, snapGridRef.current), y: snap(raw.y, snapGridRef.current) }

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.button !== 0) return

    if (activeToolRef.current === 'rect' || activeToolRef.current === 'circle') {
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
      } else if (!e.shiftKey) {
        setSelectedShapes(new Set())
        dragOffset.current = null
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
    mouseWorld.current = { x: snap(raw.x, snapGridRef.current), y: snap(raw.y, snapGridRef.current) }

    if (panning.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      view.current.panX += dx
      view.current.panY -= dy
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }

    // Drag to move selected shapes
    if (activeToolRef.current === 'select' && dragOffset.current && e.buttons === 1) {
      const dx = mouseWorld.current.x - dragOffset.current.x
      const dy = mouseWorld.current.y - dragOffset.current.y
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        const { shapes, selectedShapeIds, updateShape } = store.getState()
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
    return params
  }

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const H = canvas.height
    panning.current = false
    dragOffset.current = null

    if (e.button !== 0 || !drawStart.current) return

    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const end = { x: snap(raw.x, snapGridRef.current), y: snap(raw.y, snapGridRef.current) }
    const start = drawStart.current
    drawStart.current = null

    const { addShape } = store.getState()

    if (activeToolRef.current === 'rect') {
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y)
      const ww = Math.abs(end.x - start.x), hh = Math.abs(end.y - start.y)
      if (ww > 0.1 && hh > 0.1) {
        addShape({
          label: `Rect ${ww.toFixed(1)}×${hh.toFixed(1)}`,
          kind: 'rect', closed: true,
          params: { type: 'rect', x, y, w: ww, h: hh },
          points: [{ x, y }, { x: x + ww, y }, { x: x + ww, y: y + hh }, { x, y: y + hh }],
        })
      }
      // Keep rect tool active — don't auto-switch
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
    }
    schedDraw()
  }, [schedDraw, store])

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeToolRef.current !== 'polyline' || polyPts.current.length < 2) return
    const canvas = canvasRef.current!
    const H = canvas.height
    const raw = screenToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY, view.current, H)
    const last = { x: snap(raw.x, snapGridRef.current), y: snap(raw.y, snapGridRef.current) }
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

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      polyPts.current = []; drawStart.current = null
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
  }, [onToolChange, schedDraw, fitView, store])

  const toolLabel = activeTool === 'polyline' && polyPts.current.length > 0
    ? `Polyline — ${polyPts.current.length} pts · dbl-click to finish · right-click to undo`
    : activeTool === 'select' ? 'Select · drag to move · Del to delete'
    : activeTool === 'rect' ? 'Rectangle · drag to draw · right-click to cancel'
    : activeTool === 'circle' ? 'Circle · drag center→edge · right-click to cancel'
    : activeTool

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
