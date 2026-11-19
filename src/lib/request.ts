import { getIntrospectionQuery } from 'graphql'
import { useStore, type ResponseData, type Settings } from '../store'
import { operations, tryParse } from './builder'
import { tr } from './i18n'

export interface GqlPayload {
  query: string
  variables?: Record<string, unknown>
  operationName?: string
}

export interface OpContext {
  operationType: string
  operationName: string
  variables: string
  query: string
}

export const TEMPLATE_VARS: { key: keyof OpContext; desc: string }[] = [
  { key: 'operationType', desc: 'query / mutation / subscription' },
  { key: 'operationName', desc: 'nombre de la operación' },
  { key: 'variables', desc: 'variables en JSON compacto' },
]

/** Describe the operation being sent so header templates can reference it. */
export function opContext(payload?: Partial<GqlPayload>): OpContext {
  const query = payload?.query ?? ''
  const { doc } = tryParse(query)
  const ops = doc ? operations(doc) : []
  const op = ops.find((o) => o.name?.value === payload?.operationName) ?? ops[0]
  return {
    operationType: op?.operation ?? 'query',
    operationName: op?.name?.value ?? payload?.operationName ?? '',
    variables: JSON.stringify(payload?.variables ?? {}),
    query: query.replace(/\s+/g, ' ').trim(),
  }
}

export const hasTemplate = (v: string) => /\{\{\s*\w+\s*\}\}/.test(v)

export function interpolate(value: string, ctx?: OpContext) {
  if (!ctx) return value
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in ctx ? String(ctx[k as keyof OpContext]) : m))
}

export function activeHeaders(settings: Settings, ctx?: OpContext) {
  const h: Record<string, string> = Object.create(null)
  for (const row of settings.headers)
    if (row.enabled && row.key.trim()) h[row.key.trim()] = interpolate(row.value, ctx).replace(/[\r\n]+/g, ' ')
  return h
}

function buildTarget(settings: Settings, payload: GqlPayload) {
  if (settings.method === 'GET') {
    const u = new URL(settings.url)
    u.searchParams.set('query', payload.query)
    if (payload.variables) u.searchParams.set('variables', JSON.stringify(payload.variables))
    if (payload.operationName) u.searchParams.set('operationName', payload.operationName)
    return { url: u.toString(), body: undefined }
  }
  return { url: settings.url, body: JSON.stringify(payload) }
}

export async function sendGraphQL(
  settings: Settings,
  payload: GqlPayload,
  signal?: AbortSignal,
  meta: { source: 'editor' | 'introspection'; tab?: string } = { source: 'editor' },
): Promise<ResponseData> {
  const headers = activeHeaders(settings, opContext(payload))
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type') && settings.method === 'POST')
    headers['Content-Type'] = 'application/json'
  const at = Date.now()
  let target: { url: string; body?: string }
  try {
    target = buildTarget(settings, payload)
  } catch {
    return errorResponse(tr('URL de endpoint inválida: {url}', { url: settings.url }), settings.useProxy ? 'proxy' : 'direct', at, 0)
  }

  if (settings.useProxy) {
    const started = performance.now()
    try {
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          url: target.url,
          method: settings.method,
          headers,
          body: target.body,
          proxy: settings.upstreamEnabled && settings.upstreamProxy ? settings.upstreamProxy : undefined,
          insecure: settings.insecureTLS,
          timeoutMs: settings.timeoutMs,
          meta: { ...meta, operationName: payload.operationName },
          tagHeader: settings.tagEnabled && settings.tagName.trim() ? settings.tagName.trim() : null,
          lang: useStore.getState().prefs.lang,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!j) return errorResponse(tr('El proxy local respondió {status}. ¿Está corriendo? Inícialo con ./start.sh', { status: r.status }), 'proxy', at, performance.now() - started)
      if (j.proxyError) return errorResponse(j.proxyError, 'proxy', at, j.timeMs ?? 0)
      return { ...j, mode: 'proxy', at }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return errorResponse(tr('Petición cancelada'), 'proxy', at, performance.now() - started)
      return errorResponse(tr('No se pudo contactar el proxy local: {msg}', { msg: (e as Error).message }), 'proxy', at, performance.now() - started)
    }
  }

  const started = performance.now()
  try {
    if (settings.tagEnabled && settings.tagName.trim())
      headers[settings.tagName.trim()] = `direct-${Date.now().toString(36)}${payload.operationName ? '-' + payload.operationName : ''}`
    const r = await fetch(target.url, { method: settings.method, headers, body: target.body, signal })
    const body = await r.text()
    const h: Record<string, string> = {}
    r.headers.forEach((v, k) => (h[k] = v))
    return {
      status: r.status,
      statusText: r.statusText,
      headers: h,
      body,
      timeMs: Math.round(performance.now() - started),
      size: new Blob([body]).size,
      mode: 'direct',
      at,
    }
  } catch (e) {
    return errorResponse(
      `${(e as Error).message}. ${tr('En modo directo el navegador aplica CORS — activa el proxy local si el servidor no lo permite.')}`,
      'direct',
      at,
      performance.now() - started,
    )
  }
}

function errorResponse(error: string, mode: 'proxy' | 'direct', at: number, timeMs: number): ResponseData {
  return { status: 0, statusText: 'Error', headers: {}, body: '', timeMs: Math.round(timeMs), size: 0, error, mode, at }
}

export async function introspect(settings: Settings) {
  const res = await sendGraphQL(
    settings,
    { operationName: 'IntrospectionQuery', query: getIntrospectionQuery({ descriptions: true, inputValueDeprecation: true }) },
    undefined,
    { source: 'introspection' },
  )
  if (res.error) throw new Error(res.error)
  let json: { data?: unknown; errors?: { message: string }[] }
  try {
    json = JSON.parse(res.body)
  } catch {
    throw new Error(tr('Respuesta no JSON (HTTP {status})', { status: res.status }))
  }
  if (!json.data) throw new Error(json.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`)
  return json.data
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export function toCurl(settings: Settings, payload: GqlPayload) {
  const { url, body } = buildTarget(settings, payload)
  const parts = [`curl ${shq(url)}`]
  if (settings.method !== 'POST' || !body) parts.push(`-X ${settings.method}`)
  for (const [k, v] of Object.entries(activeHeaders(settings, opContext(payload)))) parts.push(`-H ${shq(`${k}: ${v}`)}`)
  if (body) parts.push(`--data-raw ${shq(body)}`)
  if (settings.upstreamEnabled && settings.upstreamProxy) parts.push(`-x ${shq(settings.upstreamProxy)}`)
  if (settings.insecureTLS) parts.push('-k')
  return parts.join(' \\\n  ')
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
