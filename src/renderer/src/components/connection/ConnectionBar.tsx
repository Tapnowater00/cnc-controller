import React, { useEffect, useState } from 'react'
import { Plug, PlugZap, RefreshCw, Settings, Wand2 } from 'lucide-react'
import { useMachineStore } from '../../stores/machineStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { PortInfo } from '../../types'

interface Props {
  onOpenSettings: () => void
  onOpenWizard: () => void
}

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000]

export function ConnectionBar({ onOpenSettings, onOpenWizard }: Props) {
  const connected = useMachineStore(s => s.connected)
  const firmware = useMachineStore(s => s.firmware)
  const state = useMachineStore(s => s.state)
  const { lastPort, lastBaud, save } = useSettingsStore()

  const [ports, setPorts] = useState<PortInfo[]>([])
  const [port, setPort] = useState(lastPort)
  const [baud, setBaud] = useState(lastBaud)
  const [connecting, setConnecting] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => { refreshPorts() }, [])
  useEffect(() => { if (lastPort && !port) setPort(lastPort) }, [lastPort])
  useEffect(() => {
    if (!connected && !connecting) setReconnecting(false)
  }, [connected])

  async function refreshPorts() {
    const list = await window.api.serial.listPorts()
    setPorts(list)
    if (!port && list[0]) setPort(list[0].path)
  }

  async function connect() {
    if (!port) return
    setConnecting(true)
    try {
      await window.api.serial.connect(port, baud)
      await save('lastPort', port)
      await save('lastBaud', baud)
    } catch (e) {
      console.error(e)
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    await window.api.serial.disconnect()
  }

  const stateColor = connected ? (state === 'Alarm' ? 'bg-red-500' : state === 'Run' || state === 'Jog' ? 'bg-blue-500' : state === 'Hold' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-zinc-600'

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
      {/* Port refresh + selector */}
      <button onClick={refreshPorts} className="p-1 text-zinc-400 hover:text-zinc-200" title="Refresh ports">
        <RefreshCw size={14} />
      </button>
      <select
        value={port}
        onChange={e => setPort(e.target.value)}
        disabled={connected}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 disabled:opacity-50 min-w-[140px]"
      >
        {ports.length === 0 && <option value="">No ports found</option>}
        {ports.map(p => (
          <option key={p.path} value={p.path}>
            {p.path}{p.manufacturer ? ` (${p.manufacturer.slice(0, 20)})` : ''}
          </option>
        ))}
      </select>

      {/* Baud rate */}
      <select
        value={baud}
        onChange={e => setBaud(Number(e.target.value))}
        disabled={connected}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 disabled:opacity-50"
      >
        {BAUDS.map(b => <option key={b} value={b}>{b}</option>)}
      </select>

      {/* Connect/Disconnect */}
      <button
        onClick={connected ? disconnect : connect}
        disabled={connecting || (!port && !connected)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium transition-colors ${
          connected
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
        }`}
      >
        {connecting ? <RefreshCw size={14} className="animate-spin" /> : connected ? <Plug size={14} /> : <PlugZap size={14} />}
        {connecting ? 'Connecting…' : reconnecting ? 'Reconnecting…' : connected ? 'Disconnect' : 'Connect'}
      </button>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5 ml-1">
        <div className={`w-2 h-2 rounded-full ${stateColor} ${connected ? 'shadow-[0_0_6px_currentColor]' : ''}`} />
        <span className="text-xs font-mono text-zinc-300">
          {connected ? state : 'Disconnected'}
        </span>
      </div>

      {/* Firmware */}
      {firmware && (
        <span className="text-xs text-zinc-500 font-mono ml-1">
          {firmware}
        </span>
      )}

      <div className="flex-1" />

      <button onClick={onOpenWizard} className="p-1.5 text-zinc-400 hover:text-blue-400 rounded" title="Setup Wizard">
        <Wand2 size={16} />
      </button>
      <button onClick={onOpenSettings} className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded" title="Settings">
        <Settings size={16} />
      </button>
    </div>
  )
}
