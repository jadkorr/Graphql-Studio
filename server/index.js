// GraphQL Studio — local proxy server
// - POST /api/proxy  : forwards a GraphQL request to any endpoint (bypasses CORS),
//                      optionally through an upstream HTTP(S) proxy (Burp, mitmproxy, corporate proxy…)
// - Serves the built frontend (dist/) in production mode.
import express from 'express'
import { request, Agent, ProxyAgent } from 'undici'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PORT = Number(process.env.PORT || 4100)
const HOST = process.env.HOST || '127.0.0.1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')

const decoders = {
  gzip: promisify(zlib.gunzip),
  'x-gzip': promisify(zlib.gunzip),
  deflate: promisify(zlib.inflate),
  br: promisify(zlib.brotliDecompress),
}
const MAX_RESPONSE = 50 * 1024 * 1024 // raw upstream bytes
const MAX_DECODED = 200 * 1024 * 1024 // after decompression (guards against zip bombs)

async function decode(buf, encoding) {
  for (const enc of String(encoding || '').split(',').map((e) => e.trim().toLowerCase()).reverse()) {
    if (decoders[enc]) {
      try {
        buf = await decoders[enc](buf, { maxOutputLength: MAX_DECODED })
      } catch (e) {
        if (e?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) throw new Error(`Decompressed response exceeds ${MAX_DECODED / 1048576} MB`)
        /* not actually compressed */
      }
    }
  }
  return buf
}

async function readLimited(body, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of body) {
    size += chunk.length
    if (size > limit) {
      body.destroy()
      throw new Error(`Response exceeds ${limit / 1048576} MB`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
// Hosts the UI is legitimately served from: this server, and the Vite dev server that proxies /api.
const ALLOWED_HOSTS = new Set(
  [PORT, 5173].flatMap((p) => ['127.0.0.1', 'localhost', '[::1]'].map((h) => `${h}:${p}`)).concat(
    (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
  ),
)
if (!LOOPBACK.has(HOST)) ALLOWED_HOSTS.add(`${HOST}:${PORT}`.toLowerCase())

const app = express()
app.disable('x-powered-by')

// Security headers for everything this server returns (UI + API)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader(
    'Content-Security-Policy',
    // connect-src * is required by "Direct" mode (the browser calls the endpoint itself)
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src *; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
  next()
})

// The API is an open forwarder by design, so only the local UI may call it.
// Host check blocks DNS-rebinding; Origin / Sec-Fetch-Site checks block other websites (CSRF).
app.use('/api', (req, res, next) => {
  const host = String(req.headers.host || '').toLowerCase()
  if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ proxyError: `Forbidden host: ${host || '(none)'}` })
  const origin = req.headers.origin
  if (origin) {
    let oh = ''
    try { oh = new URL(origin).host.toLowerCase() } catch { /* invalid */ }
    if (!ALLOWED_HOSTS.has(oh)) return res.status(403).json({ proxyError: 'Forbidden origin' })
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ proxyError: 'Cross-site request blocked' })
  next()
})

app.use('/api', express.json({ limit: '25mb' }))

// Hop-by-hop / computed headers that must not be forwarded verbatim
const STRIP_REQ = new Set(['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-connection'])

const dispatchers = new Map()
function getDispatcher(proxy, insecure) {
  const key = `${proxy || ''}|${insecure ? 1 : 0}`
  if (dispatchers.has(key)) return dispatchers.get(key)
  if (dispatchers.size >= 16) {
    // keep the pool bounded: close the oldest agent
    const [oldKey, old] = dispatchers.entries().next().value
    dispatchers.delete(oldKey)
    old.close().catch(() => {})
  }
  const tls = insecure ? { rejectUnauthorized: false } : undefined
  // Force HTTP/1.1: undici may negotiate HTTP/2 (ALPN) through Burp, which breaks the stream
  // after the request was already delivered (NGHTTP2_PROTOCOL_ERROR) and invites retries.
  // No automatic retries either: every click = exactly one upstream request.
  const common = { allowH2: false, maxRedirections: 0, connections: 8, pipelining: 1 }
  const d = proxy
    ? new ProxyAgent({ uri: proxy, requestTls: { ...tls, ALPNProtocols: ['http/1.1'] }, proxyTls: tls, ...common })
    : new Agent({ connect: { ...tls, ALPNProtocols: ['http/1.1'] }, ...common })
  dispatchers.set(key, d)
  return d
}

// ring buffer of every upstream request actually sent — lets the UI audit what left the machine
const LOG = []
let seq = 0
function logEntry(e) {
  LOG.unshift(e)
  if (LOG.length > 300) LOG.length = 300
  return e
}
app.get('/api/log', (_req, res) => res.json(LOG))
app.delete('/api/log', (_req, res) => { LOG.length = 0; res.json([]) })

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }))

const METHODS = new Set(['GET', 'POST'])

app.post('/api/proxy', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).json({ proxyError: 'Content-Type must be application/json' })
  const { url, method: rawMethod = 'POST', headers = {}, body, proxy, insecure = false, timeoutMs = 60000, meta = {}, tagHeader = null, lang = 'en' } = req.body || {}
  const en = lang === 'en'
  const method = String(rawMethod).toUpperCase()
  if (!METHODS.has(method)) return res.status(400).json({ proxyError: `Unsupported method: ${method.slice(0, 20)}` })
  if (body != null && typeof body !== 'string') return res.status(400).json({ proxyError: 'Body must be a string' })
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) return res.status(400).json({ proxyError: 'Headers must be an object' })
  const timeout = Math.min(Math.max(Number(timeoutMs) || 60000, 1000), 600000)
  let target
  try {
    target = new URL(url)
    if (!/^https?:$/.test(target.protocol)) throw new Error('Only http(s) URLs are supported')
  } catch (e) {
    return res.status(400).json({ proxyError: `Invalid endpoint URL: ${e.message}` })
  }
  if (proxy) {
    let p
    try { p = new URL(proxy) } catch { /* handled below */ }
    if (!p || !/^https?:$/.test(p.protocol)) return res.status(400).json({ proxyError: 'Invalid upstream proxy URL (use http://host:port)' })
  }

  // RFC 7230 token: undici rejects anything else with "invalid header key"
  const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
  const outHeaders = Object.create(null) // no prototype: a "__proto__" header name stays a plain key
  const skippedHeaders = []
  for (const [rawKey, v] of Object.entries(headers)) {
    const k = String(rawKey).trim()
    if (!k || STRIP_REQ.has(k.toLowerCase())) continue
    if (!TOKEN.test(k)) { skippedHeaders.push(k.length > 60 ? k.slice(0, 60) + '…' : k); continue }
    outHeaders[k] = String(v).replace(/[\r\n\0]+/g, ' ').trim()
  }

  const started = performance.now()
  let opName = meta.operationName || ''
  try { opName = opName || JSON.parse(body || '{}').operationName || '' } catch { /* not JSON */ }
  const entry = logEntry({
    id: ++seq,
    at: Date.now(),
    source: meta.source || 'editor',
    tab: meta.tab || null,
    method,
    url: target.toString(),
    operationName: opName,
    query: String(body || '').slice(0, 2000),
    via: proxy || null,
    state: 'sending',
  })
  // optional marker header so tool traffic is distinguishable from the app in Burp / server logs
  if (tagHeader && TOKEN.test(String(tagHeader))) {
    outHeaders[String(tagHeader)] = `req-${entry.id}${opName ? '-' + opName : ''}`
    entry.tag = `${tagHeader}: ${outHeaders[String(tagHeader)]}`
  }
  // abort upstream if the browser cancels / disconnects (prevents a held request leaking out later)
  const ac = new AbortController()
  res.on('close', () => { if (!res.writableFinished) { ac.abort(); if (entry.state === 'sending') entry.state = 'aborted' } })
  try {
    // undici.request sends exactly the headers we pass (fetch() would add Accept-Language,
    // Sec-Fetch-Mode, User-Agent: undici…), so the request matches what you define in the UI.
    const upstream = await request(target, {
      method,
      headers: outHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      dispatcher: getDispatcher(proxy, insecure),
      signal: AbortSignal.any([ac.signal, AbortSignal.timeout(timeout)]),
    })
    const raw = await readLimited(upstream.body, MAX_RESPONSE)
    const respHeaders = {}
    for (const [k, v] of Object.entries(upstream.headers)) respHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v)
    const text = (await decode(raw, respHeaders['content-encoding'])).toString('utf8')
    const timeMs = Math.round(performance.now() - started)
    const STATUS = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' }
    upstream.statusText = STATUS[upstream.statusCode] || ''
    upstream.status = upstream.statusCode
    Object.assign(entry, { state: 'done', status: upstream.statusCode, timeMs })
    res.json({
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
      body: text,
      timeMs,
      size: raw.length,
      via: proxy || null,
      skippedHeaders,
    })
  } catch (e) {
    if (entry.state === 'sending') Object.assign(entry, { state: ac.signal.aborted ? 'aborted' : 'error', error: e.message })
    if (res.headersSent || res.writableEnded) return
    const code = String(e.cause?.code || e.code || '')
    const cause = code ? ` (${code})` : e.cause ? ` (${e.cause.message || e.cause})` : ''
    const hint = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|TLS/i.test(code)
      ? (en ? ' — Untrusted certificate: enable "Ignore TLS errors" (required with Burp over HTTPS).' : ' — Certificado no confiable: activa «Ignorar errores TLS» (necesario con Burp en HTTPS).')
      : code === 'ECONNREFUSED' && proxy
        ? (en ? ` — Is Burp/the proxy listening on ${proxy}?` : ` — ¿Está Burp/el proxy escuchando en ${proxy}?`)
        : ''
    res.status(502).json({
      proxyError: `${e.name === 'TimeoutError' || code === 'UND_ERR_ABORTED' ? 'Request timed out' : e.message}${cause}${hint}`,
      timeMs: Math.round(performance.now() - started),
    })
  }
})

if (existsSync(DIST)) {
  // hashed assets can be cached forever; index.html must always be revalidated so a reload picks up new builds
  app.use(express.static(DIST, {
    setHeaders: (res, file) => res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable'),
  }))
  app.get(/^\/(?!api\/).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(DIST, 'index.html')) })
}

app.listen(PORT, HOST, () => {
  if (!LOOPBACK.has(HOST))
    console.warn(`\n  ⚠  HOST=${HOST} is not a loopback address: anyone on the network who can reach this port can use it as a proxy.`)
  console.log(`\n  ◆ GraphQL Studio proxy listening on http://${HOST}:${PORT}  ·  © ${new Date().getFullYear()} jadkorr`)
  if (existsSync(DIST)) console.log(`  ◆ UI served at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`)
  else console.log('  ◆ (dev mode) open the Vite URL — usually http://localhost:5173\n')
})
