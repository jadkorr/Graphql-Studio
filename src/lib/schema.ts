import {
  buildSchema,
  buildClientSchema,
  printSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  type GraphQLField,
  type GraphQLInputType,
  type GraphQLNamedType,
  type GraphQLSchema,
  type IntrospectionQuery,
} from 'graphql'
import { useMemo } from 'react'
import { useStore, type SchemaEntry } from '../store'
import { tr } from './i18n'

export type Kind = 'object' | 'input' | 'enum' | 'interface' | 'union' | 'scalar'

export const KIND_META: Record<Kind, { label: string; short: string; color: string; bg: string }> = {
  object: { label: 'Object', short: 'T', color: 'var(--k-object)', bg: 'var(--k-object-bg)' },
  input: { label: 'Input', short: 'I', color: 'var(--k-input)', bg: 'var(--k-input-bg)' },
  enum: { label: 'Enum', short: 'E', color: 'var(--k-enum)', bg: 'var(--k-enum-bg)' },
  interface: { label: 'Interface', short: 'If', color: 'var(--k-interface)', bg: 'var(--k-interface-bg)' },
  union: { label: 'Union', short: 'U', color: 'var(--k-union)', bg: 'var(--k-union-bg)' },
  scalar: { label: 'Scalar', short: 'S', color: 'var(--k-scalar)', bg: 'var(--k-scalar-bg)' },
}

/** Translucent version of any CSS color (works with var(--…) too). */
export const alpha = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

export function kindOf(t: GraphQLNamedType): Kind {
  if (isObjectType(t)) return 'object'
  if (isInputObjectType(t)) return 'input'
  if (isEnumType(t)) return 'enum'
  if (isInterfaceType(t)) return 'interface'
  if (isUnionType(t)) return 'union'
  return 'scalar'
}

export interface BuiltSchema {
  schema: GraphQLSchema | null
  error: string | null
  warning: string | null
}

const cache = new Map<string, BuiltSchema>()

export function buildFromSDL(sdl: string): BuiltSchema {
  try {
    return { schema: buildSchema(sdl), error: null, warning: null }
  } catch (strictErr) {
    try {
      const schema = buildSchema(sdl, { assumeValidSDL: true, assumeValid: true })
      return { schema, error: null, warning: (strictErr as Error).message } // shown as «loaded without validation: …»
    } catch (e) {
      return { schema: null, error: (e as Error).message, warning: null }
    }
  }
}

export function getBuilt(entry: SchemaEntry): BuiltSchema {
  const key = entry.id + ':' + entry.sdl.length
  let b = cache.get(key)
  if (!b) {
    b = buildFromSDL(entry.sdl)
    cache.set(key, b)
  }
  return b
}

export function useActiveSchema() {
  const entry = useStore((s) => s.schemas.find((x) => x.id === s.activeSchemaId) ?? null)
  return useMemo(() => {
    if (!entry) return { entry: null, schema: null, error: null, warning: null }
    return { entry, ...getBuilt(entry) }
  }, [entry])
}

/** Convert uploaded file text into SDL. Accepts SDL or an introspection JSON result. */
export function fileToSDL(text: string): string {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed)
    const data: IntrospectionQuery = json.data ?? json
    if (!data.__schema) throw new Error(tr('El JSON no contiene un resultado de introspección (__schema)'))
    return printSchema(buildClientSchema(data))
  }
  return text
}

export const userTypes = (schema: GraphQLSchema) =>
  Object.values(schema.getTypeMap()).filter((t) => !t.name.startsWith('__'))

export function rootTypeNames(schema: GraphQLSchema): string[] {
  return [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
    .filter(Boolean)
    .map((t) => t!.name)
}

// ---------- reverse references ("used by") ----------
export interface Ref { from: string; field: string; viaArg?: string }
const refCache = new WeakMap<GraphQLSchema, Map<string, Ref[]>>()

export function getReverseRefs(schema: GraphQLSchema): Map<string, Ref[]> {
  let m = refCache.get(schema)
  if (m) return m
  m = new Map()
  const add = (to: string, r: Ref) => {
    if (!m!.has(to)) m!.set(to, [])
    m!.get(to)!.push(r)
  }
  for (const t of userTypes(schema)) {
    if (isObjectType(t) || isInterfaceType(t)) {
      for (const f of Object.values(t.getFields())) {
        add(getNamedType(f.type).name, { from: t.name, field: f.name })
        for (const a of f.args) add(getNamedType(a.type).name, { from: t.name, field: f.name, viaArg: a.name })
      }
      for (const i of t.getInterfaces()) add(i.name, { from: t.name, field: 'implements' })
    } else if (isInputObjectType(t)) {
      for (const f of Object.values(t.getFields())) add(getNamedType(f.type).name, { from: t.name, field: f.name })
    } else if (isUnionType(t)) {
      for (const p of t.getTypes()) add(p.name, { from: t.name, field: 'member' })
    }
  }
  refCache.set(schema, m)
  return m
}

// ---------- variable skeletons ----------
export function skeleton(type: GraphQLInputType, depth = 0): unknown {
  if (isNonNullType(type)) return skeleton(type.ofType, depth)
  if (isListType(type)) return [skeleton(type.ofType, depth)]
  if (isEnumType(type)) return type.getValues()[0]?.name ?? null
  if (isScalarType(type)) {
    switch (type.name) {
      case 'Int':
      case 'Float':
        return 0
      case 'Boolean':
        return false
      default:
        return ''
    }
  }
  if (isInputObjectType(type)) {
    if (depth > 6) return {}
    const out: Record<string, unknown> = {}
    for (const f of Object.values(type.getFields())) {
      const required = isNonNullType(f.type) && f.defaultValue === undefined
      // only required fields — optional ones (e.g. testOnly_*) are left out, like a real client would
      if (required) out[f.name] = skeleton(f.type, depth + 1)
    }
    return out
  }
  return null
}

/** Pick sensible default sub-fields when a composite field gets selected. */
export function defaultLeafFields(t: GraphQLNamedType): string[] {
  if (!(isObjectType(t) || isInterfaceType(t))) return ['__typename']
  const fields = Object.values(t.getFields()) as GraphQLField<unknown, unknown>[]
  const leaf = fields.filter((f) => {
    const n = getNamedType(f.type)
    return (isScalarType(n) || isEnumType(n)) && !f.args.some((a) => isNonNullType(a.type))
  })
  const id = leaf.find((f) => f.name === 'id')
  if (id) return ['id']
  return leaf.length ? [leaf[0].name] : ['__typename']
}

export function typeString(t: { toString(): string }) {
  return t.toString()
}
