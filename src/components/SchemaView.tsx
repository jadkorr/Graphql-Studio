import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GraphQLSchema } from 'graphql'
import { Search, Layers, ArrowLeftRight, Leaf, Brackets } from 'lucide-react'
import { useStore } from '../store'
import { kindOf, KIND_META, rootTypeNames, userTypes, type Kind } from '../lib/schema'
import SchemaGraph, { type GraphOptions } from './SchemaGraph'
import TypeDetail, { KindBadge } from './TypeDetail'
import { useT } from '../lib/i18n'
import { alpha } from '../lib/schema'

const KINDS = Object.keys(KIND_META) as Kind[]

export default function SchemaView({ schema }: { schema: GraphQLSchema }) {
  const graphType = useStore((s) => s.graphType)
  const setGraphType = useStore((s) => s.setGraphType)
  const [q, setQ] = useState('')
  const t = useT()
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(KINDS))
  const [opts, setOpts] = useState<GraphOptions>({ depth: 1, incoming: false, leaves: false, args: false })
  const center = graphType && schema.getType(graphType) ? graphType : (rootTypeNames(schema)[0] ?? userTypes(schema)[0]?.name)

  useEffect(() => {
    if (!graphType && center) setGraphType(center)
  }, [graphType, center, setGraphType])

  const all = useMemo(() => userTypes(schema).sort((a, b) => a.name.localeCompare(b.name)), [schema])
  const counts = useMemo(() => {
    const c = {} as Record<Kind, number>
    for (const t of all) c[kindOf(t)] = (c[kindOf(t)] ?? 0) + 1
    return c
  }, [all])
  const roots = rootTypeNames(schema)
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return all.filter((t) => kinds.has(kindOf(t)) && (!ql || t.name.toLowerCase().includes(ql)))
  }, [all, kinds, q])

  const select = useCallback((n: string) => setGraphType(n), [setGraphType])

  const toggleKind = (k: Kind) =>
    setKinds((s) => {
      // click on a single kind when all are active → solo that kind
      if (s.size === KINDS.length) return new Set([k])
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n.size ? n : new Set(KINDS)
    })

  return (
    <div className="flex h-full min-h-0 gap-2 p-2 pt-0">
      {/* type list */}
      <aside className="glass flex w-[280px] flex-none flex-col overflow-hidden rounded-2xl">
        <div className="space-y-2.5 border-b border-line p-3">
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
            <input className="input h-8 w-full pl-8" placeholder={t('Buscar en {n} tipos…', { n: all.length })} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const on = kinds.has(k)
              const m = KIND_META[k]
              return (
                <button
                  key={k}
                  className="chip"
                  onClick={() => toggleKind(k)}
                  onDoubleClick={() => setKinds(new Set(KINDS))}
                  style={on ? { color: m.color, background: m.bg, borderColor: alpha(m.color, 35) } : { opacity: 0.5 }}
                  title={t('Clic: filtrar · Doble clic: todos')}
                >
                  {m.label} <span className="opacity-60">{counts[k] ?? 0}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {!q &&
            roots.map((r) => (
              <TypeRow key={'root-' + r} name={r} kind="object" active={center === r} onClick={select} root />
            ))}
          {!q && <div className="mx-2 my-1.5 h-px bg-line" />}
          {list.map((t) => (
            <TypeRow key={t.name} name={t.name} kind={kindOf(t)} active={center === t.name} onClick={select} />
          ))}
          {!list.length && <div className="p-6 text-center text-faint">{t('Sin resultados')}</div>}
        </div>
      </aside>

      {/* graph */}
      <section className="glass relative min-w-0 flex-1 overflow-hidden rounded-2xl">
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
          <div className="seg">
            {[1, 2, 3].map((d) => (
              <button key={d} data-active={opts.depth === d} onClick={() => setOpts({ ...opts, depth: d })}>
                <Layers size={12} /> {d}
              </button>
            ))}
          </div>
          <div className="seg">
            <button data-active={opts.incoming} onClick={() => setOpts({ ...opts, incoming: !opts.incoming })} title={t('Mostrar tipos que referencian a este')}>
              <ArrowLeftRight size={12} /> {t('Entrantes')}
            </button>
            <button data-active={opts.args} onClick={() => setOpts({ ...opts, args: !opts.args })} title={t('Incluir tipos input usados en argumentos')}>
              <Brackets size={12} /> Args
            </button>
            <button data-active={opts.leaves} onClick={() => setOpts({ ...opts, leaves: !opts.leaves })} title={t('Incluir enums')}>
              <Leaf size={12} /> Enums
            </button>
          </div>
        </div>
        {center ? <SchemaGraph schema={schema} center={center} onSelect={select} opts={opts} /> : null}
      </section>

      {/* detail */}
      <aside className="glass w-[400px] flex-none overflow-auto rounded-2xl p-4">
        {center && <TypeDetail schema={schema} typeName={center} onNavigate={select} />}
      </aside>
    </div>
  )
}

function TypeRow({ name, kind, active, onClick, root }: { name: string; kind: Kind; active: boolean; onClick: (n: string) => void; root?: boolean }) {
  return (
    <button
      onClick={() => onClick(name)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-[5px] text-left font-mono text-[12px] transition-colors ${active ? 'bg-elev text-fg' : 'text-dim hover:bg-hover hover:text-fg'}`}
      style={active ? { boxShadow: `inset 2px 0 0 ${KIND_META[kind].color}` } : undefined}
    >
      {root ? (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-md text-[10px] font-bold text-on-accent" style={{ background: 'var(--grad)' }}>
          {name[0]}
        </span>
      ) : (
        <KindBadge kind={kind} />
      )}
      <span className="truncate">{name}</span>
    </button>
  )
}
