import { create } from 'zustand'
import type { MachineProfile } from '../types'

interface Preferences {
  safeZ: number
  probeThickness: number
  probeApproachSpeed: number
  probeRetract: number
  autoConnect: boolean
  units: 'mm' | 'inch'
  lastPort: string
  lastBaud: number
  machineProfile: MachineProfile | null
  setupCompleted: boolean
}

interface SettingsStore extends Preferences {
  loaded: boolean
  load: () => Promise<void>
  save: (key: keyof Preferences, value: any) => Promise<void>
  setProfile: (p: MachineProfile | null) => void
}

const DEFAULTS: Preferences = {
  safeZ: 5,
  probeThickness: 15,
  probeApproachSpeed: 100,
  probeRetract: 2,
  autoConnect: false,
  units: 'mm',
  lastPort: '',
  lastBaud: 115200,
  machineProfile: null,
  setupCompleted: false,
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    const prefs = await window.api.store.get('preferences') ?? {}
    const lastPort = await window.api.store.get('lastPort') ?? ''
    const lastBaud = await window.api.store.get('lastBaud') ?? 115200
    const machineProfile = await window.api.store.get('machineProfile') ?? null
    set({ ...DEFAULTS, ...prefs, lastPort, lastBaud, machineProfile, loaded: true })
  },

  save: async (key, value) => {
    set({ [key]: value } as any)
    if (key === 'lastPort' || key === 'lastBaud' || key === 'machineProfile') {
      await window.api.store.set(key as string, value)
    } else {
      const prefs = { ...get(), [key]: value }
      await window.api.store.set('preferences', {
        safeZ: prefs.safeZ, probeThickness: prefs.probeThickness,
        probeApproachSpeed: prefs.probeApproachSpeed, probeRetract: prefs.probeRetract,
        autoConnect: prefs.autoConnect, units: prefs.units,
        setupCompleted: prefs.setupCompleted,
      })
    }
  },

  setProfile: (p) => {
    set({ machineProfile: p })
    window.api.store.set('machineProfile', p)
  },
}))
