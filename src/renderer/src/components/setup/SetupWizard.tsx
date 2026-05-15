import React, { useEffect, useState } from 'react'
import {
  X, ChevronLeft, ChevronRight, Check, Plug, PlugZap, RefreshCw, AlertTriangle,
  Wand2, Cog, Ruler, Zap, ShieldCheck, Crosshair, PartyPopper,
} from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { PortInfo } from '../../types'

interface Props { onClose: () => void }

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: Wand2 },
  { id: 'connect', title: 'Connect', icon: Plug },
  { id: 'profile', title: 'Machine', icon: Cog },
  { id: 'steps',   title: 'Steps/mm', icon: Ruler },
  { id: 'spindle', title: 'Spindle', icon: Zap },
  { id: 'safety',  title: 'Safety', icon: ShieldCheck },
  { id: 'probe',   title: 'Finish', icon: Crosshair },
] as const

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000]

interface WizardConfig {
  name: string
  workArea: { x: number; y: number; z: number }
  safeZ: number
  stepsPerMm: { x: number; y: number; z: number }
  spindle: { max: number; min: number; laser: boolean }
  safety: { softLimits: boolean; hardLimits: boolean; homing: boolean }
  probe: { thickness: number; approach: number; retract: number }
}

function defaultConfig(prefs: ReturnType<typeof useSettingsStore.getState>): WizardConfig {
  const p = prefs.machineProfile
  return {
    name: p?.name ?? 'My CNC',
    workArea: p?.workArea ?? { x: 300, y: 300, z: 100 },
    safeZ: prefs.safeZ ?? 5,
    stepsPerMm: { x: 80, y: 80, z: 400 },
    spindle: { max: 24000, min: 0, laser: false },
    safety: { softLimits: true, hardLimits: true, homing: true },
    probe: {
      thickness: prefs.probeThickness ?? 15,
      approach: prefs.probeApproachSpeed ?? 100,
      retract: prefs.probeRetract ?? 2,
    },
  }
}

export function SetupWizard({ onClose }: Props) {
  const connected = useMachineStore(s => s.connected)
  const state = useMachineStore(s => s.state)
  const firmware = useMachineStore(s => s.firmware)
  const grblSettings = useMachineStore(s => s.grblSettings)
  const send = useMachineStore(s => s.send)
  const fetchSettings = useMachineStore(s => s.fetchSettings)
  const prefs = useSettingsStore()

  const [stepIdx, setStepIdx] = useState(0)
  const [cfg, setCfg] = useState<WizardConfig>(() => defaultConfig(useSettingsStore.getState()))
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  // Pre-fill steps/mm and spindle from controller once $$ has been loaded
  useEffect(() => {
    if (!connected || grblSettings.length === 0) return
    const find = (id: number) => parseFloat(grblSettings.find(s => s.id === id)?.value ?? '')
    setCfg(c => ({
      ...c,
      stepsPerMm: {
        x: isFinite(find(100)) ? find(100) : c.stepsPerMm.x,
        y: isFinite(find(101)) ? find(101) : c.stepsPerMm.y,
        z: isFinite(find(102)) ? find(102) : c.stepsPerMm.z,
      },
      spindle: {
        max: isFinite(find(30)) ? find(30) : c.spindle.max,
        min: isFinite(find(31)) ? find(31) : c.spindle.min,
        laser: find(32) === 1,
      },
      workArea: {
        x: isFinite(find(130)) ? find(130) : c.workArea.x,
        y: isFinite(find(131)) ? find(131) : c.workArea.y,
        z: isFinite(find(132)) ? find(132) : c.workArea.z,
      },
    }))
  }, [connected, grblSettings.length])

  const current = STEPS[stepIdx]

  function next() { if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1) }
  function back() { if (stepIdx > 0) setStepIdx(stepIdx - 1) }

  function canAdvance(): boolean {
    if (current.id === 'connect') return connected
    if (current.id === 'profile')
      return cfg.name.trim().length > 0
        && cfg.workArea.x > 0 && cfg.workArea.y > 0 && cfg.workArea.z > 0
        && cfg.safeZ >= 0
    if (current.id === 'steps')
      return cfg.stepsPerMm.x > 0 && cfg.stepsPerMm.y > 0 && cfg.stepsPerMm.z > 0
    if (current.id === 'spindle')
      return cfg.spindle.max > 0 && cfg.spindle.min >= 0 && cfg.spindle.min < cfg.spindle.max
    if (current.id === 'probe')
      return cfg.probe.thickness > 0 && cfg.probe.approach > 0
    return true
  }

  async function applyAndFinish() {
    setApplying(true)
    setApplyError(null)

    try {
      // Build $N=V list. Order matters for grblHAL: homing must be enabled
      // before soft-limits can be set.
      const writes: string[] = [
        `$100=${cfg.stepsPerMm.x}`,
        `$101=${cfg.stepsPerMm.y}`,
        `$102=${cfg.stepsPerMm.z}`,
        `$30=${cfg.spindle.max}`,
        `$31=${cfg.spindle.min}`,
        `$32=${cfg.spindle.laser ? 1 : 0}`,
        `$130=${cfg.workArea.x}`,
        `$131=${cfg.workArea.y}`,
        `$132=${cfg.workArea.z}`,
        `$22=${cfg.safety.homing ? 1 : 0}`,
        `$21=${cfg.safety.hardLimits ? 1 : 0}`,
        `$20=${cfg.safety.softLimits ? 1 : 0}`,
      ]

      if (connected && state !== 'Alarm') {
        for (const cmd of writes) {
          send(cmd)
          // grblHAL is fast but $$ writes are EEPROM-backed; small spacing
          // keeps the RX buffer tidy on slower MCUs
          await new Promise(r => setTimeout(r, 40))
        }
        // Re-read so the UI reflects the new values
        setTimeout(() => fetchSettings(), 200)
      }

      // Persist profile + preferences
      prefs.setProfile({
        id: prefs.machineProfile?.id ?? 'default',
        name: cfg.name,
        workArea: cfg.workArea,
        safeZ: cfg.safeZ,
        probeThickness: cfg.probe.thickness,
        probeApproachSpeed: cfg.probe.approach,
        probeRetract: cfg.probe.retract,
      })
      await prefs.save('safeZ', cfg.safeZ)
      await prefs.save('probeThickness', cfg.probe.thickness)
      await prefs.save('probeApproachSpeed', cfg.probe.approach)
      await prefs.save('probeRetract', cfg.probe.retract)
      await prefs.save('setupCompleted', true)

      onClose()
    } catch (e: any) {
      setApplyError(e?.message ?? 'Failed to apply settings')
    } finally {
      setApplying(false)
    }
  }

  function skip() {
    prefs.save('setupCompleted', true)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[760px] max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-blue-400" />
            <span className="font-semibold text-zinc-200">Setup Wizard</span>
            <span className="text-xs text-zinc-500">Step {stepIdx + 1} of {STEPS.length}</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-1 overflow-x-auto flex-shrink-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const active = i === stepIdx
            const done = i < stepIdx
            return (
              <React.Fragment key={s.id}>
                <button
                  onClick={() => i <= stepIdx && setStepIdx(i)}
                  disabled={i > stepIdx}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors
                    ${active ? 'bg-blue-600 text-white' : done ? 'text-green-400 hover:bg-zinc-800' : 'text-zinc-600 cursor-default'}`}
                >
                  {done ? <Check size={12} /> : <Icon size={12} />}
                  {s.title}
                </button>
                {i < STEPS.length - 1 && <div className="text-zinc-700 text-xs">·</div>}
              </React.Fragment>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {current.id === 'welcome' && <WelcomeStep />}
          {current.id === 'connect' && <ConnectStep />}
          {current.id === 'profile' && <ProfileStep cfg={cfg} setCfg={setCfg} />}
          {current.id === 'steps'   && <StepsStep cfg={cfg} setCfg={setCfg} />}
          {current.id === 'spindle' && <SpindleStep cfg={cfg} setCfg={setCfg} />}
          {current.id === 'safety'  && <SafetyStep cfg={cfg} setCfg={setCfg} />}
          {current.id === 'probe'   && <FinishStep cfg={cfg} setCfg={setCfg} connected={connected} state={state} firmware={firmware} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 flex-shrink-0">
          <button onClick={skip}
            className="text-xs text-zinc-500 hover:text-zinc-300">
            Skip wizard
          </button>
          {applyError && (
            <span className="text-xs text-red-400 truncate max-w-[300px]">{applyError}</span>
          )}
          <div className="flex items-center gap-2">
            <button onClick={back} disabled={stepIdx === 0}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm disabled:opacity-30">
              <ChevronLeft size={14} /> Back
            </button>
            {stepIdx < STEPS.length - 1 ? (
              <button onClick={next} disabled={!canAdvance()}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white font-semibold disabled:opacity-30">
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={applyAndFinish} disabled={applying || !canAdvance()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm text-white font-semibold disabled:opacity-30">
                {applying ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {applying ? 'Applying…' : 'Finish & Apply'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Steps ─────────────────────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-200">Configure your CNC</h2>
      <p className="text-sm text-zinc-400">
        This wizard walks you through the settings you'll typically configure once when
        commissioning a new grblHAL controller:
      </p>
      <ul className="text-sm text-zinc-400 space-y-1.5 ml-1">
        <li className="flex gap-2"><span className="text-blue-400">•</span> Serial connection (port and baud rate)</li>
        <li className="flex gap-2"><span className="text-blue-400">•</span> Machine profile — name and work area</li>
        <li className="flex gap-2"><span className="text-blue-400">•</span> Steps/mm calibration (<code className="text-zinc-300">$100</code>–<code className="text-zinc-300">$102</code>)</li>
        <li className="flex gap-2"><span className="text-blue-400">•</span> Spindle range and laser mode (<code className="text-zinc-300">$30</code>–<code className="text-zinc-300">$32</code>)</li>
        <li className="flex gap-2"><span className="text-blue-400">•</span> Limits and homing (<code className="text-zinc-300">$20</code>–<code className="text-zinc-300">$22</code>, <code className="text-zinc-300">$130</code>–<code className="text-zinc-300">$132</code>)</li>
        <li className="flex gap-2"><span className="text-blue-400">•</span> Probe plate dimensions and approach speed</li>
      </ul>
      <p className="text-xs text-zinc-500">
        Each step has sensible defaults — you can change everything later from
        Settings → grblHAL Settings.
      </p>
    </div>
  )
}

function ConnectStep() {
  const connected = useMachineStore(s => s.connected)
  const firmware = useMachineStore(s => s.firmware)
  const { lastPort, lastBaud, save } = useSettingsStore()
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [port, setPort] = useState(lastPort)
  const [baud, setBaud] = useState(lastBaud)
  const [connecting, setConnecting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    const list = await window.api.serial.listPorts()
    setPorts(list)
    if (!port && list[0]) setPort(list[0].path)
  }

  async function connect() {
    if (!port) return
    setConnecting(true); setErr(null)
    try {
      await window.api.serial.connect(port, baud)
      await save('lastPort', port)
      await save('lastBaud', baud)
    } catch (e: any) {
      setErr(e?.message ?? 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() { await window.api.serial.disconnect() }

  if (connected) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-200">Connected</h2>
        <div className="bg-green-950/30 border border-green-800 rounded p-4 flex items-start gap-3">
          <Check size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="text-green-300 font-medium">{port || lastPort}</div>
            <div className="text-zinc-400">{baud} baud · {firmware || 'firmware unknown'}</div>
          </div>
        </div>
        <button onClick={disconnect}
          className="text-xs text-zinc-500 hover:text-red-400">Disconnect and try a different port</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-200">Connect to your controller</h2>
      <p className="text-sm text-zinc-400">
        Plug in the controller via USB. If the port isn't listed, hit refresh.
      </p>

      <div className="grid grid-cols-[1fr_140px_120px] gap-3 items-end">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Port</label>
          <div className="flex gap-1">
            <select value={port} onChange={e => setPort(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm">
              {ports.length === 0 && <option value="">No ports found</option>}
              {ports.map(p => (
                <option key={p.path} value={p.path}>
                  {p.path}{p.manufacturer ? ` (${p.manufacturer.slice(0, 24)})` : ''}
                </option>
              ))}
            </select>
            <button onClick={refresh} title="Refresh ports"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Baud</label>
          <select value={baud} onChange={e => setBaud(Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm">
            {BAUDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <button onClick={connect} disabled={!port || connecting}
          className="flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white font-semibold disabled:opacity-30">
          {connecting ? <RefreshCw size={14} className="animate-spin" /> : <PlugZap size={14} />}
          {connecting ? 'Connecting' : 'Connect'}
        </button>
      </div>

      {err && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">
          {err}
        </div>
      )}
      <p className="text-xs text-zinc-500">grblHAL defaults to 115200 baud.</p>
    </div>
  )
}

function ProfileStep({ cfg, setCfg }: { cfg: WizardConfig; setCfg: (c: WizardConfig) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-200">Machine profile</h2>
      <p className="text-sm text-zinc-400">
        Give the machine a name and describe its travel envelope. Work-area
        dimensions also feed the 3D visualizer and the soft-limit jog guard.
      </p>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Name</label>
        <input value={cfg.name} onChange={e => setCfg({ ...cfg, name: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm" />
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-1">Work area (mm)</div>
        <div className="grid grid-cols-3 gap-3">
          {(['x', 'y', 'z'] as const).map(ax => (
            <div key={ax}>
              <label className="text-xs text-zinc-600 block mb-0.5">{ax.toUpperCase()}</label>
              <input type="number" min={0} value={cfg.workArea[ax]}
                onChange={e => setCfg({ ...cfg, workArea: { ...cfg.workArea, [ax]: Number(e.target.value) } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Safe Z height (mm above work surface)</label>
        <input type="number" min={0} step={0.5} value={cfg.safeZ}
          onChange={e => setCfg({ ...cfg, safeZ: Number(e.target.value) })}
          className="w-32 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
        <p className="text-xs text-zinc-500 mt-1">Used as the rapid-clearance height for jog and toolpath retracts.</p>
      </div>
    </div>
  )
}

function StepsStep({ cfg, setCfg }: { cfg: WizardConfig; setCfg: (c: WizardConfig) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-200">Steps per mm calibration</h2>
      <p className="text-sm text-zinc-400">
        These values are loaded from the controller if already set
        (<code className="text-zinc-300">$100</code> / <code className="text-zinc-300">$101</code> / <code className="text-zinc-300">$102</code>).
      </p>

      <div className="grid grid-cols-3 gap-3">
        {(['x', 'y', 'z'] as const).map(ax => (
          <div key={ax}>
            <label className="text-xs text-zinc-500 block mb-1">{ax.toUpperCase()} steps/mm</label>
            <input type="number" min={0} step={0.01} value={cfg.stepsPerMm[ax]}
              onChange={e => setCfg({ ...cfg, stepsPerMm: { ...cfg.stepsPerMm, [ax]: Number(e.target.value) } })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
          </div>
        ))}
      </div>

      <div className="bg-zinc-800/50 border border-zinc-700 rounded p-3 text-xs text-zinc-400 space-y-1">
        <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
          <AlertTriangle size={12} className="text-yellow-500" /> How to verify
        </div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Jog the axis exactly 100 mm.</li>
          <li>Measure the actual distance with calipers or a rule.</li>
          <li>New value = current × (100 / measured).</li>
        </ol>
        <div className="text-zinc-500 mt-1">
          Typical defaults: 80 (XY GT2 belt + 20T pulley), 400 (Z TR8×8 leadscrew, 1/16 microstep).
        </div>
      </div>
    </div>
  )
}

function SpindleStep({ cfg, setCfg }: { cfg: WizardConfig; setCfg: (c: WizardConfig) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-200">Spindle &amp; laser</h2>
      <p className="text-sm text-zinc-400">
        Configures <code className="text-zinc-300">$30</code> / <code className="text-zinc-300">$31</code> /
        <code className="text-zinc-300">$32</code>. Maximum RPM scales the PWM duty cycle
        of <code>S</code> commands.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max spindle RPM</label>
          <input type="number" min={0} step={100} value={cfg.spindle.max}
            onChange={e => setCfg({ ...cfg, spindle: { ...cfg.spindle, max: Number(e.target.value) } })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Min spindle RPM</label>
          <input type="number" min={0} step={100} value={cfg.spindle.min}
            onChange={e => setCfg({ ...cfg, spindle: { ...cfg.spindle, min: Number(e.target.value) } })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
        </div>
      </div>

      <label className="flex items-start gap-3 bg-zinc-800/50 border border-zinc-700 rounded p-3 cursor-pointer hover:bg-zinc-800">
        <input type="checkbox" checked={cfg.spindle.laser}
          onChange={e => setCfg({ ...cfg, spindle: { ...cfg.spindle, laser: e.target.checked } })}
          className="mt-0.5" />
        <div className="text-sm">
          <div className="text-zinc-200">Laser mode (<code className="text-zinc-400">$32=1</code>)</div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Enable if the spindle output drives a laser. Dynamic power adjusts with motion;
            <code className="text-zinc-400"> M3 </code> is non-blocking. Disable for a real spindle.
          </p>
        </div>
      </label>
    </div>
  )
}

function SafetyStep({ cfg, setCfg }: { cfg: WizardConfig; setCfg: (c: WizardConfig) => void }) {
  // Soft limits require homing to be enabled.
  function setSafety(k: keyof WizardConfig['safety'], v: boolean) {
    const next = { ...cfg.safety, [k]: v }
    if (k === 'homing' && !v) next.softLimits = false
    if (k === 'softLimits' && v) next.homing = true
    setCfg({ ...cfg, safety: next })
  }

  const Row = ({ k, label, hint, code }: { k: keyof WizardConfig['safety']; label: string; hint: string; code: string }) => (
    <label className="flex items-start gap-3 bg-zinc-800/50 border border-zinc-700 rounded p-3 cursor-pointer hover:bg-zinc-800">
      <input type="checkbox" checked={cfg.safety[k]} onChange={e => setSafety(k, e.target.checked)} className="mt-0.5" />
      <div className="text-sm flex-1">
        <div className="flex items-center gap-2">
          <span className="text-zinc-200">{label}</span>
          <code className="text-xs text-zinc-500">{code}</code>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>
      </div>
    </label>
  )

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-200">Safety &amp; limits</h2>
      <p className="text-sm text-zinc-400">
        Max travel <code>$130</code> / <code>$131</code> / <code>$132</code> will be
        written from your work-area values
        ({cfg.workArea.x} × {cfg.workArea.y} × {cfg.workArea.z} mm).
      </p>

      <Row k="homing"      label="Homing enabled"
        hint="Allows the $H command. Required before soft limits can be used."
        code="$22=1" />
      <Row k="hardLimits"  label="Hard limits"
        hint="Physical limit switches halt motion immediately when triggered. Requires switches on each axis."
        code="$21=1" />
      <Row k="softLimits"  label="Soft limits"
        hint="Firmware refuses motion that would exceed $130/$131/$132. Requires homing."
        code="$20=1" />

      {!cfg.safety.homing && cfg.safety.softLimits && (
        <div className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800 rounded px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={13} /> Soft limits will be disabled because homing is off.
        </div>
      )}
    </div>
  )
}

function FinishStep({ cfg, setCfg, connected, state, firmware }: {
  cfg: WizardConfig; setCfg: (c: WizardConfig) => void
  connected: boolean; state: string; firmware: string
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
        <PartyPopper size={18} className="text-green-400" /> Almost done
      </h2>

      <div>
        <div className="text-xs text-zinc-500 mb-1">Probe plate</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-zinc-600 block mb-0.5">Thickness (mm)</label>
            <input type="number" min={0} step={0.1} value={cfg.probe.thickness}
              onChange={e => setCfg({ ...cfg, probe: { ...cfg.probe, thickness: Number(e.target.value) } })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-zinc-600 block mb-0.5">Approach (mm/min)</label>
            <input type="number" min={1} step={10} value={cfg.probe.approach}
              onChange={e => setCfg({ ...cfg, probe: { ...cfg.probe, approach: Number(e.target.value) } })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-zinc-600 block mb-0.5">Retract (mm)</label>
            <input type="number" min={0} step={0.5} value={cfg.probe.retract}
              onChange={e => setCfg({ ...cfg, probe: { ...cfg.probe, retract: Number(e.target.value) } })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono" />
          </div>
        </div>
      </div>

      <div className="bg-zinc-800/60 border border-zinc-700 rounded p-3 text-xs text-zinc-400 space-y-1">
        <div className="text-zinc-200 font-medium mb-1">Summary</div>
        <div><span className="text-zinc-500">Profile:</span> {cfg.name} — {cfg.workArea.x}×{cfg.workArea.y}×{cfg.workArea.z} mm, safe Z {cfg.safeZ}</div>
        <div><span className="text-zinc-500">Steps/mm:</span> X {cfg.stepsPerMm.x} · Y {cfg.stepsPerMm.y} · Z {cfg.stepsPerMm.z}</div>
        <div><span className="text-zinc-500">Spindle:</span> {cfg.spindle.min}–{cfg.spindle.max} RPM {cfg.spindle.laser ? '(laser mode)' : ''}</div>
        <div><span className="text-zinc-500">Safety:</span>
          {' '}{cfg.safety.homing ? '$22 ' : ''}
          {cfg.safety.hardLimits ? '$21 ' : ''}
          {cfg.safety.softLimits ? '$20' : ''}
          {!cfg.safety.homing && !cfg.safety.hardLimits && !cfg.safety.softLimits ? 'none' : ''}
        </div>
      </div>

      <div className={`text-xs rounded px-3 py-2 border ${
        !connected ? 'text-yellow-300 bg-yellow-950/30 border-yellow-800'
        : state === 'Alarm' ? 'text-yellow-300 bg-yellow-950/30 border-yellow-800'
        : 'text-green-300 bg-green-950/30 border-green-800'
      }`}>
        {!connected
          ? 'Not connected — profile + preferences will be saved locally. Reconnect and re-run the wizard to push grblHAL settings.'
          : state === 'Alarm'
          ? `Controller is in Alarm state — clear the alarm before applying ($X) or the writes may be rejected. ${firmware}`
          : `Ready to write 12 settings to ${firmware || 'controller'}. Click Finish to apply.`}
      </div>
    </div>
  )
}
