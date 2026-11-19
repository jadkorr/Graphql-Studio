import { getNamedType, isNonNullType, type GraphQLSchema } from 'graphql'
import { useStore } from '../store'
import { autoSelection, operationForField, type OpKind } from './builder'
import { skeleton } from './schema'
import { tr } from './i18n'

export function rootKindOf(schema: GraphQLSchema, typeName: string): OpKind | null {
  if (schema.getQueryType()?.name === typeName) return 'query'
  if (schema.getMutationType()?.name === typeName) return 'mutation'
  if (schema.getSubscriptionType()?.name === typeName) return 'subscription'
  return null
}

/** Generate an operation for a root field, open it in a new tab and jump to the workspace. */
export function tryRootField(schema: GraphQLSchema, typeName: string, fieldName: string) {
  const kind = rootKindOf(schema, typeName)
  const root = schema.getType(typeName)
  if (!kind || !root || !('getFields' in root)) return
  const field = (root as { getFields(): Record<string, import('graphql').GraphQLField<unknown, unknown>> }).getFields()[fieldName]
  if (!field) return
  const named = getNamedType(field.type)
  const composite = 'getFields' in named || 'getTypes' in named
  const fill = useStore.getState().fill
  const { query, vars } = operationForField(kind, field, composite ? autoSelection(schema, named, fill) : [], (t) => isNonNullType(t as never))
  const variables: Record<string, unknown> = {}
  for (const v of vars) {
    const arg = field.args.find((a) => a.name === v) ?? field.args.find((a) => v.toLowerCase().endsWith(a.name.toLowerCase()))
    if (arg) variables[v] = skeleton(arg.type)
  }
  const st = useStore.getState()
  st.addTab({ query, variables: JSON.stringify(variables, null, 2) })
  st.setView('workspace')
  st.setLeftPanel('builder')
  st.toast(tr('Operación «{name}» lista — completa las variables y pulsa Enviar', { name: fieldName }), 'ok')
}

/** Empty the editor, variables and response of a tab, with an "Undo" action in the toast. */
export function clearTabWithUndo(tabId: string) {
  const st = useStore.getState()
  const tab = st.tabs.find((t) => t.id === tabId)
  if (!tab) return
  const snapshot = { query: tab.query, variables: tab.variables, operationName: tab.operationName, response: tab.response }
  st.clearTab(tabId)
  st.toast(tr('Editor limpio'), 'info', {
    label: tr('Deshacer'),
    run: () => useStore.getState().updateTab(tabId, snapshot),
  })
}
