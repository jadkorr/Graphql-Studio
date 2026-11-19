import { useMemo, useState } from 'react'
import { isInterfaceType, isObjectType, type GraphQLSchema } from 'graphql'
import { ArrowLeft, Search, Home, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { kindOf, KIND_META, rootTypeNames, userTypes } from '../lib/schema'
import TypeDetail, { KindBadge } from './TypeDetail'
import { useT } from '../lib/i18n'

interface Hit { type: string; field?: string; kind: ReturnType<typeof kindOf> }

export function searchSchema(schema: GraphQLSchema, q: string, limit = 60): Hit[] {
  const ql = q.trim().toLowerCase()
  if (!ql) return []
  const types: Hit[] = []
  const fields: Hit[] = []
  for (const t of userTypes(schema)) {
    if (t.name.toLowerCase().includes(ql)) types.push({ type: t.name, kind: kindOf(t) })
    if ((isObjectType(t) || isInterfaceType(t)) && fields.length < limit)
      for (const f of Object.keys(t.getFields())) if (f.toLowerCase().includes(ql)) fields.push({ type: t.name, field: f, kind: kindOf(t) })
  }
  types.sort((a, b) => (a.type.toLowerCase().startsWith(ql) ? -1 : 0) - (b.type.toLowerCase().startsWith(ql) ? -1 : 0) || a.type.length - b.type.length)
  return [...types.slice(0, limit), ...fields.slice(0, limit)]
}

export default function DocsPanel({ schema }: { schema: GraphQLSchema }) {
  const stack = useStore((s) => s.docsStack)
  const openDocs = useStore((s) => s.openDocs)
  const back = useStore((s) => s.docsBack)
  const setView = useStore((s) => s.setView)
  const setGraphType = useStore((s) => s.setGraphType)
  const [q, setQ] = useState('')
  const t = useT()
  const hits = useMemo(() => searchSchema(schema, q), [schema, q])
  const current = stack[stack.length - 1]

  const nav = (n: string) => {
    setQ('')
    openDocs(n)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-1 text-[12px]">
          <button className="icon-btn" disabled={!stack.length} onClick={back} title={t('Atrás')}>
            <ArrowLeft size={14} />
          </button>
          <button className="icon-btn" onClick={() => openDocs(null)} title={t('Inicio')}>
            <Home size={13} />
          </button>
          <div className="flex min-w-0 items-center gap-0.5 overflow-hidden font-mono text-[11.5px] text-faint">
            {stack.slice(-3).map((s, i, arr) => (
              <span key={i} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight size={11} className="flex-none" />
                <span className={`truncate ${i === arr.length - 1 ? 'text-fg' : ''}`}>{s}</span>
              </span>
            ))}
          </div>
        </div>
        <label className="relative block">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input className="input h-7 w-full pl-8 text-[12px]" placeholder={t('Buscar tipos y campos…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {q ? (
          <div className="grid gap-0.5">
            {hits.map((h, i) => (
              <button key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12px] hover:bg-hover" onClick={() => nav(h.type)}>
                <KindBadge kind={h.kind} />
                <span style={{ color: KIND_META[h.kind].color }}>{h.type}</span>
                {h.field && (
                  <>
                    <span className="-mx-1.5 text-faint">.</span>
                    <span className="text-field">{h.field}</span>
                  </>
                )}
              </button>
            ))}
            {!hits.length && <div className="p-4 text-center text-faint">{t('Sin resultados')}</div>}
          </div>
        ) : current ? (
          <TypeDetail
            schema={schema}
            typeName={current}
            onNavigate={nav}
            onShowGraph={(n) => {
              setGraphType(n)
              setView('schema')
            }}
          />
        ) : (
          <DocsHome schema={schema} onNavigate={nav} />
        )}
      </div>
    </div>
  )
}

function DocsHome({ schema, onNavigate }: { schema: GraphQLSchema; onNavigate: (n: string) => void }) {
  const roots = rootTypeNames(schema)
  const t = useT()
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const t of userTypes(schema)) c[kindOf(t)] = (c[kindOf(t)] ?? 0) + 1
    return c
  }, [schema])
  return (
    <div className="fade-in space-y-4">
      <div>
        <div className="mb-2 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">{t('Tipos raíz')}</div>
        <div className="grid gap-2">
          {roots.map((r) => {
            const rt = schema.getType(r)
            const n = rt && isObjectType(rt) ? Object.keys(rt.getFields()).length : 0
            return (
              <button
                key={r}
                onClick={() => onNavigate(r)}
                className="group flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-left transition-all hover:border-accent-2/50 hover:bg-elev"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg font-mono text-[13px] font-bold text-on-accent" style={{ background: 'var(--grad)' }}>
                  {r[0]}
                </span>
                <span className="flex-1">
                  <span className="block font-mono text-[13px] font-semibold">{r}</span>
                  <span className="text-[11.5px] text-faint">{t('{n} campos', { n })}</span>
                </span>
                <ChevronRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5" />
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">{t('Resumen')}</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => (
            <div key={k} className="rounded-lg border border-line bg-panel-2 px-2.5 py-2">
              <div className="font-mono text-[16px] font-semibold" style={{ color: KIND_META[k].color }}>
                {counts[k] ?? 0}
              </div>
              <div className="text-[11px] text-faint">{KIND_META[k].label}s</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
