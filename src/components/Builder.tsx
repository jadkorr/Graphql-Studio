import { useMemo, useState } from 'react'
import {
  getNamedType,
  isAbstractType,
  isInterfaceType,
  isNonNullType,
  isObjectType,
  isUnionType,
  type DocumentNode,
  type FieldNode,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLNamedType,
  type GraphQLObjectType,
  type GraphQLSchema,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql'
import { BookOpen, Check, ChevronRight, Search, Sparkles, AlertTriangle, Layers, Wand2, Eraser } from 'lucide-react'
import { useActiveTab, useStore } from '../store'
import {
  autoSelection,
  replaceSelectionSet,
  ensureOp,
  findSel,
  operations,
  printDoc,
  renameOperation,
  toggleArgument,
  toggleSelection,
  tryParse,
  type OpKind,
  type Seg,
} from '../lib/builder'
import { kindOf, KIND_META, skeleton } from '../lib/schema'
import { clearTabWithUndo } from '../lib/actions'
import { useT } from '../lib/i18n'

interface Ctx {
  schema: GraphQLSchema
  toggleField: (parentPath: Seg[], field: GraphQLField<unknown, unknown>) => void
  toggleFrag: (parentPath: Seg[], type: GraphQLObjectType) => void
  toggleArg: (fieldPath: Seg[], arg: GraphQLArgument) => void
  fillAt: (path: Seg[], type: GraphQLNamedType) => void
  openDocs: (t: string) => void
}

export default function Builder({ schema }: { schema: GraphQLSchema }) {
  const tab = useActiveTab()
  const updateTab = useStore((s) => s.updateTab)
  const openDocsStore = useStore((s) => s.openDocs)
  const toast = useStore((s) => s.toast)
  const fill = useStore((s) => s.fill)
  const setFill = useStore((s) => s.setFill)
  const t = useT()
  const [opKind, setOpKind] = useState<OpKind>('query')
  const [filter, setFilter] = useState('')
  const [localName, setLocalName] = useState<Record<OpKind, string>>({
    query: 'MyQuery',
    mutation: 'MyMutation',
    subscription: 'MySubscription',
  })

  const { doc, error } = useMemo(() => tryParse(tab.query), [tab.query])
  const op = doc ? operations(doc).find((o) => o.operation === opKind) : undefined
  const opName = op ? (op.name?.value ?? '') : localName[opKind]

  const roots: { kind: OpKind; type: GraphQLObjectType | null | undefined }[] = [
    { kind: 'query', type: schema.getQueryType() },
    { kind: 'mutation', type: schema.getMutationType() },
    { kind: 'subscription', type: schema.getSubscriptionType() },
  ]
  const root = roots.find((r) => r.kind === opKind)?.type

  const getOp = (d: DocumentNode) => operations(d).find((o) => o.operation === opKind)!

  function commit(next: DocumentNode, varsPatch?: { add?: Record<string, unknown>; remove?: string[] }) {
    let variables = tab.variables
    if (varsPatch && (varsPatch.add || varsPatch.remove?.length)) {
      let obj: Record<string, unknown> = {}
      try {
        obj = JSON.parse(tab.variables || '{}') ?? {}
      } catch {
        /* keep empty */
      }
      for (const [k, v] of Object.entries(varsPatch.add ?? {})) if (!(k in obj)) obj[k] = v
      for (const k of varsPatch.remove ?? []) delete obj[k]
      variables = JSON.stringify(obj, null, 2)
    }
    updateTab(tab.id, { query: printDoc(next), variables })
  }

  const DEFAULT_NAMES = ['MyQuery', 'MyMutation', 'MySubscription']
  function withDoc(fn: (d: DocumentNode, o: OperationDefinitionNode) => void, firstField?: string) {
    if (!doc) return toast(t('Corrige el error de sintaxis antes de usar el builder'), 'err')
    // new operation: name it after the first selected field (e.g. createUser → CreateUser)
    const name = !op && firstField && DEFAULT_NAMES.includes(opName) ? firstField[0].toUpperCase() + firstField.slice(1) : opName
    const ensured = ensureOp(doc, opKind, name)
    fn(ensured.doc, ensured.op)
  }

  const ctx: Ctx = {
    schema,
    openDocs: (t) => openDocsStore(t),
    toggleField: (parentPath, field) =>
      withDoc((d, o) => {
        const named = getNamedType(field.type)
        const composite = isObjectType(named) || isInterfaceType(named) || isUnionType(named)
        const seg: Seg = { kind: 'field', name: field.name }
        const wasOn = !!findSel(selAt(o, parentPath), seg)
        let next = toggleSelection(d, o, parentPath, seg, composite ? autoSelection(schema, named, fill) : [])
        const add: Record<string, unknown> = {}
        const remove: string[] = []
        if (!wasOn) {
          // auto-bind required args to variables
          for (const a of field.args.filter((a) => isNonNullType(a.type) && a.defaultValue === undefined)) {
            const r = toggleArgument(next, getOp(next), [...parentPath, seg], a.name, a.type.toString())
            next = r.doc
            if (r.added) add[r.added] = skeleton(a.type)
          }
        } else {
          // drop variables whose definitions disappeared with the field
          const before = new Set((o.variableDefinitions ?? []).map((v) => v.variable.name.value))
          const after = new Set(operations(next).flatMap((x) => (x.variableDefinitions ?? []).map((v) => v.variable.name.value)))
          before.forEach((v) => !after.has(v) && remove.push(v))
        }
        commit(next, { add, remove })
      }, parentPath.length ? undefined : field.name),
    toggleFrag: (parentPath, type) =>
      withDoc((d, o) => commit(toggleSelection(d, o, parentPath, { kind: 'frag', type: type.name }, autoSelection(schema, type, fill)))),
    fillAt: (path, type) =>
      withDoc((d, o) => {
        commit(replaceSelectionSet(d, o, path, autoSelection(schema, type, fill)))
        toast(t('Subárbol completado (profundidad {n})', { n: fill.depth }), 'ok')
      }),
    toggleArg: (fieldPath, arg) =>
      withDoc((d, o) => {
        const r = toggleArgument(d, o, fieldPath, arg.name, arg.type.toString())
        commit(r.doc, { add: r.added ? { [r.added]: skeleton(arg.type) } : undefined, remove: r.removed ? [r.removed] : [] })
      }),
  }

  const rootFields = root ? Object.values(root.getFields()) : []
  const q = filter.trim().toLowerCase()
  const shown = q ? rootFields.filter((f) => f.name.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q)) : rootFields
  const selectedCount = op?.selectionSet.selections.length ?? 0
  const hasContent = !!tab.query.replace(/#.*$/gm, '').trim()

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="seg">
            {roots.map((r) => (
              <button
                key={r.kind}
                data-active={opKind === r.kind}
                disabled={!r.type}
                onClick={() => setOpKind(r.kind)}
                className="disabled:cursor-not-allowed disabled:opacity-30"
              >
                {r.kind === 'query' ? 'Query' : r.kind === 'mutation' ? 'Mutation' : 'Sub'}
                {r.type && (
                  <span className="text-[10px] text-faint">{Object.keys(r.type.getFields()).length}</span>
                )}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button
            className="btn btn-ghost h-7 px-2 text-[11.5px] text-dim hover:!text-err"
            disabled={!hasContent}
            onClick={() => clearTabWithUndo(tab.id)}
            title={t('Desmarcar todo y vaciar el editor (se puede deshacer)')}
          >
            <Eraser size={12} /> {t('Limpiar')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-keyword">{opKind}</span>
          <input
            className="input h-7 flex-1 font-mono text-[12px]"
            value={opName}
            placeholder={t('NombreOperación')}
            onChange={(e) => {
              const v = e.target.value
              if (op && doc) commit(renameOperation(doc, op, v))
              else setLocalName((s) => ({ ...s, [opKind]: v }))
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10.5px] text-faint" title={t('Niveles que se seleccionan automáticamente al marcar un campo')}>
            <Layers size={11} /> Auto
          </span>
          <div className="seg">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                className="!h-5 !px-1.5 font-mono text-[11px]"
                data-active={fill.depth === d}
                onClick={() => setFill({ depth: d })}
                title={d === 1 ? t('Solo campos escalares del tipo') : t('Escalares + {n} nivel(es) de objetos anidados', { n: d - 1 })}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            className="chip !h-6"
            style={fill.typename ? { color: 'var(--color-dyn)', borderColor: 'color-mix(in oklab, var(--color-accent-2) 35%, transparent)', background: 'color-mix(in oklab, var(--color-accent-2) 8%, transparent)' } : undefined}
            onClick={() => setFill({ typename: !fill.typename })}
            title={t('Añadir __typename en cada nivel (como Apollo Client)')}
          >
            __typename
          </button>
        </div>
        <label className="relative block">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            className="input h-7 w-full pl-8 text-[12px]"
            placeholder={t('Filtrar {n} campos…', { n: rootFields.length })}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="m-3 mb-0 flex gap-2 rounded-lg border border-err/35 bg-err/10 p-2 text-[11.5px] text-err">
          <AlertTriangle size={14} className="mt-0.5 flex-none" />
          <span>{t('El documento tiene errores de sintaxis. El builder se sincroniza cuando vuelva a ser válido.')}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2 font-mono text-[12px]">
        {!root && <div className="p-4 text-dim">{t('Este esquema no define {op}.', { op: opKind })}</div>}
        {shown.map((f) => (
          <FieldRow key={f.name} ctx={ctx} field={f} parentPath={[]} set={op?.selectionSet} depth={0} />
        ))}
        {root && !shown.length && <div className="p-4 text-center text-faint">{t('Sin coincidencias')}</div>}
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-accent" />
          {selectedCount ? t('{n} campo(s) raíz seleccionados', { n: selectedCount }) : t('Marca campos para construir la operación')}
        </span>
      </div>
    </div>
  )
}

function selAt(o: OperationDefinitionNode, path: Seg[]): SelectionSetNode | undefined {
  let set: SelectionSetNode | undefined = o.selectionSet
  for (const seg of path) set = findSel(set, seg)?.selectionSet
  return set
}

function TypeTag({ type, onClick }: { type: { toString(): string }; onClick?: () => void }) {
  const named = getNamedType(type as never) as unknown as GraphQLNamedType
  const meta = KIND_META[kindOf(named)]
  return (
    <span
      onClick={(e) => {
        if (!onClick) return
        e.stopPropagation()
        onClick()
      }}
      className="max-w-[45%] flex-none truncate text-[11px]"
      style={{ color: meta.color, opacity: 0.85 }}
    >
      {type.toString()}
    </span>
  )
}

function Checkbox({ on, color }: { on: boolean; color?: string }) {
  return (
    <span className="check" data-on={on} style={!on && color ? { borderColor: `color-mix(in oklab, ${color} 55%, transparent)` } : undefined}>
      {on && <Check size={10} strokeWidth={3.5} />}
    </span>
  )
}

function FieldRow({
  ctx,
  field,
  parentPath,
  set,
  depth,
}: {
  ctx: Ctx
  field: GraphQLField<unknown, unknown>
  parentPath: Seg[]
  set: SelectionSetNode | undefined
  depth: number
}) {
  const seg: Seg = { kind: 'field', name: field.name }
  const node = findSel(set, seg) as FieldNode | undefined
  const on = !!node
  const named = getNamedType(field.type)
  const composite = isObjectType(named) || isInterfaceType(named) || isUnionType(named)
  const expandable = composite || field.args.length > 0
  const path = [...parentPath, seg]
  const deprecated = !!field.deprecationReason
  const t = useT()

  return (
    <div>
      <div
        className="tree-row group"
        style={{ paddingLeft: depth * 14 + 4 }}
        title={[field.description, deprecated && `⚠ Deprecated: ${field.deprecationReason}`].filter(Boolean).join('\n\n')}
        onClick={() => ctx.toggleField(parentPath, field)}
      >
        <ChevronRight
          size={12}
          className="flex-none text-faint transition-transform"
          style={{ transform: on ? 'rotate(90deg)' : undefined, visibility: expandable ? 'visible' : 'hidden' }}
        />
        <Checkbox on={on} />
        <span className={`truncate ${on ? 'text-fg' : 'text-field-muted'} ${deprecated ? 'line-through opacity-50' : ''}`}>
          {field.name}
        </span>
        {field.args.length > 0 && <span className="text-[10px] text-faint">({field.args.length})</span>}
        <span className="flex-1" />
        <TypeTag type={field.type} />
        {on && composite && (
          <button
            className="icon-btn hidden h-5 w-5 flex-none text-accent-2 group-hover:inline-grid"
            title={t('Completar todos los subcampos (según el nivel Auto)')}
            onClick={(e) => {
              e.stopPropagation()
              ctx.fillAt(path, named)
            }}
          >
            <Wand2 size={11} />
          </button>
        )}
        <button
          className="icon-btn hidden h-5 w-5 flex-none group-hover:inline-grid"
          title={t('Ver documentación')}
          onClick={(e) => {
            e.stopPropagation()
            ctx.openDocs(named.name)
          }}
        >
          <BookOpen size={11} />
        </button>
      </div>

      {on && (
        <div className="fade-in relative">
          <div className="absolute top-0 bottom-1 w-px bg-line-2" style={{ left: depth * 14 + 10 }} />
          {field.args.map((a) => (
            <ArgRow key={a.name} ctx={ctx} arg={a} node={node} fieldPath={path} depth={depth + 1} />
          ))}
          {composite && <Children ctx={ctx} type={named} path={path} set={node?.selectionSet} depth={depth + 1} />}
        </div>
      )}
    </div>
  )
}

function Children({
  ctx,
  type,
  path,
  set,
  depth,
}: {
  ctx: Ctx
  type: GraphQLNamedType
  path: Seg[]
  set: SelectionSetNode | undefined
  depth: number
}) {
  const fields = isObjectType(type) || isInterfaceType(type) ? Object.values(type.getFields()) : []
  const possible = isAbstractType(type) ? ctx.schema.getPossibleTypes(type) : []
  const typename = {
    name: '__typename',
    type: { toString: () => 'String!' },
    args: [],
  } as unknown as GraphQLField<unknown, unknown>
  return (
    <>
      {isUnionType(type) && <FieldRow ctx={ctx} field={typename} parentPath={path} set={set} depth={depth} />}
      {fields.map((f) => (
        <FieldRow key={f.name} ctx={ctx} field={f} parentPath={path} set={set} depth={depth} />
      ))}
      {possible.map((p) => (
        <FragRow key={p.name} ctx={ctx} type={p} parentPath={path} set={set} depth={depth} />
      ))}
    </>
  )
}

function FragRow({
  ctx,
  type,
  parentPath,
  set,
  depth,
}: {
  ctx: Ctx
  type: GraphQLObjectType
  parentPath: Seg[]
  set: SelectionSetNode | undefined
  depth: number
}) {
  const seg: Seg = { kind: 'frag', type: type.name }
  const node = findSel(set, seg)
  const on = !!node
  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: depth * 14 + 4 }} onClick={() => ctx.toggleFrag(parentPath, type)}>
        <ChevronRight size={12} className="flex-none text-faint transition-transform" style={{ transform: on ? 'rotate(90deg)' : undefined }} />
        <Checkbox on={on} color="var(--k-union)" />
        <span className="text-faint">… on</span>
        <span style={{ color: 'var(--k-union)' }}>{type.name}</span>
      </div>
      {on && <Children ctx={ctx} type={type} path={[...parentPath, seg]} set={node?.selectionSet} depth={depth + 1} />}
    </div>
  )
}

function ArgRow({
  ctx,
  arg,
  node,
  fieldPath,
  depth,
}: {
  ctx: Ctx
  arg: GraphQLArgument
  node: FieldNode | undefined
  fieldPath: Seg[]
  depth: number
}) {
  const on = !!node?.arguments?.some((a) => a.name.value === arg.name)
  const required = isNonNullType(arg.type)
  return (
    <div
      className="tree-row"
      style={{ paddingLeft: depth * 14 + 22 }}
      title={arg.description ?? undefined}
      onClick={() => ctx.toggleArg(fieldPath, arg)}
    >
      <Checkbox on={on} color="var(--color-arg)" />
      <span className="text-arg">
        {arg.name}
        {required && <span className="text-err">*</span>}
      </span>
      <span className="text-faint">:</span>
      <span className="flex-1" />
      <TypeTag type={arg.type} />
    </div>
  )
}
