import { useMemo, useState } from 'react'
import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLInputField,
  type GraphQLSchema,
} from 'graphql'
import { ChevronDown, Network, Search, AlertTriangle, CornerDownRight, Play } from 'lucide-react'
import { rootKindOf, tryRootField } from '../lib/actions'
import { alpha, getReverseRefs, kindOf, KIND_META, type Kind } from '../lib/schema'
import { useT } from '../lib/i18n'

export function KindBadge({ kind, size = 'sm' }: { kind: Kind; size?: 'sm' | 'md' }) {
  const m = KIND_META[kind]
  return (
    <span
      className={`inline-grid flex-none place-items-center rounded-md font-mono font-bold ${size === 'md' ? 'h-7 min-w-7 px-1.5 text-[12px]' : 'h-[18px] min-w-[18px] px-1 text-[10px]'}`}
      style={{ color: m.color, background: m.bg, boxShadow: `inset 0 0 0 1px ${alpha(m.color, 20)}` }}
      title={m.label}
    >
      {m.short}
    </span>
  )
}

export function TypeLink({
  schema,
  type,
  onNavigate,
}: {
  schema: GraphQLSchema
  type: { toString(): string }
  onNavigate: (name: string) => void
}) {
  const str = type.toString()
  const name = str.replace(/[[\]!]/g, '')
  const t = schema.getType(name)
  const color = t ? KIND_META[kindOf(t)].color : 'var(--color-dim)'
  const [pre, post] = str.split(name)
  return (
    <span className="font-mono text-[12px]">
      <span className="text-faint">{pre}</span>
      <button className="hover:underline" style={{ color }} onClick={() => onNavigate(name)}>
        {name}
      </button>
      <span className="text-faint">{post}</span>
    </span>
  )
}

function Markdownish({ text }: { text?: string | null }) {
  if (!text?.trim()) return null
  return <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-dim">{text.trim()}</p>
}

function Deprecated({ reason }: { reason?: string | null }) {
  if (!reason) return null
  return (
    <div className="mt-1 flex items-start gap-1.5 text-[11px] text-warn">
      <AlertTriangle size={12} className="mt-0.5 flex-none" />
      <span>Deprecated: {reason}</span>
    </div>
  )
}

function ArgList({ schema, args, onNavigate }: { schema: GraphQLSchema; args: readonly GraphQLArgument[]; onNavigate: (n: string) => void }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-input p-2.5">
      {args.map((a) => (
        <div key={a.name}>
          <div className="flex flex-wrap items-baseline gap-1 font-mono text-[12px]">
            <span className="text-arg">{a.name}</span>
            <span className="text-faint">:</span>
            <TypeLink schema={schema} type={a.type} onNavigate={onNavigate} />
            {a.defaultValue !== undefined && (
              <span className="text-faint">= {JSON.stringify(a.defaultValue)}</span>
            )}
          </div>
          {a.description && <div className="pl-2 text-[11.5px] text-faint">{a.description}</div>}
          <Deprecated reason={a.deprecationReason} />
        </div>
      ))}
    </div>
  )
}

function FieldItem({
  schema,
  field,
  onNavigate,
  onTry,
}: {
  schema: GraphQLSchema
  field: GraphQLField<unknown, unknown> | GraphQLInputField
  onNavigate: (n: string) => void
  onTry?: () => void
}) {
  const args = 'args' in field ? field.args : []
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <div className={`group relative rounded-lg px-2.5 py-2 transition-colors hover:bg-hover ${field.deprecationReason ? 'opacity-60' : ''}`}>
      {onTry && (
        <button
          className="btn btn-primary absolute top-1.5 right-1.5 hidden h-6 px-2 text-[11px] group-hover:inline-flex"
          onClick={onTry}
          title={t('Generar la operación y abrirla en el Workspace')}
        >
          <Play size={10} className="fill-current" /> {t('Probar')}
        </button>
      )}
      <div className="flex flex-wrap items-baseline gap-x-1 font-mono text-[12.5px]">
        <span className="text-field">{field.name}</span>
        {args.length > 0 && (
          <button className="inline-flex items-center text-faint hover:text-fg" onClick={() => setOpen(!open)}>
            (<span className="text-[11px]">{args.length} arg{args.length > 1 ? 's' : ''}</span>
            <ChevronDown size={11} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} />)
          </button>
        )}
        <span className="text-faint">:</span>
        <TypeLink schema={schema} type={field.type} onNavigate={onNavigate} />
        {'defaultValue' in field && field.defaultValue !== undefined && (
          <span className="text-faint">= {JSON.stringify(field.defaultValue)}</span>
        )}
      </div>
      {field.description && <div className="mt-0.5 text-[11.5px] leading-snug whitespace-pre-line text-faint">{field.description.trim()}</div>}
      <Deprecated reason={field.deprecationReason} />
      {open && args.length > 0 && <ArgList schema={schema} args={args} onNavigate={onNavigate} />}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center gap-2 px-1 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">
        {title}
        {count !== undefined && <span className="rounded-full bg-elev px-1.5 py-px text-[10px] tracking-normal text-dim">{count}</span>}
        <span className="h-px flex-1 bg-line" />
      </div>
      {children}
    </div>
  )
}

export default function TypeDetail({
  schema,
  typeName,
  onNavigate,
  onShowGraph,
}: {
  schema: GraphQLSchema
  typeName: string
  onNavigate: (name: string) => void
  onShowGraph?: (name: string) => void
}) {
  const type = schema.getType(typeName)
  const [q, setQ] = useState('')
  const [refLimit, setRefLimit] = useState(25)
  const refs = useMemo(() => getReverseRefs(schema).get(typeName) ?? [], [schema, typeName])
  const t = useT()

  if (!type) return <div className="p-6 text-dim">{t('Tipo «{name}» no encontrado en el esquema.', { name: typeName })}</div>
  const kind = kindOf(type)
  const isRoot = !!rootKindOf(schema, type.name)
  const fields =
    isObjectType(type) || isInterfaceType(type) || isInputObjectType(type) ? Object.values(type.getFields()) : []
  const ql = q.trim().toLowerCase()
  const filtered = ql ? fields.filter((f) => f.name.toLowerCase().includes(ql)) : fields
  const values = isEnumType(type) ? type.getValues().filter((v) => !ql || v.name.toLowerCase().includes(ql)) : []

  return (
    <div className="fade-in" key={typeName}>
      <div className="flex items-start gap-3">
        <KindBadge kind={kind} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: KIND_META[kind].color }}>
            {KIND_META[kind].label}
          </div>
          <h2 className="truncate font-mono text-[17px] font-semibold text-fg">{type.name}</h2>
        </div>
        {onShowGraph && kind !== 'scalar' && (
          <button className="btn h-7 px-2 text-[11.5px]" onClick={() => onShowGraph(type.name)} title={t('Ver en el grafo')}>
            <Network size={13} /> {t('Grafo')}
          </button>
        )}
      </div>
      <div className="mt-2">
        <Markdownish text={type.description} />
      </div>
      {isRoot && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent-2/20 bg-accent-2/8 px-3 py-2 text-[11.5px] text-dim">
          <Play size={12} className="flex-none text-accent-2" />
          {t('Pasa el cursor sobre un campo y pulsa «Probar» para generar la operación.')}
        </div>
      )}

      {(isObjectType(type) || isInterfaceType(type)) && type.getInterfaces().length > 0 && (
        <Section title={t('Implementa')}>
          <div className="flex flex-wrap gap-1.5 px-1">
            {type.getInterfaces().map((i) => (
              <TypeChip key={i.name} name={i.name} kind="interface" onClick={onNavigate} />
            ))}
          </div>
        </Section>
      )}

      {(isUnionType(type) || isInterfaceType(type)) && (
        <Section title={isUnionType(type) ? t('Miembros') : t('Implementado por')} count={schema.getPossibleTypes(type).length}>
          <div className="flex flex-wrap gap-1.5 px-1">
            {schema.getPossibleTypes(type).map((p) => (
              <TypeChip key={p.name} name={p.name} kind="object" onClick={onNavigate} />
            ))}
          </div>
        </Section>
      )}

      {(fields.length > 8 || values.length > 8 || (isEnumType(type) && type.getValues().length > 8)) && (
        <label className="relative mt-4 block">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input className="input h-7 w-full pl-8 text-[12px]" placeholder={t('Buscar en este tipo…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}

      {fields.length > 0 && (
        <Section title={isInputObjectType(type) ? t('Campos de entrada') : t('Campos')} count={fields.length}>
          <div className="-mx-1">
            {filtered.map((f) => (
              <FieldItem
                key={f.name}
                schema={schema}
                field={f}
                onNavigate={onNavigate}
                onTry={isRoot ? () => tryRootField(schema, type.name, f.name) : undefined}
              />
            ))}
          </div>
        </Section>
      )}

      {isEnumType(type) && (
        <Section title={t('Valores')} count={type.getValues().length}>
          <div className="grid gap-0.5">
            {values.map((v) => (
              <div key={v.name} className={`rounded-md px-2.5 py-1 hover:bg-hover ${v.deprecationReason ? 'opacity-50' : ''}`}>
                <span className="font-mono text-[12px]" style={{ color: 'var(--k-enum)' }}>
                  {v.name}
                </span>
                {v.description && <div className="text-[11.5px] text-faint">{v.description}</div>}
                <Deprecated reason={v.deprecationReason} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {refs.length > 0 && (
        <Section title={t('Usado por')} count={refs.length}>
          <div className="grid gap-0.5">
            {refs.slice(0, refLimit).map((r, i) => (
              <button
                key={i}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-left font-mono text-[11.5px] hover:bg-hover"
                onClick={() => onNavigate(r.from)}
              >
                <CornerDownRight size={11} className="flex-none text-faint" />
                <span style={{ color: schema.getType(r.from) ? KIND_META[kindOf(schema.getType(r.from)!)].color : undefined }}>{r.from}</span>
                <span className="text-faint">.</span>
                <span className="truncate text-dim">
                  {r.field}
                  {r.viaArg && <span className="text-faint">({r.viaArg})</span>}
                </span>
              </button>
            ))}
            {refs.length > refLimit && (
              <button className="px-2.5 py-1 text-left text-[11.5px] text-accent-2 hover:underline" onClick={() => setRefLimit(refLimit + 50)}>
                {t('Mostrar {n} más…', { n: Math.min(50, refs.length - refLimit) })}
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}

export function TypeChip({ name, kind, onClick }: { name: string; kind: Kind; onClick: (n: string) => void }) {
  const m = KIND_META[kind]
  return (
    <button
      onClick={() => onClick(name)}
      className="rounded-md px-2 py-0.5 font-mono text-[11.5px] transition-all hover:brightness-125"
      style={{ color: m.color, background: m.bg, boxShadow: `inset 0 0 0 1px ${alpha(m.color, 20)}` }}
    >
      {name}
    </button>
  )
}

export const namedTypeName = (t: Parameters<typeof getNamedType>[0]) => getNamedType(t)?.name
