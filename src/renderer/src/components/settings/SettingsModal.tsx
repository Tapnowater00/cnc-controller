import React, { useState, useEffect } from 'react'
import { X, RefreshCw, Save, Download, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { UpdateStatus } from '../../types/api'
import type { Setting } from '../../types'

const SETTING_GROUPS = ['Motion', 'Axes', 'Limits', 'Homing', 'Spindle', 'Coolant', 'Probing', 'Safety', 'Display', 'Comms', 'Other']

type SettingsTab = 'grbl' | 'preferences' | 'profile' | 'about'

interface Props { onClose: () => void; initialTab?: SettingsTab }

export function SettingsModal({ onClose, initialTab = 'grbl' }: Props) {
  const { grblSettings, fetchSettings, send, connected } = useMachineStore()
  const prefs = useSettingsStore()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [group, setGroup] = useState<string>('All')

  useEffect(() => { if (connected && tab === 'grbl') fetchSettings() }, [connected, tab])

  function saveGrblSetting(id: number, value: string) {
    send(`$${id}=${value}`)
    setEditingId(null)
  }

  const groups = ['All', ...SETTING_GROUPS.filter(g => grblSettings.some(s => s.group === g))]
  const filtered = group === 'All' ? grblSettings : grblSettings.filter(s => s.group === group)

  const inputClass = "w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-200"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[700px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <span className="font-semibold text-zinc-200">Settings</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 px-5">
          {(['grbl', 'preferences', 'profile', 'about'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm py-2 px-3 -mb-px font-medium capitalize ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t === 'grbl' ? 'grbl Settings' : t === 'about' ? 'About & Updates' : t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'grbl' && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 flex-shrink-0">
                <div className="flex gap-1 overflow-x-auto">
                  {groups.map(g => (
                    <button key={g} onClick={() => setGroup(g)}
                      className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${group === g ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                      {g}
                    </button>
                  ))}
                </div>
                <button onClick={fetchSettings} disabled={!connected}
                  className="ml-auto p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-zinc-500 text-left">
                      <th className="px-3 py-1.5 font-medium w-12">ID</th>
                      <th className="px-3 py-1.5 font-medium w-24">Value</th>
                      <th className="px-3 py-1.5 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-800/30 group">
                        <td className="px-3 py-1 font-mono text-zinc-500">${s.id}</td>
                        <td className="px-3 py-1 font-mono">
                          {editingId === s.id ? (
                            <div className="flex gap-1">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveGrblSetting(s.id, editValue)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                className="w-20 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-xs font-mono text-zinc-200"
                              />
                              <button onClick={() => saveGrblSetting(s.id, editValue)} className="text-green-400 hover:text-green-300">
                                <Save size={12} />
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-zinc-200 cursor-pointer hover:text-blue-400"
                              onClick={() => { setEditingId(s.id); setEditValue(s.value) }}
                              title="Click to edit"
                            >
                              {s.value}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1 text-zinc-400">{s.description}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-8 text-center text-zinc-600">
                        {connected ? 'No settings loaded — click refresh' : 'Connect to machine to load settings'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'preferences' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'safeZ', label: 'Safe Z height (mm)', type: 'number', step: '1' },
                  { key: 'probeThickness', label: 'Probe plate thickness (mm)', type: 'number', step: '0.1' },
                  { key: 'probeApproachSpeed', label: 'Probe approach speed (mm/min)', type: 'number', step: '10' },
                  { key: 'probeRetract', label: 'Probe retract (mm)', type: 'number', step: '0.5' },
                ].map(({ key, label, type, step }) => (
                  <div key={key}>
                    <label className="text-xs text-zinc-500 block mb-1">{label}</label>
                    <input
                      type={type}
                      step={step}
                      value={(prefs as any)[key]}
                      onChange={e => prefs.save(key as any, Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400">Units</label>
                <div className="flex gap-1">
                  {['mm', 'inch'].map(u => (
                    <button key={u} onClick={() => prefs.save('units', u as any)}
                      className={`px-3 py-1 rounded text-xs ${prefs.units === u ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={prefs.autoConnect} onChange={e => prefs.save('autoConnect', e.target.checked)} />
                Auto-connect on startup
              </label>
            </div>
          )}

          {tab === 'about' && <AboutPanel />}

          {tab === 'profile' && (
            <div className="flex-1 p-5 text-xs text-zinc-400">
              <p className="mb-3">Machine profile stores your work area dimensions for the 3D visualizer and safety checks.</p>
              <div className="grid grid-cols-3 gap-3">
                {(['x', 'y', 'z'] as const).map(ax => (
                  <div key={ax}>
                    <label className="text-zinc-500 block mb-1">Work area {ax.toUpperCase()} (mm)</label>
                    <input
                      type="number"
                      value={prefs.machineProfile?.workArea[ax] ?? 300}
                      onChange={e => prefs.setProfile({
                        id: prefs.machineProfile?.id ?? 'default',
                        name: prefs.machineProfile?.name ?? 'My Machine',
                        workArea: { ...(prefs.machineProfile?.workArea ?? { x: 300, y: 300, z: 100 }), [ax]: Number(e.target.value) },
                        safeZ: prefs.safeZ,
                        probeThickness: prefs.probeThickness,
                        probeApproachSpeed: prefs.probeApproachSpeed,
                        probeRetract: prefs.probeRetract,
                      })}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AboutPanel() {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    window.api.updater.getVersion().then(setVersion)
    window.api.updater.getStatus().then(s => s && setStatus(s))
    const unsub = window.api.updater.onStatus((s: UpdateStatus) => {
      setStatus(s)
      if (s.state !== 'checking') setChecking(false)
    })
    return unsub
  }, [])

  async function check() {
    setChecking(true)
    try { await window.api.updater.check() } catch { setChecking(false) }
  }

  const isBusy = checking || status.state === 'checking' || status.state === 'downloading'

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* App identity */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <div className="w-9 h-9 rounded-full border-2 border-blue-500 relative">
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-green-400" />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold text-zinc-100">CNC Controller</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Version <span className="font-mono text-zinc-300">{version || '…'}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">grbl 1.1 / grblHAL desktop controller</div>
        </div>
      </div>

      {/* Update card */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-200">Software updates</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Updates are pulled from GitHub Releases and installed automatically.
            </div>
          </div>
          <button
            onClick={check}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-40"
          >
            <RefreshCw size={12} className={isBusy ? 'animate-spin' : ''} />
            {isBusy ? 'Checking…' : 'Check for updates'}
          </button>
        </div>

        <div className="px-4 py-3">
          <UpdateStatusRow status={status} />
        </div>
      </div>

      {/* Help text */}
      <div className="text-xs text-zinc-500 leading-relaxed space-y-1">
        <p>The app checks for updates automatically on launch. When one is found, a banner
          appears at the top of the window with a one-click install button.</p>
        <p>If the auto-installer can't reach the server, you'll get a link to download the
          installer manually from GitHub.</p>
      </div>
    </div>
  )
}

function UpdateStatusRow({ status }: { status: UpdateStatus }) {
  if (status.state === 'idle' || status.state === 'checking') {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <RefreshCw size={13} className={status.state === 'checking' ? 'animate-spin' : ''} />
        {status.state === 'checking' ? 'Checking GitHub for new releases…' : 'Click "Check for updates" to look for a new version.'}
      </div>
    )
  }

  if (status.state === 'up-to-date') {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400">
        <CheckCircle2 size={14} />
        You're on the latest version.
      </div>
    )
  }

  if (status.state === 'available') {
    return (
      <div className="flex items-center gap-2 text-xs text-blue-300">
        <Download size={13} />
        Version <span className="font-mono font-semibold">v{status.version}</span> available — preparing download…
      </div>
    )
  }

  if (status.state === 'downloading') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-blue-300">
          <Download size={13} />
          Downloading <span className="font-mono font-semibold">v{status.version}</span>
          <span className="ml-auto font-mono text-blue-400">{status.percent}%</span>
        </div>
        <div className="bg-zinc-800 h-1.5 rounded-full overflow-hidden">
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${status.percent}%` }} />
        </div>
      </div>
    )
  }

  if (status.state === 'ready') {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-green-300">
          <Download size={13} />
          Version <span className="font-mono font-semibold">v{status.version}</span> ready — restart to install.
        </div>
        <button
          onClick={() => window.api.updater.install()}
          className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-semibold"
        >
          Restart &amp; install
        </button>
      </div>
    )
  }

  if (status.state === 'fallback') {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-amber-300">
          <Download size={13} />
          Version <span className="font-mono font-semibold">v{status.version}</span> available — auto-installer unavailable.
        </div>
        <button
          onClick={() => window.api.updater.openReleasePage()}
          className="flex items-center gap-1 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
        >
          <ExternalLink size={11} /> Download from GitHub
        </button>
      </div>
    )
  }

  if (status.state === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400">
        <AlertCircle size={13} />
        Update check failed: {status.message}
      </div>
    )
  }

  return null
}
