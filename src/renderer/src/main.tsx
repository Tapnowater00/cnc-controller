import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'

async function init() {
  if (!(window as any).api) {
    const { installWebApi } = await import('./webapi')
    await installWebApi()
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

init()
