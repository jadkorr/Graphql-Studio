import { useStore } from '../store'
import { sendGraphQL, type GqlPayload } from './request'
import { operations, tryParse } from './builder'
import { tr } from './i18n'

const controllers = new Map<string, AbortController>()

export function operationNames(query: string): string[] {
  const { doc } = tryParse(query)
  if (!doc) return []
  return operations(doc).map((o) => o.name?.value ?? '')
}

export function buildPayload(tabId: string): GqlPayload | string {
  const st = useStore.getState()
  const tab = st.tabs.find((t) => t.id === tabId)
  if (!tab) return tr('Pestaña no encontrada')
  if (!tab.query.replace(/#.*$/gm, '').trim())
    return tr('El editor no tiene ninguna operación: márcala en el Builder, escríbela, o pulsa «Probar» en un campo de Query/Mutation')
  let variables: Record<string, unknown> | undefined
  const raw = tab.variables.trim()
  if (raw) {
    try {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object' && Object.keys(v).length) variables = v
    } catch (e) {
      return tr('Variables JSON inválidas: {msg}', { msg: (e as Error).message })
    }
  }
  const names = operationNames(tab.query)
  const operationName =
    (names.length > 1 && tab.operationName && names.includes(tab.operationName) ? tab.operationName : names.find(Boolean)) ||
    undefined
  // same key order as Apollo/most clients: operationName, variables, query
  return { operationName, variables, query: tab.query }
}

export async function runTab(tabId?: string) {
  const st = useStore.getState()
  const id = tabId ?? st.activeTabId
  const payload = buildPayload(id)
  if (typeof payload === 'string') {
    if (st.view !== 'workspace') st.setView('workspace')
    return st.toast(payload, 'err')
  }
  if (!st.settings.url.trim()) return st.toast(tr('Define la URL del endpoint'), 'err')

  // never fire a second request while one is in flight (aborting client-side would not stop
  // the one already delivered, so the server would receive it twice)
  if (controllers.has(id)) {
    return st.toast(tr('Ya hay una petición en curso en esta pestaña — espera o cancélala'), 'info')
  }
  const ctl = new AbortController()
  controllers.set(id, ctl)
  st.updateTab(id, { loading: true })
  // show what is being sent: never fire a hidden tab from another view
  if (st.view !== 'workspace') st.setView('workspace')
  const res = await sendGraphQL(st.settings, payload, ctl.signal, { source: 'editor', tab: id })
  controllers.delete(id)
  const s2 = useStore.getState()
  s2.updateTab(id, { loading: false, response: res })
  if (res.skippedHeaders?.length)
    s2.toast(tr('Se omitieron {n} header(s) con nombre inválido: {list}', { n: res.skippedHeaders.length, list: res.skippedHeaders.join(', ') }), 'err')
  s2.pushHistory({
    at: Date.now(),
    url: s2.settings.url,
    query: payload.query,
    variables: s2.tabs.find((t) => t.id === id)?.variables ?? '',
    operationName: payload.operationName,
    status: res.status,
    timeMs: res.timeMs,
    ok: !res.error && res.status < 400,
  })
}

export function cancelTab(tabId: string) {
  controllers.get(tabId)?.abort()
}
