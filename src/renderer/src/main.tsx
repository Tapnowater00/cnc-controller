import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'

async function init() {
  if (!(window as any).api) {
    const { installWebApi } = await import('./webapi')
    // Never block app rendering if the API surface can't fully initialize
    // (e.g. iOS Safari with no Web Serial and no reachable bridge).
    try { await installWebApi() } catch (e) { console.warn('installWebApi failed:', e) }
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

init()
