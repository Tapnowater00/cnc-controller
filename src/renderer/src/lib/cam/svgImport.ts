import { Vec2, CamShape } from './types'
import { tessellateCircle } from './geometry'

function uid() { return Math.random().toString(36).slice(2, 9) }

// SVG path tokenizer — splits on commands and whitespace/commas
function tokenize(d: string): string[] {
  return d
    .replace(/([MmLlHhVvCcSsQqTtAaZz])/g, ' $1 ')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
}

export function parseSVGPath(d: string): Vec2[] {
  const tokens = tokenize(d)
  const pts: Vec2[] = []
  let i = 0
  let cx = 0, cy = 0, startX = 0, startY = 0
  let prevCp: Vec2 | null = null

  function num() { return parseFloat(tokens[i++] ?? '0') }

  function cubicBezier(x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) {
    const segs = Math.max(8, Math.ceil(Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2) * 0.5))
    for (let t = 1 / segs; t <= 1 + 1e-6; t += 1 / segs) {
      const u = 1 - t
      pts.push({
        x: u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
        y: u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
      })
    }
    prevCp = { x: x2, y: y2 }
    cx = ex; cy = ey
  }

  function quadBezier(x1: number, y1: number, ex: number, ey: number) {
    const segs = Math.max(6, Math.ceil(Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2) * 0.3))
    for (let t = 1 / segs; t <= 1 + 1e-6; t += 1 / segs) {
      const u = 1 - t
      pts.push({
        x: u * u * cx + 2 * u * t * x1 + t * t * ex,
        y: u * u * cy + 2 * u * t * y1 + t * t * ey,
      })
    }
    prevCp = { x: x1, y: y1 }
    cx = ex; cy = ey
  }

  while (i < tokens.length) {
    const cmd = tokens[i++]
    prevCp = null

    switch (cmd) {
      case 'M': cx = num(); cy = num(); startX = cx; startY = cy; pts.push({ x: cx, y: cy }); break
      case 'm': cx += num(); cy += num(); startX = cx; startY = cy; pts.push({ x: cx, y: cy }); break
      case 'L': cx = num(); cy = num(); pts.push({ x: cx, y: cy }); break
      case 'l': { const dx = num(), dy = num(); cx += dx; cy += dy; pts.push({ x: cx, y: cy }); break }
      case 'H': cx = num(); pts.push({ x: cx, y: cy }); break
      case 'h': cx += num(); pts.push({ x: cx, y: cy }); break
      case 'V': cy = num(); pts.push({ x: cx, y: cy }); break
      case 'v': cy += num(); pts.push({ x: cx, y: cy }); break
      case 'Z': case 'z': pts.push({ x: startX, y: startY }); break
      case 'C': { const x1=num(),y1=num(),x2=num(),y2=num(),ex=num(),ey=num(); cubicBezier(x1,y1,x2,y2,ex,ey); break }
      case 'c': { const x1=cx+num(),y1=cy+num(),x2=cx+num(),y2=cy+num(),ex=cx+num(),ey=cy+num(); cubicBezier(x1,y1,x2,y2,ex,ey); break }
      case 'S': {
        const refl = prevCp ? { x: 2*cx - prevCp.x, y: 2*cy - prevCp.y } : { x: cx, y: cy }
        const x2=num(),y2=num(),ex=num(),ey=num(); cubicBezier(refl.x,refl.y,x2,y2,ex,ey); break
      }
      case 's': {
        const refl = prevCp ? { x: 2*cx - prevCp.x, y: 2*cy - prevCp.y } : { x: cx, y: cy }
        const x2=cx+num(),y2=cy+num(),ex=cx+num(),ey=cy+num(); cubicBezier(refl.x,refl.y,x2,y2,ex,ey); break
      }
      case 'Q': { const x1=num(),y1=num(),ex=num(),ey=num(); quadBezier(x1,y1,ex,ey); break }
      case 'q': { const x1=cx+num(),y1=cy+num(),ex=cx+num(),ey=cy+num(); quadBezier(x1,y1,ex,ey); break }
      case 'A': case 'a': {
        // Elliptic arc — approximate with endpoint only for simplicity
        num(); num(); num(); num(); num()
        if (cmd === 'A') { cx = num(); cy = num() } else { cx += num(); cy += num() }
        pts.push({ x: cx, y: cy }); break
      }
      default: break
    }
  }
  return pts
}

function parseTransform(t: string | null): DOMMatrix | null {
  if (!t) return null
  // Only handle translate and scale for now
  const m = new DOMMatrix()
  const trans = t.match(/translate\(([^)]+)\)/)
  if (trans) {
    const parts = trans[1].split(/[\s,]+/).map(Number)
    m.translateSelf(parts[0] ?? 0, parts[1] ?? 0)
  }
  const sc = t.match(/scale\(([^)]+)\)/)
  if (sc) {
    const parts = sc[1].split(/[\s,]+/).map(Number)
    m.scaleSelf(parts[0] ?? 1, parts[1] ?? parts[0] ?? 1)
  }
  return m
}

function applyMatrix(pts: Vec2[], m: DOMMatrix | null): Vec2[] {
  if (!m) return pts
  return pts.map(p => {
    const pt = new DOMPoint(p.x, p.y).matrixTransform(m)
    return { x: pt.x, y: pt.y }
  })
}

export function importSVG(svgContent: string): CamShape[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgContent, 'image/svg+xml')
  const shapes: CamShape[] = []

  function process(el: Element, inheritMatrix: DOMMatrix | null) {
    const localTransform = parseTransform(el.getAttribute('transform'))
    const matrix = inheritMatrix
      ? (localTransform ? inheritMatrix.multiply(localTransform) : inheritMatrix)
      : localTransform

    const id = el.getAttribute('id') || el.getAttribute('inkscape:label') || ''

    if (el.tagName === 'path') {
      const d = el.getAttribute('d')
      if (d) {
        const raw = parseSVGPath(d)
        const pts = applyMatrix(raw, matrix)
        if (pts.length >= 2) {
          const closed = /[Zz]\s*$/.test(d.trim())
          shapes.push({ id: uid(), label: id || 'Path', kind: 'imported', points: pts, closed })
        }
      }
    } else if (el.tagName === 'rect') {
      const x = parseFloat(el.getAttribute('x') ?? '0')
      const y = parseFloat(el.getAttribute('y') ?? '0')
      const w = parseFloat(el.getAttribute('width') ?? '0')
      const h = parseFloat(el.getAttribute('height') ?? '0')
      if (w > 0 && h > 0) {
        const raw: Vec2[] = [{ x, y }, { x: x+w, y }, { x: x+w, y: y+h }, { x, y: y+h }]
        shapes.push({ id: uid(), label: id || 'Rect', kind: 'rect', points: applyMatrix(raw, matrix), closed: true })
      }
    } else if (el.tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') ?? '0')
      const cy = parseFloat(el.getAttribute('cy') ?? '0')
      const r = parseFloat(el.getAttribute('r') ?? '0')
      if (r > 0) {
        const raw = tessellateCircle(cx, cy, r, 64)
        shapes.push({ id: uid(), label: id || 'Circle', kind: 'circle', points: applyMatrix(raw, matrix), closed: true })
      }
    } else if (el.tagName === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx') ?? '0')
      const cy = parseFloat(el.getAttribute('cy') ?? '0')
      const rx = parseFloat(el.getAttribute('rx') ?? '0')
      const ry = parseFloat(el.getAttribute('ry') ?? rx.toString())
      if (rx > 0) {
        const raw: Vec2[] = []
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * Math.PI * 2
          raw.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
        }
        shapes.push({ id: uid(), label: id || 'Ellipse', kind: 'imported', points: applyMatrix(raw, matrix), closed: true })
      }
    } else if (el.tagName === 'polyline' || el.tagName === 'polygon') {
      const pointsStr = el.getAttribute('points') ?? ''
      const nums = pointsStr.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
      const raw: Vec2[] = []
      for (let j = 0; j + 1 < nums.length; j += 2) raw.push({ x: nums[j], y: nums[j+1] })
      if (raw.length >= 2) {
        const closed = el.tagName === 'polygon'
        shapes.push({ id: uid(), label: id || 'Shape', kind: 'imported', points: applyMatrix(raw, matrix), closed })
      }
    } else if (el.tagName === 'g' || el.tagName === 'svg') {
      for (const child of el.children) process(child, matrix)
    }
  }

  const svg = doc.querySelector('svg')
  if (svg) process(svg, null)

  return shapes
}
