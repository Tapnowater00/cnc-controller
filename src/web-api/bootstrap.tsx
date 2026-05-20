// Web entrypoint. Replaces the Electron preload: shows a login screen until
// the user authenticates, then installs `window.api` and mounts the main App.

import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { LoginScreen } from './LoginScreen'
import { WsTransport } from './transport'
import { makeWebApi } from './api'
import App from '../renderer/src/App'
import '../renderer/src/styles.css'

const TOKEN_KEY = 'cnc.token'

function buildWsUrl(token: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`
}

// Probe the token against the server before showing the app. The WebSocket
// upgrade returns HTTP 401 for a bad token, which appears in the browser only
// as a generic 'close' — so we do an explicit health-check round-trip up front.
async function probeToken(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(buildWsUrl(token))
    const cleanup = () => { ws.onopen = ws.onclose = ws.onerror = null }
    ws.onopen = () => { cleanup(); ws.close(); resolve(true) }
    ws.onclose = () => { cleanup(); resolve(false) }
    ws.onerror = () => { cleanup(); resolve(false) }
  })
}

function Root() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [ready, setReady] = useState(false)
  const [initialError, setInitialError] = useState<string | undefined>()

  // Validate any stored token before mounting the app — otherwise we'd flash
  // the UI and immediately have it fail every request.
  useEffect(() => {
    if (!token) { setReady(true); return }
    let cancelled = false
    probeToken(token).then((ok) => {
      if (cancelled) return
      if (!ok) {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setInitialError('Session expired. Please sign in again.')
      }
      setReady(true)
    })
    return () => { cancelled = true }
  }, [token])

  // Install the api shim and wire up auth-failure handling once we have a valid token.
  useEffect(() => {
    if (!token || !ready) return
    const t = new WsTransport(buildWsUrl(token))
    t.connect()
    ;(window as any).api = makeWebApi(t)
    return () => { t.close() }
  }, [token, ready])

  if (!ready) {
    return <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-500 text-sm">Loading…</div>
  }

  if (!token) {
    return <LoginScreen
      initialError={initialError}
      onAuthenticated={(t) => {
        localStorage.setItem(TOKEN_KEY, t)
        setInitialError(undefined)
        setToken(t)
      }}
    />
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
