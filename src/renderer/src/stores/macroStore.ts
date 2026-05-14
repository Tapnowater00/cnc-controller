import { create } from 'zustand'
import type { Macro } from '../types'

interface MacroStore {
  macros: Macro[]
  loaded: boolean
  load: () => Promise<void>
  save: (macros: Macro[]) => void
  add: (m: Macro) => void
  update: (id: string, m: Partial<Macro>) => void
  remove: (id: string) => void
}

export const useMacroStore = create<MacroStore>((set, get) => ({
  macros: [],
  loaded: false,

  load: async () => {
    const macros = await window.api.store.get('macros') ?? []
    set({ macros, loaded: true })
  },

  save: (macros) => {
    set({ macros })
    window.api.store.set('macros', macros)
  },

  add: (m) => {
    const macros = [...get().macros, m]
    get().save(macros)
  },

  update: (id, partial) => {
    const macros = get().macros.map(m => m.id === id ? { ...m, ...partial } : m)
    get().save(macros)
  },

  remove: (id) => {
    const macros = get().macros.filter(m => m.id !== id)
    get().save(macros)
  },
}))
