import React, { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { parseGcode } from './gcodeParser'
import type { Segment } from '../../types'

interface ToolpathProps {
  segments: Segment[]
  showRapids: boolean
  currentLine: number
}

function Toolpath({ segments, showRapids, currentLine }: ToolpathProps) {
  const rapidPositions = useMemo(() => {
    const pts: number[] = []
    segments.forEach((s, i) => {
      if (s.type !== 'rapid') return
      pts.push(s.start.x, s.start.z, -s.start.y, s.end.x, s.end.z, -s.end.y)
    })
    return new Float32Array(pts)
  }, [segments])

  const cutPositions = useMemo(() => {
    const pts: number[] = []
    segments.forEach((s, i) => {
      if (s.type !== 'cut') return
      const alpha = i < currentLine ? 0.3 : 1.0
      pts.push(s.start.x, s.start.z, -s.start.y, s.end.x, s.end.z, -s.end.y)
    })
    return new Float32Array(pts)
  }, [segments, currentLine])

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
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[cutPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#22c55e" />
        </lineSegments>
      )}
    </group>
  )
}

function ToolMarker() {
  const wpos = useMachineStore(s => s.wpos)
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(wpos.x, wpos.z, -wpos.y)
    }
  })
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

interface Props {
  gcodeLines: string[]
}

export function Visualizer3D({ gcodeLines }: Props) {
  const { streamingCurrentLine } = useMachineStore()
  const { machineProfile } = useSettingsStore()
  const [showRapids, setShowRapids] = useState(true)
  const [showGrid, setShowGrid] = useState(true)

  const segments = useMemo(() => {
    if (gcodeLines.length === 0) return []
    return parseGcode(gcodeLines)
  }, [gcodeLines])

  return (
    <div className="relative w-full h-full bg-zinc-950">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setShowRapids(v => !v)}
          className={`px-2 py-0.5 rounded text-xs ${showRapids ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-800 text-zinc-500'}`}
        >
          Rapids
        </button>
        <button
          onClick={() => setShowGrid(v => !v)}
          className={`px-2 py-0.5 rounded text-xs ${showGrid ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-800 text-zinc-500'}`}
        >
          Grid
        </button>
      </div>

      {segments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs pointer-events-none">
          Load a G-code file to preview toolpath
        </div>
      )}

      <Canvas
        camera={{ position: [100, 150, 100], fov: 45, near: 0.1, far: 10000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#09090b' }}
      >
        <ambientLight intensity={0.5} />

        {showGrid && (
          <Grid
            args={[500, 500]}
            cellSize={10}
            cellColor="#1e293b"
            sectionSize={100}
            sectionColor="#334155"
            fadeDistance={800}
            position={[0, -0.1, 0]}
          />
        )}

        {machineProfile && <MachineBox profile={machineProfile} />}

        <Toolpath segments={segments} showRapids={showRapids} currentLine={streamingCurrentLine} />
        <ToolMarker />

        <OrbitControls makeDefault />
        <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
        </GizmoHelper>
      </Canvas>
    </div>
  )
}
