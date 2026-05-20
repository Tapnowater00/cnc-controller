import React, { useState } from 'react'

export function LoginScreen({ onAuthenticated, initialError }: {
  onAuthenticated: (token: string) => void
  initialError?: string
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Wrong password' : `Login failed (${res.status})`)
        return
      }
      const { token } = await res.json()
      onAuthenticated(token)
    } catch (err: any) {
      setError(err?.message ?? 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-200 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-2xl"
      >
        <h1 className="text-lg font-semibold mb-1">CNC Controller</h1>
        <p className="text-xs text-zinc-500 mb-5">Enter the controller password to continue.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          inputMode="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-sm font-semibold text-white"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
