import { memo, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isUnionType,
  type GraphQLNamedType,
  type GraphQLSchema,
} from 'graphql'
import { alpha, getReverseRefs, kindOf, KIND_META, type Kind } from '../lib/schema'
import { useT } from '../lib/i18n'
import { useStore } from '../store'
import { isDarkTheme } from '../lib/prefs'

interface FieldRowData { name: string; type: string; target?: string; viaArg?: boolean }
interface TypeNodeData extends Record<string, unknown> {
  name: string
  kind: Kind
  fields: FieldRowData[]
  hidden: number
  center: boolean
  dim: boolean
  onSelect: (n: string) => void
}
type TNode = Node<TypeNodeData, 'type'>

const ROW = 21
const HEAD = 38
const MAX_NODES = 90

export interface GraphOptions { depth: number; incoming: boolean; leaves: boolean; args: boolean }

function linkable(t: GraphQLNamedType, leaves: boolean) {
  if (isScalarType(t)) return false
  if (isEnumType(t)) return leaves
  return true
}

function fieldsOf(t: GraphQLNamedType, withArgs: boolean): FieldRowData[] {
  if (isObjectType(t) || isInterfaceType(t)) {
    const rows: FieldRowData[] = []
    for (const f of Object.values(t.getFields())) {
      rows.push({ name: f.name, type: f.type.toString(), target: getNamedType(f.type).name })
      if (withArgs)
        for (const a of f.args) {
          const n = getNamedType(a.type)
          if (isInputObjectType(n)) rows.push({ name: `${f.name}(${a.name})`, type: a.type.toString(), target: n.name, viaArg: true })
        }
    }
    return rows
  }
  if (isInputObjectType(t)) return Object.values(t.getFields()).map((f) => ({ name: f.name, type: f.type.toString(), target: getNamedType(f.type).name }))
  if (isUnionType(t)) return t.getTypes().map((m) => ({ name: m.name, type: 'member', target: m.name }))
  if (isEnumType(t)) return t.getValues().map((v) => ({ name: v.name, type: '' }))
  return []
}

function buildGraph(schema: GraphQLSchema, center: string, opts: GraphOptions, onSelect: (n: string) => void) {
  const root = schema.getType(center)
  if (!root) return { nodes: [] as TNode[], edges: [] as Edge[], truncated: false }
  const level = new Map<string, number>([[center, 0]])
  const queue = [center]
  let truncated = false
  // BFS outgoing
  while (queue.length) {
    const cur = queue.shift()!
    const d = level.get(cur)!
    if (d >= opts.depth) continue
    const t = schema.getType(cur)!
    for (const f of fieldsOf(t, opts.args && d === 0)) {
      if (!f.target || level.has(f.target)) continue
      const tt = schema.getType(f.target)
      if (!tt || !linkable(tt, opts.leaves)) continue
      if (level.size >= MAX_NODES) { truncated = true; break }
      level.set(f.target, d + 1)
      queue.push(f.target)
    }
  }
  // incoming
  const incomingFrom = new Map<string, string[]>()
  if (opts.incoming) {
    for (const r of getReverseRefs(schema).get(center) ?? []) {
      if (r.from === center || r.field === 'implements' || r.field === 'member') continue
      if (!level.has(r.from)) {
        if (level.size >= MAX_NODES) { truncated = true; continue }
        level.set(r.from, -1)
      }
      if (!incomingFrom.has(r.from)) incomingFrom.set(r.from, [])
      incomingFrom.get(r.from)!.push(r.viaArg ? `${r.field}(${r.viaArg})` : r.field)
    }
  }

  const nodes: TNode[] = []
  const edges: Edge[] = []
  for (const [name, d] of level) {
    const t = schema.getType(name)!
    const kind = kindOf(t)
    const expanded = d >= 0 && d < opts.depth
    let all = fieldsOf(t, opts.args && d === 0)
    if (d === -1) {
      // incoming-only node: show only the referencing fields
      const refFields = new Set(incomingFrom.get(name))
      all = all.filter((f) => refFields.has(f.name)).concat(
        [...refFields].filter((rf) => rf.includes('(')).map((rf) => ({ name: rf, type: center, target: center, viaArg: true })),
      )
      all = all.filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i)
    }
    const linked = (f: FieldRowData) =>
      !!f.target && level.has(f.target) && (expanded || (d === -1 && f.target === center) || (incomingFrom.has(name) && f.target === center))
    let shown = all
    if (d !== 0) {
      const l = all.filter(linked)
      const rest = all.filter((f) => !linked(f))
      shown = [...l, ...rest.slice(0, Math.max(0, (level.size > 30 ? 3 : 8) - l.length))]
    }
    for (const f of shown) {
      if (!linked(f) || f.target === name && !expanded) continue
      const tk = kindOf(schema.getType(f.target!)!)
      edges.push({
        id: `${name}.${f.name}->${f.target}`,
        source: name,
        sourceHandle: `f:${f.name}`,
        target: f.target!,
        targetHandle: 'in',
        type: 'default',
        animated: d === 0 || f.target === center,
        style: { stroke: KIND_META[tk].color, strokeDasharray: f.viaArg ? '4 4' : undefined, opacity: 0.75 },
        markerEnd: { type: MarkerType.ArrowClosed, color: KIND_META[tk].color, width: 14, height: 14 },
      })
    }
    nodes.push({
      id: name,
      type: 'type',
      position: { x: 0, y: 0 },
      data: { name, kind, fields: shown, hidden: all.length - shown.length, center: d === 0, dim: false, onSelect },
    })
  }

  // layout: one band per BFS level (incoming ← center → depth 1..n); bands wrap into masonry columns
  const centerNode = nodes.find((n) => n.data.center)
  for (const n of nodes) {
    const longest = Math.max(n.data.name.length + 10, ...n.data.fields.map((f) => f.name.length + f.type.length + 3))
    n.width = Math.round(Math.min(360, Math.max(190, longest * 7 + 30)))
    n.height = HEAD + n.data.fields.length * ROW + (n.data.hidden ? ROW : 0) + 8
  }
  const maxColH = Math.max(820, centerNode?.height ?? 0)
  const bands = [...new Set([...level.values()])].sort((a, b) => a - b)
  let x = 0
  const COL_GAP = 36, BAND_GAP = 170, ROW_GAP = 18
  for (const b of bands) {
    const members = nodes.filter((n) => level.get(n.id) === b)
    const cols: TNode[][] = [[]]
    let h = 0
    for (const n of members) {
      if (h + n.height! > maxColH && cols[cols.length - 1].length) {
        cols.push([])
        h = 0
      }
      cols[cols.length - 1].push(n)
      h += n.height! + ROW_GAP
    }
    for (const col of cols) {
      const w = Math.max(...col.map((n) => n.width!))
      const total = col.reduce((a, n) => a + n.height! + ROW_GAP, -ROW_GAP)
      let y = -total / 2
      for (const n of col) {
        n.position = { x, y }
        y += n.height! + ROW_GAP
      }
      x += w + COL_GAP
    }
    x += BAND_GAP - COL_GAP
  }
  return { nodes, edges, truncated }
}

const TypeNode = memo(({ data }: NodeProps<TNode>) => {
  const m = KIND_META[data.kind]
  const t = useT()
  return (
    <div
      onClick={() => data.onSelect(data.name)}
      className="cursor-pointer overflow-hidden rounded-xl border bg-node shadow-2xl backdrop-blur transition-all"
      style={{
        width: '100%',
        borderColor: data.center ? m.color : 'var(--color-line-2)',
        boxShadow: data.center ? `0 0 0 1px ${m.color}, 0 0 40px -6px ${alpha(m.color, 65)}` : '0 10px 30px -10px rgba(0,0,0,.35)',
        opacity: data.dim ? 0.25 : 1,
      }}
    >
      <Handle type="target" id="in" position={Position.Left} style={{ top: HEAD / 2, background: m.color }} />
      <div className="flex items-center gap-2 px-3" style={{ height: HEAD, background: `linear-gradient(90deg, ${m.bg}, transparent)`, borderBottom: '1px solid var(--color-line)' }}>
        <span className="rounded px-1 font-mono text-[9.5px] font-bold" style={{ color: m.color, background: m.bg }}>
          {m.label.toUpperCase()}
        </span>
        <span className="truncate font-mono text-[12.5px] font-semibold text-fg">{data.name}</span>
      </div>
      <div className="py-1">
        {data.fields.map((f) => (
          <div key={f.name} className="relative flex items-center justify-between gap-3 px-3 font-mono text-[11px]" style={{ height: ROW }}>
            <span className={`truncate ${f.viaArg ? 'text-arg' : 'text-field-muted'}`}>{f.name}</span>
            <span className={`truncate ${f.target ? 'text-dim' : 'text-faint'}`}>{f.type}</span>
            <Handle type="source" id={`f:${f.name}`} position={Position.Right} style={{ right: -3, opacity: f.target ? 1 : 0 }} />
          </div>
        ))}
        {data.hidden > 0 && (
          <div className="px-3 font-mono text-[10.5px] text-faint italic" style={{ height: ROW, lineHeight: `${ROW}px` }}>
            {t('+{n} campos más…', { n: data.hidden })}
          </div>
        )}
      </div>
    </div>
  )
})

const nodeTypes = { type: TypeNode }

function GraphInner({ schema, center, onSelect, opts }: { schema: GraphQLSchema; center: string; onSelect: (n: string) => void; opts: GraphOptions }) {
  const { fitView } = useReactFlow()
  const [hover, setHover] = useState<string | null>(null)
  const t = useT()
  const dark = useStore((s) => isDarkTheme(s.prefs.theme))
  const { nodes, edges, truncated } = useMemo(() => buildGraph(schema, center, opts, onSelect), [schema, center, opts, onSelect])

  useEffect(() => {
    const id = requestAnimationFrame(() => fitView({ duration: 450, padding: 0.15, maxZoom: 1.1 }))
    return () => cancelAnimationFrame(id)
  }, [nodes, fitView])

  const connected = useMemo(() => {
    if (!hover) return null
    const s = new Set([hover])
    for (const e of edges) if (e.source === hover || e.target === hover) (s.add(e.source), s.add(e.target))
    return s
  }, [hover, edges])

  const vNodes = useMemo(
    () => (connected ? nodes.map((n) => ({ ...n, data: { ...n.data, dim: !connected.has(n.id) } })) : nodes),
    [nodes, connected],
  )
  const vEdges = useMemo(
    () =>
      connected
        ? edges.map((e) => {
            const on = e.source === hover || e.target === hover
            return { ...e, animated: on, style: { ...e.style, opacity: on ? 1 : 0.08, strokeWidth: on ? 2.2 : 1.5 } }
          })
        : edges,
    [edges, connected, hover],
  )

  return (
    <>
      <ReactFlow
        nodes={vNodes}
        edges={vEdges}
        nodeTypes={nodeTypes}
        onNodeMouseEnter={(_, n) => setHover(n.id)}
        onNodeMouseLeave={() => setHover(null)}
        nodesConnectable={false}
        nodesDraggable
        minZoom={0.08}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        colorMode={dark ? 'dark' : 'light'}
        style={{ background: 'transparent' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--graph-dot)" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          maskColor={dark ? 'rgba(0,0,0,0.55)' : 'rgba(240,240,248,0.7)'}
          nodeColor={(n) => KIND_META[(n.data as TypeNodeData).kind].color}
          nodeStrokeWidth={0}
          nodeBorderRadius={6}
        />
      </ReactFlow>
      {truncated && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-warn/35 bg-warn/10 px-3 py-1 text-[11px] text-warn">
          {t('Grafo recortado a {n} nodos — reduce la profundidad para más claridad', { n: MAX_NODES })}
        </div>
      )}
    </>
  )
}

export default function SchemaGraph(props: { schema: GraphQLSchema; center: string; onSelect: (n: string) => void; opts: GraphOptions }) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
