import React, { useEffect, useState, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useMachineStore } from './stores/machineStore'
import { useSettingsStore } from './stores/settingsStore'
import { useMacroStore } from './stores/macroStore'

import { ConnectionBar } from './components/connection/ConnectionBar'
import { AlarmBanner } from './components/layout/AlarmBanner'
import { QuickActions } from './components/layout/QuickActions'
import { DROPanel } from './components/dro/DROPanel'
import { JogControls } from './components/jog/JogControls'
import { OverrideControls } from './components/overrides/OverrideControls'
import { WorkCoordinates } from './components/wcs/WorkCoordinates'
import { SpindleCoolant } from './components/spindle/SpindleCoolant'
import { GcodeSender } from './components/sender/GcodeSender'
import { Visualizer3D } from './components/visualizer/Visualizer3D'
import { ProbeRoutines } from './components/probe/ProbeRoutines'
import { MacroPanel } from './components/macros/MacroPanel'
import { ConsolePanel } from './components/console/ConsolePanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { CamWorkspace } from './components/cam/CamWorkspace'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

type AppTab = 'control' | 'cam'

// Section header
function SectionHeader({ title, accent = false }: { title: string; accent?: boolean }) {
  return (
    <div className={`px-3 py-1 text-xs font-semibold uppercase tracking-widest flex-shrink-0 border-b border-zinc-800 ${accent ? 'text-blue-400 bg-blue-950/20' : 'text-zinc-500 bg-zinc-900/50'}`}>
      {title}
    </div>
  )
}

// Scrollable section
function ScrollSection({ children }: { children: React.ReactNode }) {
  return <div className="overflow-y-auto flex-1">{children}</div>
}

function HomeConfirmModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const send = useMachineStore(s => s.send)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="font-semibold text-zinc-200 mb-2">Home All Axes?</h3>
        <p className="text-xs text-zinc-400 mb-4">
          The machine will move to find its limit switches. Ensure the work area is clear.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">Cancel</button>
          <button
            onClick={() => { send('$H'); onConfirm(); onClose() }}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-semibold text-white"
          >
            Home All ($H)
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorToast() {
  const errorMessage = useMachineStore(s => s.errorMessage)
  const clearError = useMachineStore(s => s.clearError)
  useEffect(() => {
    if (errorMessage) { const t = setTimeout(clearError, 5000); return () => clearTimeout(t) }
  }, [errorMessage])
  if (!errorMessage) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-red-900 border border-red-700 text-red-200 px-4 py-2 rounded-lg shadow-xl text-sm max-w-xs">
      {errorMessage}
    </div>
  )
}

export default function App() {
  const { setConnected, handleIncomingLine } = useMachineStore()
  const settings = useSettingsStore()
  const { load: loadMacros } = useMacroStore()

  const [activeTab, setActiveTab] = useState<AppTab>('control')
  const [showSettings, setShowSettings] = useState(false)
  const [showHomeConfirm, setShowHomeConfirm] = useState(false)
  const [gcodeLines, setGcodeLines] = useState<string[]>([])
  const [stepIdx, setStepIdx] = useState(3)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useKeyboardShortcuts({
    onHomeConfirm: () => setShowHomeConfirm(true),
    stepIdx,
    setStepIdx,
  })

  useEffect(() => {
    settings.load()
    loadMacros()

    const unsubData = window.api.serial.onData(handleIncomingLine)
    const unsubConn = window.api.serial.onConnectionChange(async (connected) => {
      setConnected(connected)
      if (connected) {
        // Start status polling
        pollRef.current = setInterval(() => {
          window.api.serial.write('?')
        }, 150)
        // Fetch WCS offsets after brief delay
        setTimeout(() => window.api.serial.write('$#'), 1000)
      } else {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    })

    return () => {
      unsubData()
      unsubConn()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Auto-connect on startup
  useEffect(() => {
    if (settings.loaded && settings.autoConnect && settings.lastPort) {
      window.api.serial.connect(settings.lastPort, settings.lastBaud).catch(() => {})
    }
  }, [settings.loaded])

  // Listen for CAM-generated G-code → load into sender and switch to control tab
  useEffect(() => {
    const handler = (e: Event) => {
      const gcode = (e as CustomEvent<string>).detail
      const lines = gcode.split('\n')
      setGcodeLines(lines)
      window.api.stream.load(lines).catch(() => {})
      setActiveTab('control')
    }
    window.addEventListener('cam:gcode', handler)
    return () => window.removeEventListener('cam:gcode', handler)
  }, [])

  const divider = (direction: 'horizontal' | 'vertical' = 'vertical') => (
    <PanelResizeHandle
      className={direction === 'vertical'
        ? 'w-1 hover:w-1 cursor-col-resize transition-colors hover:bg-blue-600 bg-zinc-800'
        : 'h-1 cursor-row-resize transition-colors hover:bg-blue-600 bg-zinc-800'
      }
    />
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden text-zinc-200 bg-zinc-950">
      {/* Fixed header */}
      <ConnectionBar onOpenSettings={() => setShowSettings(true)} />
      <AlarmBanner />
      <QuickActions onHomeConfirm={() => setShowHomeConfirm(true)} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        {(['control', 'cam'] as AppTab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-xs font-semibold capitalize rounded-t transition-colors ${
              activeTab === tab
                ? 'bg-zinc-800 text-zinc-100 border-t-2 border-blue-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {tab === 'cam' ? 'CAM' : 'Control'}
          </button>
        ))}
      </div>

      {/* CAM workspace */}
      {activeTab === 'cam' && (
        <div className="flex-1 overflow-hidden">
          <CamWorkspace />
        </div>
      )}

      {/* Control layout */}
      {activeTab === 'control' && <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* LEFT column */}
          <Panel defaultSize={22} minSize={18} maxSize={30} className="flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden">
            <DROPanel />
            <SectionHeader title="Jog" />
            <JogControls onHomeConfirm={() => setShowHomeConfirm(true)} />
            <SectionHeader title="Overrides" />
            <OverrideControls />
            <div className="flex-1" />
          </Panel>

          {divider()}

          {/* CENTER column */}
          <Panel defaultSize={44} minSize={30} className="flex flex-col overflow-hidden">
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={55} minSize={30}>
                <Visualizer3D gcodeLines={gcodeLines} />
              </Panel>
              {divider('horizontal')}
              <Panel defaultSize={45} minSize={25} className="flex flex-col overflow-hidden">
                <SectionHeader title="G-code Sender" accent />
                <div className="flex-1 overflow-hidden">
                  <GcodeSender onFileLoaded={setGcodeLines} externalLines={gcodeLines} />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          {divider()}

          {/* RIGHT column */}
          <Panel defaultSize={34} minSize={25} maxSize={45} className="flex flex-col bg-zinc-950 border-l border-zinc-800 overflow-hidden">
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={28} minSize={20}>
                <SectionHeader title="Work Coordinates" />
                <WorkCoordinates />
              </Panel>
              {divider('horizontal')}
              <Panel defaultSize={15} minSize={12}>
                <SectionHeader title="Spindle & Coolant" />
                <SpindleCoolant />
              </Panel>
              {divider('horizontal')}
              <Panel defaultSize={20} minSize={15}>
                <SectionHeader title="Probe Routines" />
                <ProbeRoutines />
              </Panel>
              {divider('horizontal')}
              <Panel defaultSize={15} minSize={12}>
                <SectionHeader title="Macros" />
                <MacroPanel />
              </Panel>
              {divider('horizontal')}
              <Panel defaultSize={22} minSize={15} className="flex flex-col overflow-hidden">
                <ConsolePanel />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      }

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHomeConfirm && <HomeConfirmModal onConfirm={() => {}} onClose={() => setShowHomeConfirm(false)} />}
      <ErrorToast />
    </div>
  )
}

