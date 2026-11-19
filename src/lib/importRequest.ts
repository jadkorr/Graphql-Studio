/* Import a raw HTTP request (e.g. copied from Burp) or a cURL command into the workspace. */
import { uid, useStore, type HeaderRow } from '../store'
import { opContext } from './request'
import { tr } from './i18n'

export interface ParsedRequest {
  method: string
  url: string
  headers: [string, string][]
  body: string
  format: 'http' | 'curl'
}

// headers computed by the transport — never copied into the editor
const DROP = new Set(['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'proxy-connection', 'te', 'upgrade'])

export function parseRequest(text: string, scheme: 'https' | 'http' = 'https'): ParsedRequest {
  const t = text.trim()
  if (/^curl\s/i.test(t)) return parseCurl(t)
  return parseRaw(t, scheme)
}

function parseRaw(text: string, scheme: string): ParsedRequest {
  const norm = text.replace(/\r\n/g, '\n')
  const split = norm.search(/\n\s*\n/)
  const head = split < 0 ? norm : norm.slice(0, split)
  const body = split < 0 ? '' : norm.slice(split).replace(/^\s*\n/, '').trim()
  const [first, ...lines] = head.split('\n')
  const m = first.trim().match(/^([A-Z]+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/i)
  if (!m) throw new Error(tr('La primera línea debe ser «POST /graphql HTTP/1.1»'))
  const headers: [string, string][] = []
  for (const l of lines) {
    const i = l.indexOf(':')
    if (i > 0) headers.push([l.slice(0, i).trim(), l.slice(i + 1).trim()])
  }
  const host = headers.find(([k]) => k.toLowerCase() === 'host')?.[1]
  let url = m[2]
  if (!/^https?:\/\//i.test(url)) {
    if (!host) throw new Error(tr('Falta el header Host para construir la URL'))
    url = `${scheme}://${host}${url.startsWith('/') ? '' : '/'}${url}`
  }
  return { method: m[1].toUpperCase(), url, headers, body, format: 'http' }
}

function shellSplit(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  let has = false
  s = s.replace(/\\\r?\n/g, ' ')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]
      else cur += c
    } else if (c === "'" || c === '"') {
      q = c
      has = true
    } else if (c === '$' && s[i + 1] === "'") {
      q = "'"
      has = true
      i++
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur)
      cur = ''
      has = false
    } else if (c === '\\' && i + 1 < s.length) cur += s[++i]
    else cur += c
  }
  if (cur || has) out.push(cur)
  return out
}

function parseCurl(text: string): ParsedRequest {
  const args = shellSplit(text).slice(1)
  let method = ''
  let url = ''
  let body = ''
  const headers: [string, string][] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const next = () => args[++i] ?? ''
    if (a === '-H' || a === '--header') {
      const h = next()
      const j = h.indexOf(':')
      if (j > 0) headers.push([h.slice(0, j).trim(), h.slice(j + 1).trim()])
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--json'].includes(a)) body = next()
    else if (a === '-X' || a === '--request') method = next().toUpperCase()
    else if (a === '--url') url = next()
    else if (['-x', '--proxy', '-u', '--user', '-A', '--user-agent', '-b', '--cookie', '-o', '--output', '-m', '--max-time'].includes(a)) {
      const v = next()
      if (a === '-A' || a === '--user-agent') headers.push(['User-Agent', v])
      if (a === '-b' || a === '--cookie') headers.push(['Cookie', v])
    } else if (!a.startsWith('-') && !url) url = a
  }
  if (!url) throw new Error(tr('No se encontró la URL en el comando cURL'))
  return { method: method || (body ? 'POST' : 'GET'), url, headers, body, format: 'curl' }
}

export interface ImportPreview {
  parsed: ParsedRequest
  query: string
  variables: string
  operationName?: string
  headers: HeaderRow[]
  templated: string[]
}

/** Turn a parsed request into workspace data. Header values equal to the body's operation info become templates. */
export function buildImport(parsed: ParsedRequest): ImportPreview {
  let query = ''
  let variables: unknown = {}
  let operationName: string | undefined
  if (parsed.body) {
    let j: Record<string, unknown> | null = null
    try {
      j = JSON.parse(parsed.body)
    } catch {
      /* not JSON */
    }
    const first = Array.isArray(j) ? j[0] : j
    if (first && typeof first === 'object' && typeof (first as { query?: unknown }).query === 'string') {
      const b = first as { query: string; variables?: unknown; operationName?: string }
      query = b.query
      variables = b.variables ?? {}
      operationName = b.operationName ?? undefined
    } else if (!j) query = parsed.body
  } else if (parsed.method === 'GET') {
    try {
      const u = new URL(parsed.url)
      query = u.searchParams.get('query') ?? ''
      variables = JSON.parse(u.searchParams.get('variables') || '{}')
      operationName = u.searchParams.get('operationName') ?? undefined
    } catch {
      /* ignore */
    }
  }

  const ctx = opContext({ query, operationName, variables: variables as Record<string, unknown> })
  const templated: string[] = []
  const headers: HeaderRow[] = parsed.headers
    .filter(([k]) => !DROP.has(k.toLowerCase()) && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(k))
    .map(([key, value]) => {
      let v = value
      if (query) {
        const compact = (() => {
          try {
            return JSON.stringify(JSON.parse(value))
          } catch {
            return null
          }
        })()
        if (value === ctx.operationName && ctx.operationName) v = '{{operationName}}'
        else if (value === ctx.operationType && /operation.?type/i.test(key)) v = '{{operationType}}'
        else if (compact !== null && compact === ctx.variables && /variables/i.test(key)) v = '{{variables}}'
        if (v !== value) templated.push(key)
      }
      return { id: uid(), key, value: v, enabled: true }
    })

  return { parsed, query, variables: JSON.stringify(variables, null, 2), operationName, headers, templated }
}

export function applyImport(p: ImportPreview, replaceHeaders: boolean) {
  const st = useStore.getState()
  let url = p.parsed.url
  if (p.parsed.method === 'GET') {
    try {
      const u = new URL(url)
      ;['query', 'variables', 'operationName', 'extensions'].forEach((k) => u.searchParams.delete(k))
      url = u.toString()
    } catch {
      /* keep */
    }
  }
  let headers = p.headers
  if (!replaceHeaders) {
    headers = [...st.settings.headers]
    for (const h of p.headers) {
      const i = headers.findIndex((x) => x.key.toLowerCase() === h.key.toLowerCase())
      if (i >= 0) headers[i] = { ...headers[i], value: h.value, enabled: true }
      else headers.push(h)
    }
  }
  st.setSettings({ url, method: p.parsed.method === 'GET' ? 'GET' : 'POST', headers })
  if (p.query) st.addTab({ query: p.query, variables: p.variables, operationName: p.operationName })
  st.setView('workspace')
  st.toast(tr(p.query ? 'Request importado: {n} headers + operación' : 'Request importado: {n} headers', { n: p.headers.length }), 'ok')
}
