import { useMemo, useRef, useState } from 'react'
import { parse, print, type GraphQLSchema } from 'graphql'
import { Wand2, Terminal, Plus, X, Boxes, BookOpen, History, Braces, KeyRound, Upload, Globe, Copy, Eraser } from 'lucide-react'
import { useActiveTab, useStore, type LeftPanel } from '../store'
import { toCurl } from '../lib/request'
import { buildPayload, operationNames, runTab } from '../lib/useRun'
import { importFromEndpoint } from '../lib/importer'
import { clearTabWithUndo } from '../lib/actions'
import { tr, useT } from '../lib/i18n'
import CodeEditor from './CodeEditor'
import Builder from './Builder'
import DocsPanel from './DocsPanel'
import HistoryPanel from './HistoryPanel'
import HeadersEditor from './HeadersEditor'
import ResponsePanel from './ResponsePanel'

function useDrag(onMove: (dx: number, dy: number) => void) {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, y: 0 })
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    start.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
    const move = (ev: MouseEvent) => {
      onMove(ev.clientX - start.current.x, ev.clientY - start.current.y)
      start.current = { x: ev.clientX, y: ev.clientY }
    }
    const up = () => {
      setDragging(false)
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return { onMouseDown, 'data-dragging': dragging }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export default function Workspace({ schema }: { schema: GraphQLSchema | null }) {
  const leftPanel = useStore((s) => s.leftPanel)
  const setLeftPanel = useStore((s) => s.setLeftPanel)
  const leftWidth = useStore((s) => s.leftWidth)
  const rightWidth = useStore((s) => s.rightWidth)
  const varsHeight = useStore((s) => s.varsHeight)
  const setLayout = useStore((s) => s.setLayout)
  const tab = useActiveTab()
  const t = useT()

  const leftDrag = useDrag((dx) => setLayout({ leftWidth: clamp(useStore.getState().leftWidth + dx, 260, 640) }))
  const rightDrag = useDrag((dx) => setLayout({ rightWidth: clamp(useStore.getState().rightWidth - dx, 320, 1000) }))
  const varsDrag = useDrag((_, dy) => setLayout({ varsHeight: clamp(useStore.getState().varsHeight - dy, 90, 600) }))

  const panels: { id: LeftPanel; label: string; icon: typeof Boxes }[] = [
    { id: 'builder', label: 'Builder', icon: Boxes },
    { id: 'docs', label: 'Docs', icon: BookOpen },
    { id: 'history', label: t('Historial'), icon: History },
  ]

  return (
    <div className="flex h-full min-h-0 p-2 pt-0">
      {/* left */}
      <aside className="glass flex flex-none flex-col overflow-hidden rounded-2xl" style={{ width: leftWidth }}>
        <div className="flex h-11 flex-none items-center border-b border-line px-2">
          <div className="seg w-full">
            {panels.map((p) => (
              <button key={p.id} className="flex-1 justify-center" data-active={leftPanel === p.id} onClick={() => setLeftPanel(p.id)}>
                <p.icon size={13} /> {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {leftPanel === 'history' ? (
            <HistoryPanel />
          ) : !schema ? (
            <NoSchema />
          ) : leftPanel === 'builder' ? (
            <Builder schema={schema} />
          ) : (
            <DocsPanel schema={schema} />
          )}
        </div>
      </aside>
      <div className="resizer" {...leftDrag} />

      {/* center */}
      <section className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <TabBar />
        <EditorToolbar schema={schema} />
        <div className="min-h-0 flex-1">
          <CodeEditor
            key={tab.id}
            language="graphql"
            value={tab.query}
            schema={schema}
            onChange={(q) => useStore.getState().updateTab(tab.id, { query: q })}
            onRun={() => runTab(tab.id)}
            onPrettify={() => prettify(tab.id)}
            onShowInDocs={(ty) => ty && useStore.getState().openDocs(ty)}
            placeholder="query { … }"
          />
        </div>
        <div className="resizer-y" {...varsDrag} />
        <BottomPane height={varsHeight} />
      </section>
      <div className="resizer" {...rightDrag} />

      {/* right */}
      <section className="glass flex-none overflow-hidden rounded-2xl" style={{ width: rightWidth }}>
        <ResponsePanel tab={tab} />
      </section>
    </div>
  )
}

function prettify(tabId: string) {
  const st = useStore.getState()
  const tab = st.tabs.find((t) => t.id === tabId)!
  try {
    const query = print(parse(tab.query))
    let variables = tab.variables
    try {
      variables = JSON.stringify(JSON.parse(tab.variables || '{}'), null, 2)
    } catch {
      /* leave */
    }
    st.updateTab(tabId, { query, variables })
  } catch (e) {
    st.toast(tr('No se puede formatear: {msg}', { msg: (e as Error).message }), 'err')
  }
}

const tabTitle = (q: string) => {
  const m = q.match(/\b(query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/)
  if (m) return m[2]
  const f = q.replace(/#.*$/gm, '').match(/{\s*([_A-Za-z]\w*)/)
  return f ? f[1] : tr('Nueva operación')
}

function TabBar() {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.activeTabId)
  const setActive = useStore((s) => s.setActiveTab)
  const close = useStore((s) => s.closeTab)
  const add = useStore((s) => s.addTab)
  useT()
  return (
    <div className="flex h-11 flex-none items-end gap-1 overflow-x-auto border-b border-line px-2">
      {tabs.map((tb) => {
        const on = tb.id === active
        return (
          <div
            key={tb.id}
            onClick={() => setActive(tb.id)}
            onAuxClick={(e) => e.button === 1 && close(tb.id)}
            className={`group relative flex h-9 max-w-[200px] min-w-[110px] cursor-pointer items-center gap-2 rounded-t-lg px-3 text-[12px] transition-colors ${on ? 'bg-panel-2 text-fg' : 'text-faint hover:bg-hover hover:text-dim'}`}
          >
            {on && <span className="absolute inset-x-2 top-0 h-[2px] rounded-full" style={{ background: 'var(--grad)' }} />}
            {tb.loading ? (
              <span className="h-2 w-2 flex-none rounded-full border border-accent border-t-transparent spin" />
            ) : (
              <span
                className="h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: !tb.response ? 'var(--color-line-2)' : tb.response.error || tb.response.status >= 400 ? 'var(--color-err)' : 'var(--color-ok)' }}
              />
            )}
            <span className="flex-1 truncate font-mono">{tabTitle(tb.query)}</span>
            <button
              className="grid h-4 w-4 place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-hover"
              onClick={(e) => {
                e.stopPropagation()
                close(tb.id)
              }}
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
      <button className="icon-btn mb-1" onClick={() => add()} title={tr('Nueva pestaña')}>
        <Plus size={15} />
      </button>
    </div>
  )
}

function EditorToolbar({ schema }: { schema: GraphQLSchema | null }) {
  const tab = useActiveTab()
  const updateTab = useStore((s) => s.updateTab)
  const toast = useStore((s) => s.toast)
  const names = useMemo(() => operationNames(tab.query), [tab.query])
  const t = useT()
  const empty = !tab.query.replace(/#.*$/gm, '').trim() && (tab.variables.trim() === '{}' || !tab.variables.trim())
  return (
    <div className="flex h-10 flex-none items-center gap-1 border-b border-line/60 px-2">
      <button className="btn btn-ghost h-7 text-[12px] text-dim" onClick={() => prettify(tab.id)} title={t('Formatear') + ' (⇧⌘P)'}>
        <Wand2 size={13} /> {t('Formatear')}
      </button>
      <button
        className="btn btn-ghost h-7 text-[12px] text-dim"
        title={t('Copiar como cURL')}
        onClick={() => {
          const p = buildPayload(tab.id)
          if (typeof p === 'string') return toast(p, 'err')
          navigator.clipboard.writeText(toCurl(useStore.getState().settings, p))
          toast(t('cURL copiado al portapapeles'), 'ok')
        }}
      >
        <Terminal size={13} /> cURL
      </button>
      <button
        className="btn btn-ghost h-7 text-[12px] text-dim"
        title={t('Copiar operación')}
        onClick={() => {
          navigator.clipboard.writeText(tab.query)
          toast(t('Operación copiada'), 'ok')
        }}
      >
        <Copy size={13} />
      </button>
      <button
        className="btn btn-ghost h-7 text-[12px] text-dim hover:!text-err"
        title={t('Vaciar el editor, las variables y la respuesta de esta pestaña (se puede deshacer)')}
        disabled={empty}
        onClick={() => clearTabWithUndo(tab.id)}
      >
        <Eraser size={13} /> {t('Limpiar')}
      </button>
      <span className="flex-1" />
      {names.length > 1 && (
        <label className="flex items-center gap-2 text-[11.5px] text-faint">
          {t('Ejecutar')}
          <select
            className="input h-7 cursor-pointer font-mono text-[12px]"
            value={tab.operationName && names.includes(tab.operationName) ? tab.operationName : names.find(Boolean)}
            onChange={(e) => updateTab(tab.id, { operationName: e.target.value })}
          >
            {names.filter(Boolean).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {!schema && <span className="text-[11px] text-faint">{t('Sin esquema: no hay autocompletado')}</span>}
      <span className="hidden items-center gap-1 pl-2 text-[11px] text-faint xl:flex">
        <span className="kbd">Ctrl</span>
        <span className="kbd">Space</span> {t('autocompletar')}
      </span>
    </div>
  )
}

function BottomPane({ height }: { height: number }) {
  const [pane, setPane] = useState<'vars' | 'headers'>('vars')
  const tab = useActiveTab()
  const headersOn = useStore((s) => s.settings.headers.filter((h) => h.enabled && h.key).length)
  const t = useT()
  const varsValid = useMemo(() => {
    try {
      JSON.parse(tab.variables || '{}')
      return true
    } catch {
      return false
    }
  }, [tab.variables])
  return (
    <div className="flex flex-none flex-col border-t border-line" style={{ height }}>
      <div className="flex h-9 flex-none items-center gap-2 px-2">
        <div className="seg">
          <button data-active={pane === 'vars'} onClick={() => setPane('vars')}>
            <Braces size={12} /> {t('Variables')}
            {!varsValid && <span className="h-1.5 w-1.5 rounded-full bg-err" />}
          </button>
          <button data-active={pane === 'headers'} onClick={() => setPane('headers')}>
            <KeyRound size={12} /> Headers
            <span className="text-[10px] text-faint">{headersOn}</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {pane === 'vars' ? (
          <CodeEditor
            key={tab.id + '-vars'}
            language="json"
            value={tab.variables}
            onChange={(v) => useStore.getState().updateTab(tab.id, { variables: v })}
            onRun={() => runTab(tab.id)}
            placeholder='{ "id": "…" }'
          />
        ) : (
          <HeadersEditor />
        )}
      </div>
    </div>
  )
}

function NoSchema() {
  const t = useT()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line-2 bg-panel-2">
        <Upload size={20} className="text-accent-2" />
      </div>
      <div className="font-semibold">{t('Carga un esquema')}</div>
      <div className="text-[12px] leading-relaxed text-faint">
        {t('Arrastra archivos .graphql a la ventana, o selecciónalos desde el menú de esquemas.')}
      </div>
      <button className="btn mt-1" onClick={() => importFromEndpoint()}>
        <Globe size={13} /> {t('Introspección del endpoint')}
      </button>
    </div>
  )
}
