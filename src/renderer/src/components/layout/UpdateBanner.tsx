import React, { useEffect, useState } from 'react'
import { Download, ExternalLink, RotateCw, X, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '../../types/api'

// The header banner only shows when something actionable is happening
// (available / downloading / ready / fallback). Quiet states (idle,
// checking, up-to-date, error) are surfaced only from Settings.
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.api.updater.getStatus().then(s => s && setStatus(s))
    const unsub = window.api.updater.onStatus((s: UpdateStatus) => {
      setStatus(s)
      setDismissed(false)
    })
    return unsub
  }, [])

  if (dismissed) return null
  if (status.state !== 'available' && status.state !== 'downloading' &&
      status.state !== 'ready' && status.state !== 'fallback') return null

  if (status.state === 'available' || status.state === 'downloading') {
    const pct = status.state === 'downloading' ? status.percent : 0
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-950/40 border-b border-blue-800 text-xs text-blue-200">
        <RotateCw size={13} className="animate-spin" />
        <span className="font-medium">Update v{status.version} downloading…</span>
        <div className="flex-1 max-w-[260px] bg-zinc-800 h-1.5 rounded-full overflow-hidden">
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-blue-400 w-10 text-right">{pct}%</span>
      </div>
    )
  }

  if (status.state === 'ready') {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-green-950/40 border-b border-green-800 text-xs text-green-200">
        <span className="flex items-center gap-2">
          <Download size={13} />
          <span>Update v{status.version} ready — restart to install.</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.api.updater.install()}
            className="px-2 py-0.5 rounded bg-green-600 hover:bg-green-500 text-white font-semibold"
          >
            Restart &amp; install
          </button>
          <button onClick={() => setDismissed(true)} className="text-green-500 hover:text-green-200" title="Later"><X size={14} /></button>
        </div>
      </div>
    )
  }

  if (status.state === 'fallback') {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-amber-950/40 border-b border-amber-800 text-xs text-amber-200">
        <span className="flex items-center gap-2">
          <Download size={13} />
          <span>Update v{status.version} available — auto-installer unavailable, download manually.</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.api.updater.openReleasePage()}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold"
          >
            <ExternalLink size={11} /> Open release
          </button>
          <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-200" title="Later"><X size={14} /></button>
        </div>
      </div>
    )
  }

  return null
}

// Small inline control used inside SettingsModal — surfaces version + manual check.
export function UpdateControlsRow() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [version, setVersion] = useState('')
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
    try { await window.api.updater.check() } finally { /* status event clears flag */ }
  }

  const note =
    status.state === 'checking' ? 'Checking…' :
    status.state === 'available' ? `v${status.version} available — downloading` :
    status.state === 'downloading' ? `v${status.version} downloading (${status.percent}%)` :
    status.state === 'ready' ? `v${status.version} ready — restart to install` :
    status.state === 'fallback' ? `v${status.version} available — manual download` :
    status.state === 'up-to-date' ? 'Up to date' :
    status.state === 'error' ? 'Check failed' :
    ''

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-500">App version</span>
      <span className="font-mono text-zinc-200">{version || '…'}</span>
      <button onClick={check} disabled={checking || status.state === 'checking'}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40">
        <RefreshCw size={11} className={checking || status.state === 'checking' ? 'animate-spin' : ''} />
        Check for updates
      </button>
      {note && <span className="text-zinc-500">— {note}</span>}
    </div>
  )
}
