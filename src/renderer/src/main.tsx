import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'

// Electron's preload script sets window.api before the renderer runs. When that
// is missing we're running in a browser (iPad / desktop web) and need to boot
// through the auth + WebSocket transport instead.
if (typeof (window as any).api === 'undefined') {
  import('../../web-api/bootstrap')
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
