/* AST helpers that let the visual Builder edit the query document in place. */
import {
  Kind,
  getNamedType,
  isAbstractType,
  isEnumType,
  isInterfaceType,
  isNonNullType,
  isObjectType,
  isScalarType,
  type GraphQLNamedType,
  type GraphQLSchema,
  parse,
  parseType,
  print,
  visit,
  type DocumentNode,
  type FieldNode,
  type InlineFragmentNode,
  type OperationDefinitionNode,
  type SelectionNode,
  type SelectionSetNode,
} from 'graphql'

export type OpKind = 'query' | 'mutation' | 'subscription'
export type Seg = { kind: 'field'; name: string } | { kind: 'frag'; type: string }

// AST nodes are readonly in graphql's typings; we build fresh plain objects.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any

export function tryParse(text: string): { doc: DocumentNode | null; error: string | null } {
  if (!text.trim() || !stripComments(text).trim()) return { doc: { kind: Kind.DOCUMENT, definitions: [] }, error: null }
  try {
    return { doc: parse(text, { noLocation: true }), error: null }
  } catch (e) {
    return { doc: null, error: (e as Error).message }
  }
}

const stripComments = (s: string) => s.replace(/#.*$/gm, '')

export function operations(doc: DocumentNode): OperationDefinitionNode[] {
  return doc.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION)
}

const name = (value: string) => ({ kind: Kind.NAME, value })

const matches = (sel: SelectionNode, seg: Seg) =>
  seg.kind === 'field'
    ? sel.kind === Kind.FIELD && sel.name.value === seg.name && !sel.alias
    : sel.kind === Kind.INLINE_FRAGMENT && sel.typeCondition?.name.value === seg.type

export function findSel(set: SelectionSetNode | undefined, seg: Seg): FieldNode | InlineFragmentNode | undefined {
  return set?.selections.find((s) => matches(s, seg)) as Any
}

export function selectionAt(op: OperationDefinitionNode | undefined, path: Seg[]): SelectionSetNode | undefined {
  let set: SelectionSetNode | undefined = op?.selectionSet
  for (const seg of path) {
    const n = findSel(set, seg)
    if (!n) return undefined
    set = n.selectionSet
  }
  return set
}

export function fieldAt(op: OperationDefinitionNode | undefined, path: Seg[]): FieldNode | undefined {
  if (!path.length) return undefined
  const parent = selectionAt(op, path.slice(0, -1))
  const n = findSel(parent, path[path.length - 1])
  return n?.kind === Kind.FIELD ? n : undefined
}

function makeNode(seg: Seg, selectionSet?: SelectionSetNode): SelectionNode {
  if (seg.kind === 'field')
    return { kind: Kind.FIELD, name: name(seg.name), arguments: [], directives: [], selectionSet } as Any
  return {
    kind: Kind.INLINE_FRAGMENT,
    typeCondition: { kind: Kind.NAMED_TYPE, name: name(seg.type) },
    directives: [],
    selectionSet: selectionSet ?? { kind: Kind.SELECTION_SET, selections: [] },
  } as Any
}

function updateAt(
  set: SelectionSetNode | undefined,
  path: Seg[],
  fn: (sels: readonly SelectionNode[]) => SelectionNode[],
): SelectionSetNode {
  const sels = set?.selections ?? []
  if (!path.length) return { kind: Kind.SELECTION_SET, selections: fn(sels) }
  const [head, ...rest] = path
  const idx = sels.findIndex((s) => matches(s, head))
  if (idx < 0) return { kind: Kind.SELECTION_SET, selections: [...sels, makeNode(head, updateAt(undefined, rest, fn))] }
  const node = sels[idx] as Any
  const next = [...sels]
  next[idx] = { ...node, selectionSet: updateAt(node.selectionSet, rest, fn) }
  return { kind: Kind.SELECTION_SET, selections: next }
}

/** Remove composite selections that ended up with an empty selection set. */
function prune(set: SelectionSetNode | undefined): SelectionSetNode | undefined {
  if (!set) return set
  const selections = set.selections
    .map((s: Any) => (s.selectionSet ? { ...s, selectionSet: prune(s.selectionSet) } : s))
    .filter((s: Any) => !(s.selectionSet && s.selectionSet.selections.length === 0))
  return { ...set, selections }
}

function usedVariables(op: OperationDefinitionNode): Set<string> {
  const used = new Set<string>()
  visit(op.selectionSet, { Variable: (v) => void used.add(v.name.value) })
  return used
}

function replaceOp(doc: DocumentNode, op: OperationDefinitionNode, next: OperationDefinitionNode | null): DocumentNode {
  const defs = doc.definitions.flatMap((d) => (d === op ? (next ? [next] : []) : [d]))
  return { ...doc, definitions: defs }
}

export function ensureOp(doc: DocumentNode, kind: OpKind, opName: string): { doc: DocumentNode; op: OperationDefinitionNode } {
  const existing = operations(doc).find((o) => o.operation === kind)
  if (existing) return { doc, op: existing }
  const op = {
    kind: Kind.OPERATION_DEFINITION,
    operation: kind,
    name: opName ? name(opName) : undefined,
    variableDefinitions: [],
    directives: [],
    selectionSet: { kind: Kind.SELECTION_SET, selections: [] },
  } as Any as OperationDefinitionNode
  return { doc: { ...doc, definitions: [...doc.definitions, op] }, op }
}

function finalize(doc: DocumentNode, op: OperationDefinitionNode, selectionSet: SelectionSetNode): DocumentNode {
  const pruned = prune(selectionSet)!
  if (!pruned.selections.length) return replaceOp(doc, op, null)
  let next = { ...op, selectionSet: pruned } as OperationDefinitionNode
  // drop variable definitions that are no longer referenced
  const used = usedVariables(next)
  next = { ...next, variableDefinitions: (next.variableDefinitions ?? []).filter((v) => used.has(v.variable.name.value)) }
  return replaceOp(doc, op, next)
}

/** Toggle a selection (field or inline fragment) living under `parentPath`. */
export function toggleSelection(
  doc: DocumentNode,
  op: OperationDefinitionNode,
  parentPath: Seg[],
  seg: Seg,
  defaultChildren: string[] | SelectionSetNode = [],
): DocumentNode {
  const set = updateAt(op.selectionSet, parentPath, (sels) => {
    if (sels.some((s) => matches(s, seg))) return sels.filter((s) => !matches(s, seg))
    const child = !Array.isArray(defaultChildren)
      ? defaultChildren
      : defaultChildren.length
        ? { kind: Kind.SELECTION_SET, selections: defaultChildren.map((c) => makeNode({ kind: 'field', name: c })) }
        : undefined
    return [...sels, makeNode(seg, child as Any)]
  })
  return finalize(doc, op, set)
}

/** Toggle an argument bound to a variable `$varName` on the field at `fieldPath`. */
export function toggleArgument(
  doc: DocumentNode,
  op: OperationDefinitionNode,
  fieldPath: Seg[],
  argName: string,
  argType: string,
): { doc: DocumentNode; added: string | null; removed: string | null } {
  const field = fieldAt(op, fieldPath)
  const existing = field?.arguments?.find((a) => a.name.value === argName)
  const parentPath = fieldPath.slice(0, -1)
  const fieldSeg = fieldPath[fieldPath.length - 1]

  if (existing) {
    const varName = existing.value.kind === Kind.VARIABLE ? existing.value.name.value : null
    const set = updateAt(op.selectionSet, parentPath, (sels) =>
      sels.map((s: Any) =>
        matches(s, fieldSeg) ? { ...s, arguments: s.arguments.filter((a: Any) => a.name.value !== argName) } : s,
      ),
    )
    const next = finalize(doc, op, set)
    const stillUsed = varName && operations(next).some((o) => usedVariables(o).has(varName))
    return { doc: next, added: null, removed: stillUsed ? null : varName }
  }

  // choose a variable name that doesn't collide with a different definition
  const defs = op.variableDefinitions ?? []
  let varName = argName
  const clash = (n: string) => defs.some((d) => d.variable.name.value === n && print(d.type) !== argType)
  if (clash(varName) || defs.some((d) => d.variable.name.value === varName)) {
    const fname = fieldSeg.kind === 'field' ? fieldSeg.name : 'arg'
    varName = `${fname}${argName[0].toUpperCase()}${argName.slice(1)}`
    let i = 2
    while (defs.some((d) => d.variable.name.value === varName)) varName = `${fname}${argName}${i++}`
  }
  const variable = { kind: Kind.VARIABLE, name: name(varName) }
  const set = updateAt(op.selectionSet, parentPath, (sels) => {
    const has = sels.some((s) => matches(s, fieldSeg))
    const list = has ? sels : [...sels, makeNode(fieldSeg)]
    return list.map((s: Any) =>
      matches(s, fieldSeg)
        ? { ...s, arguments: [...(s.arguments ?? []), { kind: Kind.ARGUMENT, name: name(argName), value: variable }] }
        : s,
    )
  })
  const withVar = {
    ...op,
    variableDefinitions: [
      ...defs,
      { kind: Kind.VARIABLE_DEFINITION, variable, type: parseType(argType, { noLocation: true }), directives: [] },
    ],
  } as Any as OperationDefinitionNode
  const docWithVar = replaceOp(doc, op, withVar)
  return { doc: finalize(docWithVar, withVar, set), added: varName, removed: null }
}

export function renameOperation(doc: DocumentNode, op: OperationDefinitionNode, newName: string): DocumentNode {
  const clean = newName.replace(/[^_A-Za-z0-9]/g, '').replace(/^[0-9]+/, '')
  return replaceOp(doc, op, { ...op, name: clean ? name(clean) : undefined } as Any)
}

export function printDoc(doc: DocumentNode): string {
  return doc.definitions.length ? print(doc) : ''
}

/** Build a ready-to-run operation for a single root field (required args bound to variables). */
export function operationForField(
  kind: OpKind,
  field: { name: string; args: readonly { name: string; type: { toString(): string }; defaultValue?: unknown }[] },
  defaultChildren: string[] | SelectionSetNode,
  isRequired: (t: unknown) => boolean,
): { query: string; vars: string[] } {
  const opName = field.name[0].toUpperCase() + field.name.slice(1)
  let { doc, op } = ensureOp({ kind: Kind.DOCUMENT, definitions: [] }, kind, opName)
  doc = toggleSelection(doc, op, [], { kind: 'field', name: field.name }, defaultChildren)
  const vars: string[] = []
  for (const a of field.args) {
    if (!isRequired(a.type) || a.defaultValue !== undefined) continue
    op = operations(doc)[0]
    const r = toggleArgument(doc, op, [{ kind: 'field', name: field.name }], a.name, a.type.toString())
    doc = r.doc
    if (r.added) vars.push(r.added)
  }
  return { query: printDoc(doc), vars }
}

/** Replace the selection set of the (already selected) field/fragment at `path`. */
export function replaceSelectionSet(doc: DocumentNode, op: OperationDefinitionNode, path: Seg[], set: SelectionSetNode): DocumentNode {
  const parent = path.slice(0, -1)
  const seg = path[path.length - 1]
  const next = updateAt(op.selectionSet, parent, (sels) => sels.map((s: Any) => (matches(s, seg) ? { ...s, selectionSet: set } : s)))
  return finalize(doc, op, next)
}

export interface FillOptions {
  depth: number // 1 = only scalar fields of the type, 2+ = also descend into object fields
  typename: boolean // add __typename on every composite level (like Apollo Client)
  deprecated?: boolean
}

/**
 * Build a full selection set for a composite type: every scalar/enum field, recursing `depth` levels
 * into object fields, inline fragments for union/interface members. Fields with required args are skipped,
 * as are types already on the current path (cycles).
 */
export function autoSelection(schema: GraphQLSchema, type: GraphQLNamedType, opts: FillOptions): SelectionSetNode {
  let budget = 600
  const field = (n: string, sel?: SelectionSetNode) => makeNode({ kind: 'field', name: n }, sel)
  const leaf = (t: GraphQLNamedType) => isScalarType(t) || isEnumType(t)

  function build(t: GraphQLNamedType, depth: number, seen: Set<string>): SelectionNode[] {
    const out: SelectionNode[] = []
    if (isObjectType(t) || isInterfaceType(t)) {
      for (const f of Object.values(t.getFields())) {
        if (budget <= 0) break
        if (f.deprecationReason && !opts.deprecated) continue
        if (f.args.some((a) => isNonNullType(a.type) && a.defaultValue === undefined)) continue
        const n = getNamedType(f.type)
        if (leaf(n)) {
          out.push(field(f.name))
          budget--
        } else if (depth > 1 && !seen.has(n.name)) {
          const sub = build(n, depth - 1, new Set([...seen, n.name]))
          if (sub.length) out.push(field(f.name, { kind: Kind.SELECTION_SET, selections: sub }))
        }
      }
    }
    if (isAbstractType(t)) {
      // member fragments live on the same depth level as the abstract field itself
      for (const p of schema.getPossibleTypes(t)) {
        if (budget <= 0) break
        const sub = build(p, depth, new Set([...seen, p.name])).filter(
          (s) => !(isInterfaceType(t) && s.kind === Kind.FIELD && s.name.value in t.getFields()),
        )
        if (sub.length) out.push(makeNode({ kind: 'frag', type: p.name }, { kind: Kind.SELECTION_SET, selections: sub }))
      }
    }
    if (opts.typename || !out.length) out.push(field('__typename'))
    return out
  }
  return { kind: Kind.SELECTION_SET, selections: build(type, Math.max(1, opts.depth), new Set([type.name])) }
}
