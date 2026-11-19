import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const uid = () => Math.random().toString(36).slice(2, 10)

export type SchemaSource = 'file' | 'introspection' | 'paste'
export interface SchemaEntry {
  id: string
  name: string
  sdl: string
  source: SchemaSource
  addedAt: number
}

export interface HeaderRow {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
  size: number
  error?: string
  via?: string | null
  skippedHeaders?: string[]
  mode: 'proxy' | 'direct'
  at: number
}

export interface QueryTab {
  id: string
  title: string
  query: string
  variables: string
  operationName?: string
  response?: ResponseData | null
  loading?: boolean
}

export interface HistoryItem {
  id: string
  at: number
  url: string
  query: string
  variables: string
  operationName?: string
  status: number
  timeMs: number
  ok: boolean
}

export interface Settings {
  url: string
  method: 'POST' | 'GET'
  headers: HeaderRow[]
  useProxy: boolean // route through the local Node proxy (no CORS)
  upstreamEnabled: boolean // chain an upstream proxy (Burp, mitmproxy...)
  upstreamProxy: string
  insecureTLS: boolean
  timeoutMs: number
  tagEnabled: boolean // add a marker header to identify tool traffic
  tagName: string
}

export type View = 'workspace' | 'schema'
export type LeftPanel = 'builder' | 'docs' | 'history'

export type Lang = 'es' | 'en'
export type ThemeId = 'studio' | 'ocean' | 'forest' | 'ember' | 'graphite' | 'light'
export interface Prefs {
  lang: Lang
  theme: ThemeId
  uiFont: string
  monoFont: string
  editorFontSize: number
  uiScale: number
}

export interface ToastAction { label: string; run: () => void }
interface Toast { id: string; kind: 'ok' | 'err' | 'info'; text: string; action?: ToastAction }

interface State {
  schemas: SchemaEntry[]
  activeSchemaId: string | null
  tabs: QueryTab[]
  activeTabId: string
  settings: Settings
  history: HistoryItem[]
  view: View
  leftPanel: LeftPanel
  leftWidth: number
  rightWidth: number
  varsHeight: number
  docsStack: string[]
  graphType: string | null
  toasts: Toast[]
  fill: { depth: number; typename: boolean }
  prefs: Prefs

  addSchema: (s: Omit<SchemaEntry, 'id' | 'addedAt'>) => string
  removeSchema: (id: string) => void
  renameSchema: (id: string, name: string) => void
  setActiveSchema: (id: string) => void

  addTab: (partial?: Partial<QueryTab>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<QueryTab>) => void
  clearTab: (id: string) => void

  setSettings: (patch: Partial<Settings>) => void
  pushHistory: (h: Omit<HistoryItem, 'id'>) => void
  clearHistory: () => void

  setView: (v: View) => void
  setLeftPanel: (p: LeftPanel) => void
  setLayout: (patch: Partial<Pick<State, 'leftWidth' | 'rightWidth' | 'varsHeight'>>) => void
  openDocs: (typeName: string | null, opts?: { reset?: boolean }) => void
  docsBack: () => void
  setGraphType: (t: string | null) => void
  toast: (text: string, kind?: Toast['kind'], action?: ToastAction) => void
  dismissToast: (id: string) => void
  setFill: (patch: Partial<State['fill']>) => void
  setPrefs: (patch: Partial<Prefs>) => void
}

const defaultLang: Lang = 'en'

const DEFAULT_QUERY = `# Welcome to GraphQL Studio ✦
#
# 1. Load a .graphql schema (drop the file onto the window)
# 2. Build your operation with the Builder on the left
# 3. Set endpoint, headers and proxy at the top
# 4. Run with  ⌘/Ctrl + Enter
`

export const DEFAULT_PREFS: Prefs = {
  lang: defaultLang,
  theme: 'studio',
  uiFont: 'inter',
  monoFont: 'jetbrains',
  editorFontSize: 12.5,
  uiScale: 1,
}

const newTab = (partial: Partial<QueryTab> = {}): QueryTab => ({
  id: uid(),
  title: '',
  query: DEFAULT_QUERY,
  variables: '{\n  \n}',
  response: null,
  ...partial,
})

const firstTab = newTab()

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      schemas: [],
      activeSchemaId: null,
      tabs: [firstTab],
      activeTabId: firstTab.id,
      settings: {
        url: 'http://localhost:4000/graphql',
        method: 'POST',
        headers: [
          { id: uid(), key: 'Content-Type', value: 'application/json', enabled: true },
          { id: uid(), key: 'Authorization', value: 'Bearer ', enabled: false },
        ],
        useProxy: true,
        upstreamEnabled: false,
        upstreamProxy: 'http://127.0.0.1:8080',
        insecureTLS: false,
        timeoutMs: 60000,
        tagEnabled: true,
        tagName: 'X-GraphQL-Studio',
      },
      history: [],
      view: 'workspace',
      leftPanel: 'builder',
      leftWidth: 360,
      rightWidth: 520,
      varsHeight: 220,
      docsStack: [],
      graphType: null,
      toasts: [],
      fill: { depth: 3, typename: true },
      prefs: DEFAULT_PREFS,
      setPrefs: (patch) => set((st) => ({ prefs: { ...st.prefs, ...patch } })),
      setFill: (patch) => set((st) => ({ fill: { ...st.fill, ...patch } })),

      addSchema: (s) => {
        const id = uid()
        set((st) => ({
          schemas: [...st.schemas, { ...s, id, addedAt: Date.now() }],
          activeSchemaId: id,
          docsStack: [],
          graphType: null,
        }))
        return id
      },
      removeSchema: (id) =>
        set((st) => {
          const schemas = st.schemas.filter((x) => x.id !== id)
          return {
            schemas,
            activeSchemaId: st.activeSchemaId === id ? (schemas[0]?.id ?? null) : st.activeSchemaId,
            docsStack: [],
            graphType: null,
          }
        }),
      renameSchema: (id, name) =>
        set((st) => ({ schemas: st.schemas.map((x) => (x.id === id ? { ...x, name } : x)) })),
      setActiveSchema: (id) => set({ activeSchemaId: id, docsStack: [], graphType: null }),

      addTab: (partial) => {
        const t = newTab({ query: '', variables: '{}', ...partial })
        set((st) => ({ tabs: [...st.tabs, t], activeTabId: t.id }))
      },
      closeTab: (id) =>
        set((st) => {
          let tabs = st.tabs.filter((t) => t.id !== id)
          if (!tabs.length) tabs = [newTab({ query: '', variables: '{}' })]
          const idx = st.tabs.findIndex((t) => t.id === id)
          const activeTabId =
            st.activeTabId === id ? tabs[Math.min(idx, tabs.length - 1)].id : st.activeTabId
          return { tabs, activeTabId }
        }),
      setActiveTab: (id) => set({ activeTabId: id }),
      updateTab: (id, patch) =>
        set((st) => ({ tabs: st.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      clearTab: (id) =>
        set((st) => ({
          tabs: st.tabs.map((t) => (t.id === id ? { ...t, query: '', variables: '{}', operationName: undefined, response: null } : t)),
        })),

      setSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),
      pushHistory: (h) =>
        set((st) => ({ history: [{ ...h, id: uid() }, ...st.history].slice(0, 100) })),
      clearHistory: () => set({ history: [] }),

      setView: (view) => set({ view }),
      setLeftPanel: (leftPanel) => set({ leftPanel }),
      setLayout: (patch) => set(patch),
      openDocs: (typeName, opts) => {
        const st = get()
        if (typeName === null) return set({ docsStack: [], leftPanel: 'docs' })
        const stack = opts?.reset ? [] : st.docsStack
        if (stack[stack.length - 1] === typeName) return set({ leftPanel: 'docs' })
        set({ docsStack: [...stack, typeName].slice(-30), leftPanel: 'docs' })
      },
      docsBack: () => set((st) => ({ docsStack: st.docsStack.slice(0, -1) })),
      setGraphType: (graphType) => set({ graphType }),
      toast: (text, kind = 'info', action) => {
        const id = uid()
        set((st) => ({ toasts: [...st.toasts, { id, kind, text, action }] }))
        setTimeout(() => get().dismissToast(id), action ? 6000 : 3200)
      },
      dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'graphql-studio',
      version: 2,
      // v2: English becomes the default language (users can switch back in Preferences)
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<State>
        if (version < 2 && p.prefs) p.prefs = { ...p.prefs, lang: 'en' }
        return p as State
      },
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        return { ...current, ...p, settings: { ...current.settings, ...(p.settings ?? {}) }, fill: { ...current.fill, ...(p.fill ?? {}) }, prefs: { ...current.prefs, ...(p.prefs ?? {}) } }
      },
      partialize: (st) => ({
        schemas: st.schemas,
        activeSchemaId: st.activeSchemaId,
        tabs: st.tabs.map((t) => ({ ...t, response: null, loading: false })),
        activeTabId: st.activeTabId,
        settings: st.settings,
        history: st.history,
        view: st.view,
        leftPanel: st.leftPanel,
        leftWidth: st.leftWidth,
        rightWidth: st.rightWidth,
        varsHeight: st.varsHeight,
        fill: st.fill,
        prefs: st.prefs,
      }),
    },
  ),
)

export const useActiveTab = () =>
  useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0])
