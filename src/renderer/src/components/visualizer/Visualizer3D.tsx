import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import { Play, Pause, SkipBack, Gauge, Box, Palette } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { parseGcode } from './gcodeParser'
import type { Segment } from '../../types'

const RAPID_RATE_DEFAULT = 3000   // mm/min, used for playback timing of G0
const STOCK_GRID_MAX = 160        // max heightmap cells per axis (perf cap)

// ── Timing utilities ──────────────────────────────────────────────────────

interface Timing { cumulative: Float64Array; total: number }

function computeTiming(segments: Segment[], rapidRate: number): Timing {
  const cumulative = new Float64Array(segments.length + 1)
  let total = 0
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const len = Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y, s.end.z - s.start.z)
    const rate = s.type === 'rapid' ? rapidRate : (s.feed ?? 1000)
    total += (len / Math.max(1, rate)) * 60
    cumulative[i + 1] = total
  }
  return { cumulative, total }
}

function findAtTime(cum: Float64Array, time: number): { segIdx: number; progress: number } {
  if (cum.length < 2) return { segIdx: 0, progress: 0 }
  let lo = 0, hi = cum.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid] <= time) lo = mid
    else hi = mid - 1
  }
  const segStart = cum[lo]
  const segDur = cum[lo + 1] - segStart
  const progress = segDur > 0 ? Math.min(1, Math.max(0, (time - segStart) / segDur)) : 0
  return { segIdx: lo, progress }
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0s'
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.floor(s % 60)}s`
}

// ── Toolpath with optional feed-rate coloring ─────────────────────────────

interface ToolpathProps {
  segments: Segment[]
  showRapids: boolean
  colorByFeed: boolean
}

function Toolpath({ segments, showRapids, colorByFeed }: ToolpathProps) {
  const rapidPositions = useMemo(() => {
    const pts: number[] = []
    for (const s of segments) {
      if (s.type !== 'rapid') continue
      pts.push(s.start.x, s.start.z, -s.start.y, s.end.x, s.end.z, -s.end.y)
    }
    return new Float32Array(pts)
  }, [segments])

  const { cutPositions, cutColors } = useMemo(() => {
    const pts: number[] = []
    const cols: number[] = []
    let minF = Infinity, maxF = -Infinity
    for (const s of segments) {
      if (s.type === 'cut' && s.feed !== undefined) {
        if (s.feed < minF) minF = s.feed
        if (s.feed > maxF) maxF = s.feed
      }
    }
    const range = Math.max(1, maxF - minF)
    const color = new THREE.Color()
    for (const s of segments) {
      if (s.type !== 'cut') continue
      pts.push(s.start.x, s.start.z, -s.start.y, s.end.x, s.end.z, -s.end.y)
      if (colorByFeed && isFinite(minF)) {
        const t = ((s.feed ?? 1000) - minF) / range
        // Cool blue (slow) → hot red (fast) via HSL hue
        color.setHSL((1 - t) * 240 / 360, 0.85, 0.5)
      } else {
        color.set('#22c55e')
      }
      cols.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    return { cutPositions: new Float32Array(pts), cutColors: new Float32Array(cols) }
  }, [segments, colorByFeed])

  return (
    <group>
      {showRapids && rapidPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[rapidPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#555555" />
        </lineSegments>
      )}
      {cutPositions.length > 0 && (
        <lineSegments key={colorByFeed ? 'c' : 'm'}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[cutPositions, 3]} />
            <bufferAttribute attach="attributes-color" args={[cutColors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial vertexColors={colorByFeed} color={colorByFeed ? '#ffffff' : '#22c55e'} />
        </lineSegments>
      )}
    </group>
  )
}

// ── Tool marker — playback or live ────────────────────────────────────────

interface MarkerProps {
  segments: Segment[]
  timing: Timing
  playbackTimeRef: React.MutableRefObject<number>
  mode: 'live' | 'playback'
  toolDiameter: number
}

function ToolMarker({ segments, timing, playbackTimeRef, mode, toolDiameter }: MarkerProps) {
  const wpos = useMachineStore(s => s.wpos)
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!meshRef.current) return
    if (mode === 'live') {
      meshRef.current.position.set(wpos.x, wpos.z, -wpos.y)
      return
    }
    if (segments.length === 0) return
    const { segIdx, progress } = findAtTime(timing.cumulative, playbackTimeRef.current)
    const s = segments[segIdx]
    if (!s) return
    const x = s.start.x + (s.end.x - s.start.x) * progress
    const y = s.start.y + (s.end.y - s.start.y) * progress
    const z = s.start.z + (s.end.z - s.start.z) * progress
    meshRef.current.position.set(x, z, -y)
  })
  if (mode === 'playback') {
    const r = Math.max(0.5, toolDiameter / 2)
    return (
      <mesh ref={meshRef}>
        <cylinderGeometry args={[r, r, 8, 16]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.7} />
      </mesh>
    )
  }
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#fbbf24" />
    </mesh>
  )
}

function MachineBox({ profile }: { profile: { workArea: { x: number; y: number; z: number } } }) {
  const { x, y, z } = profile.workArea
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(x, z, y)), [x, y, z])
  return (
    <lineSegments geometry={edges} position={[x / 2, z / 2, -y / 2]}>
      <lineBasicMaterial color="#334155" />
    </lineSegments>
  )
}

// ── Stock heightmap simulation ────────────────────────────────────────────

interface Stock {
  width: number   // X mm
  depth: number   // Y mm
  thickness: number // Z mm (positive — top at 0, bottom at -thickness)
  originX: number
  originY: number
}

interface StockProps {
  stock: Stock
  segments: Segment[]
  timing: Timing
  playbackTimeRef: React.MutableRefObject<number>
  toolDiameter: number
  enabled: boolean
}

// Heightmap stored row-major, top of stock = 0, cuts produce negative values.
function StockMesh({ stock, segments, timing, playbackTimeRef, toolDiameter, enabled }: StockProps) {
  const { width, depth, thickness, originX, originY } = stock
  // Pick a grid step that keeps the mesh under STOCK_GRID_MAX per axis.
  const step = Math.max(
    0.5,
    Math.max(width, depth) / STOCK_GRID_MAX
  )
  const cols = Math.max(2, Math.floor(width / step) + 1)
  const rows = Math.max(2, Math.floor(depth / step) + 1)
  const cellCount = cols * rows

  const heightmap = useMemo(() => new Float32Array(cellCount), [cellCount])
  const meshRef = useRef<THREE.Mesh>(null)
  const lastAppliedSeg = useRef(-1)
  const lastAppliedProgress = useRef(0)

  // Rebuild geometry whenever stock dims change.
  const geometry = useMemo(() => {
    const positions = new Float32Array(cellCount * 3)
    const indices: number[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3
        positions[i + 0] = originX + c * step
        positions[i + 1] = 0           // Three Y (= world Z, height)
        positions[i + 2] = -(originY + r * step)  // Three -Z (= world Y)
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i = r * cols + c
        indices.push(i, i + cols, i + 1)
        indices.push(i + 1, i + cols, i + cols + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [cols, rows, step, originX, originY])

  function resetHeightmap() {
    heightmap.fill(0)
    lastAppliedSeg.current = -1
    lastAppliedProgress.current = 0
    pushToGeometry()
  }

  function pushToGeometry() {
    const positions = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < cellCount; i++) {
      positions.setY(i, heightmap[i])
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
  }

  // Carve a tool footprint (circle of `radius`) at world (wx, wy) down to wz.
  // Mutates heightmap in place. Cuts can only deepen (Z monotonically decreasing).
  function carveAt(wx: number, wy: number, wz: number, radius: number) {
    if (wz >= 0) return  // not cutting into stock
    const lx = wx - originX, ly = wy - originY
    const cMin = Math.max(0, Math.floor((lx - radius) / step))
    const cMax = Math.min(cols - 1, Math.ceil((lx + radius) / step))
    const rMin = Math.max(0, Math.floor((ly - radius) / step))
    const rMax = Math.min(rows - 1, Math.ceil((ly + radius) / step))
    const r2 = radius * radius
    const floor = -thickness
    const target = Math.max(floor, wz)
    for (let r = rMin; r <= rMax; r++) {
      const dy = (r * step) - ly
      for (let c = cMin; c <= cMax; c++) {
        const dx = (c * step) - lx
        if (dx * dx + dy * dy > r2) continue
        const i = r * cols + c
        if (target < heightmap[i]) heightmap[i] = target
      }
    }
  }

  function carveSegment(s: Segment, radius: number, frac = 1) {
    if (s.type !== 'cut') return
    const dx = s.end.x - s.start.x
    const dy = s.end.y - s.start.y
    const dz = s.end.z - s.start.z
    const len = Math.hypot(dx, dy, dz)
    const samples = Math.max(1, Math.ceil(len * frac / Math.max(0.5, radius * 0.5)))
    for (let i = 1; i <= samples; i++) {
      const t = (i / samples) * frac
      carveAt(s.start.x + dx * t, s.start.y + dy * t, s.start.z + dz * t, radius)
    }
  }

  // Apply carving for the current playback time. Incremental forward, reset on
  // backward scrub.
  function applyToTime() {
    if (!enabled || segments.length === 0) return
    const { segIdx, progress } = findAtTime(timing.cumulative, playbackTimeRef.current)
    const radius = Math.max(0.25, toolDiameter / 2)

    if (segIdx < lastAppliedSeg.current ||
        (segIdx === lastAppliedSeg.current && progress < lastAppliedProgress.current)) {
      // Backward scrub — full reset and replay up to current
      heightmap.fill(0)
      lastAppliedSeg.current = -1
      lastAppliedProgress.current = 0
    }

    // Complete the segment we were in the middle of last time
    if (lastAppliedSeg.current >= 0 && lastAppliedSeg.current === segIdx) {
      carveSegment(segments[segIdx], radius, progress)
      lastAppliedProgress.current = progress
    } else {
      if (lastAppliedSeg.current >= 0) {
        // Finish the partial segment from last frame
        carveSegment(segments[lastAppliedSeg.current], radius, 1)
      }
      for (let i = lastAppliedSeg.current + 1; i < segIdx; i++) {
        carveSegment(segments[i], radius, 1)
      }
      if (segIdx > lastAppliedSeg.current) {
        carveSegment(segments[segIdx], radius, progress)
        lastAppliedSeg.current = segIdx
        lastAppliedProgress.current = progress
      }
    }
    pushToGeometry()
  }

  // Reset when stock dims or segments change
  useEffect(() => { resetHeightmap() }, [cellCount, segments, enabled])

  // Drive the carve on every frame from playback
  useFrame(() => {
    if (!enabled) return
    applyToTime()
  })

  if (!enabled) return null

  return (
    <group>
      {/* Carved top surface */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial color="#8b6f47" side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      {/* Side walls (simple box outline) */}
      <lineSegments
        geometry={useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width, thickness, depth)), [width, depth, thickness])}
        position={[originX + width / 2, -thickness / 2, -(originY + depth / 2)]}
      >
        <lineBasicMaterial color="#a78bfa" />
      </lineSegments>
    </group>
  )
}

// ── Main visualizer ───────────────────────────────────────────────────────

interface Props { gcodeLines: string[] }

export function Visualizer3D({ gcodeLines }: Props) {
  const { machineProfile } = useSettingsStore()
  const overrides = useMachineStore(s => s.overrides)
  const [showRapids, setShowRapids] = useState(true)
  const [showGrid, setShowGrid] = useState(true)

  // ── Display options ───────────────────────────────────────────────────
  const [colorByFeed, setColorByFeed] = useState(false)
  const [stockEnabled, setStockEnabled] = useState(false)
  const [toolDiameter, setToolDiameter] = useState(3)
  const [stock, setStock] = useState<Stock>({
    width: 200, depth: 200, thickness: 10, originX: 0, originY: 0,
  })

  // ── Playback state ────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)   // UI mirror, throttled
  const [speed, setSpeed] = useState(8)                 // x faster than real-time
  const playbackTimeRef = useRef(0)

  const segments = useMemo(() => gcodeLines.length === 0 ? [] : parseGcode(gcodeLines), [gcodeLines])
  const timing = useMemo(() => computeTiming(segments, RAPID_RATE_DEFAULT), [segments])
  const inPlayback = playing || playbackTime > 0

  // Throttle UI updates from the playback ref
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      setPlaybackTime(playbackTimeRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Advance playback via interval (uses override % to mimic real cuts)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const feedMult = overrides.feed / 100
      playbackTimeRef.current += dt * speed * Math.max(0.1, feedMult)
      if (playbackTimeRef.current >= timing.total) {
        playbackTimeRef.current = timing.total
        setPlaying(false)
        setPlaybackTime(timing.total)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, timing.total, overrides.feed])

  // Reset playback when G-code changes
  useEffect(() => {
    setPlaying(false)
    playbackTimeRef.current = 0
    setPlaybackTime(0)
  }, [segments])

  function togglePlay() {
    if (segments.length === 0) return
    if (!playing && playbackTimeRef.current >= timing.total) {
      playbackTimeRef.current = 0
      setPlaybackTime(0)
    }
    setPlaying(p => !p)
  }

  function rewind() {
    playbackTimeRef.current = 0
    setPlaybackTime(0)
    setPlaying(false)
  }

  function scrub(t: number) {
    playbackTimeRef.current = t
    setPlaybackTime(t)
  }

  const { segIdx } = findAtTime(timing.cumulative, playbackTime)
  const currentFeed = segments[segIdx]?.feed
  const currentType = segments[segIdx]?.type

  return (
    <div className="relative w-full h-full bg-zinc-950 flex flex-col">
      {/* Top-right options */}
      <div className="absolute top-2 right-2 z-10 flex flex-wrap gap-1 max-w-[60%] justify-end">
        <button onClick={() => setShowRapids(v => !v)}
          className={`px-2 py-0.5 rounded text-xs ${showRapids ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-800 text-zinc-500'}`}>
          Rapids
        </button>
        <button onClick={() => setShowGrid(v => !v)}
          className={`px-2 py-0.5 rounded text-xs ${showGrid ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-800 text-zinc-500'}`}>
          Grid
        </button>
        <button onClick={() => setColorByFeed(v => !v)} title="Color cuts by feed rate"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${colorByFeed ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
          <Palette size={11} /> Feed
        </button>
        <button onClick={() => setStockEnabled(v => !v)} title="Simulate stock material removal"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${stockEnabled ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
          <Box size={11} /> Stock
        </button>
      </div>

      {/* Stock config strip — only when stock sim is on */}
      {stockEnabled && (
        <div className="absolute top-9 right-2 z-10 bg-zinc-900/90 border border-zinc-700 rounded px-2 py-1.5 flex items-center gap-2 text-xs font-mono">
          {([
            ['W', 'width'], ['D', 'depth'], ['T', 'thickness'],
            ['X0', 'originX'], ['Y0', 'originY'],
          ] as const).map(([label, key]) => (
            <label key={key} className="flex items-center gap-1">
              <span className="text-zinc-500">{label}</span>
              <input type="number" value={stock[key]} step={1}
                onChange={e => setStock(s => ({ ...s, [key]: Number(e.target.value) }))}
                className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200" />
            </label>
          ))}
          <label className="flex items-center gap-1">
            <span className="text-zinc-500">Ø</span>
            <input type="number" value={toolDiameter} step={0.1} min={0.1}
              onChange={e => setToolDiameter(Number(e.target.value))}
              className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200" />
          </label>
        </div>
      )}

      {segments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs pointer-events-none">
          Load a G-code file to preview toolpath
        </div>
      )}

      <div className="flex-1 relative">
        <Canvas
          camera={{ position: [100, 150, 100], fov: 45, near: 0.1, far: 10000 }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: '#09090b' }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[100, 200, 100]} intensity={0.6} />

          {showGrid && (
            <Grid args={[500, 500]} cellSize={10} cellColor="#1e293b"
              sectionSize={100} sectionColor="#334155" fadeDistance={800}
              position={[0, -0.1, 0]} />
          )}

          {machineProfile && <MachineBox profile={machineProfile} />}

          <StockMesh
            stock={stock}
            segments={segments}
            timing={timing}
            playbackTimeRef={playbackTimeRef}
            toolDiameter={toolDiameter}
            enabled={stockEnabled}
          />

          <Toolpath segments={segments} showRapids={showRapids} colorByFeed={colorByFeed} />
          <ToolMarker
            segments={segments}
            timing={timing}
            playbackTimeRef={playbackTimeRef}
            mode={inPlayback ? 'playback' : 'live'}
            toolDiameter={toolDiameter}
          />

          <OrbitControls makeDefault />
          <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
            <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
          </GizmoHelper>
        </Canvas>
      </div>

      {/* Playback bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-zinc-800 bg-zinc-900/80 flex-shrink-0">
        <button onClick={rewind} disabled={segments.length === 0}
          className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30" title="Rewind">
          <SkipBack size={14} />
        </button>
        <button onClick={togglePlay} disabled={segments.length === 0}
          className={`p-1 rounded ${playing ? 'text-yellow-300' : 'text-green-400'} hover:bg-zinc-800 disabled:opacity-30`}
          title={playing ? 'Pause' : 'Play (dry-run)'}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input type="range" min={0} max={Math.max(1, timing.total)} step={0.01}
          value={Math.min(playbackTime, timing.total)}
          onChange={e => scrub(Number(e.target.value))}
          disabled={segments.length === 0}
          className="flex-1 accent-blue-500"
        />
        <span className="font-mono text-xs text-zinc-400 tabular-nums w-32 text-right">
          {fmtTime(playbackTime)} / {fmtTime(timing.total)}
        </span>
        <div className="flex items-center gap-1 text-xs text-zinc-500 ml-1">
          <Gauge size={12} />
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 font-mono">
            {[1, 2, 4, 8, 16, 32, 64].map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
        {currentType && (
          <span className="text-xs font-mono text-zinc-500 w-28 truncate">
            seg {segIdx + 1}/{segments.length} · {currentType === 'cut' ? `F${currentFeed ?? '?'}` : 'rapid'}
          </span>
        )}
      </div>
    </div>
  )
}
