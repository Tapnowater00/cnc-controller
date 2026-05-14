import { useEffect, useCallback } from 'react'
import { useMachineStore } from '../stores/machineStore'
import { useMacroStore } from '../stores/macroStore'

const RT_FEED_HOLD = 0x21
const RT_CYCLE_START = 0x7E
const RT_SOFT_RESET = 0x18
const RT_JOG_CANCEL = 0x85

const STEP_SIZES = [0.001, 0.01, 0.1, 1, 10, 100]

// Shared jog step state (simple module-level for cross-hook access)
let stepIdx = 3 // default 1mm
let jogFeed = 1000

export function setJogFeed(f: number) { jogFeed = f }
export function getStepIdx() { return stepIdx }

interface Handlers {
  onHomeConfirm: () => void
  stepIdx: number
  setStepIdx: (i: number) => void
}

export function useKeyboardShortcuts({ onHomeConfirm, stepIdx: si, setStepIdx }: Handlers) {
  const { sendRealtime, send, connected, state } = useMachineStore()
  const { macros } = useMacroStore()

  // Track held keys for continuous jog
  const heldKeys = new Set<string>()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

    // Realtime
    if (e.code === 'Space') { e.preventDefault(); sendRealtime(RT_FEED_HOLD); return }
    if (e.key === 'r' || e.key === 'R') { sendRealtime(RT_CYCLE_START); return }
    if (e.key === 'Escape') { sendRealtime(RT_SOFT_RESET); return }
    if (e.key === 'h' || e.key === 'H') { onHomeConfirm(); return }

    // Step size
    if (e.key === '+' || e.key === '=') { setStepIdx(Math.min(si + 1, STEP_SIZES.length - 1)); return }
    if (e.key === '-' || e.key === '_') { setStepIdx(Math.max(si - 1, 0)); return }

    // Macros F1-F8
    const fMatch = e.code.match(/^F([1-8])$/)
    if (fMatch) {
      const shortcut = `F${fMatch[1]}`
      const macro = macros.find(m => m.shortcut === shortcut)
      if (macro && connected) {
        macro.gcode.split('\n').forEach(l => { if (l.trim()) send(l.trim()) })
      }
      return
    }

    // Step jog
    if (!connected || (state !== 'Idle' && state !== 'Jog')) return
    const step = STEP_SIZES[si]
    const unit = 'G21'

    if (!heldKeys.has(e.code)) {
      heldKeys.add(e.code)
      let axes = ''
      if (e.code === 'ArrowRight') axes = `X${step}`
      else if (e.code === 'ArrowLeft') axes = `X-${step}`
      else if (e.code === 'ArrowUp') axes = `Y${step}`
      else if (e.code === 'ArrowDown') axes = `Y-${step}`
      else if (e.code === 'PageUp') axes = `Z${step}`
      else if (e.code === 'PageDown') axes = `Z-${step}`
      if (axes) {
        e.preventDefault()
        send(`$J=G91 ${unit} ${axes} F${jogFeed}`)
      }
    }
  }, [connected, state, si, macros, send, sendRealtime, onHomeConfirm, setStepIdx])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    heldKeys.delete(e.code)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])
}
