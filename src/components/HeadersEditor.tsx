import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, FileText, List, Eye, EyeOff, Sparkles, ClipboardPaste, Eraser } from 'lucide-react'
import { uid, useActiveTab, useStore, type HeaderRow } from '../store'
import { hasTemplate, interpolate, opContext, TEMPLATE_VARS } from '../lib/request'
import { buildPayload } from '../lib/useRun'
import { useT } from '../lib/i18n'

const PRESETS = ['Authorization', 'Content-Type', 'Accept', 'Cookie', 'X-API-Key', 'X-Request-ID', 'User-Agent', 'Origin', 'Referer']

/** Parse "Key: value" lines (supports "// " prefix for disabled rows). Splits on the first colon only. */
export const VALID_HEADER = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const REQUEST_LINE = /^[A-Z]+\s+\S+\s+HTTP\/[\d.]+$/i

export const looksLikeFullRequest = (text: string) => REQUEST_LINE.test(text.trim().split(/\r?\n/)[0]?.trim() ?? '')

export function parseHeaderBlock(text: string): HeaderRow[] {
  let lines = text.replace(/\r\n/g, '\n').split('\n')
  // full HTTP request pasted: drop the request line and everything after the blank line (body)
  if (looksLikeFullRequest(text)) {
    lines = lines.slice(1)
    const blank = lines.findIndex((l) => !l.trim())
    if (blank >= 0) lines = lines.slice(0, blank)
  }
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !/^#/.test(l))
    .map((l) => {
      const disabled = l.startsWith('//')
      const clean = l.replace(/^\/\/\s*/, '')
      const i = clean.indexOf(':')
      return {
        id: uid(),
        key: (i < 0 ? clean : clean.slice(0, i)).trim(),
        value: i < 0 ? '' : clean.slice(i + 1).trim(),
        enabled: !disabled,
      }
    })
    .filter((h) => h.key && VALID_HEADER.test(h.key) && !/^(host|content-length|connection)$/i.test(h.key))
}

const looksLikeBlock = (t: string) => /\n/.test(t.trim()) || /^[\w-]+\s*:\s*\S/.test(t.trim())
const sensitive = (k: string) => /auth|token|key|cookie|secret|password|session/i.test(k)

export default function HeadersEditor({ large = false }: { large?: boolean }) {
  const headers = useStore((s) => s.settings.headers)
  const setSettings = useStore((s) => s.setSettings)
  const toast = useStore((s) => s.toast)
  const tab = useActiveTab()
  const [bulk, setBulk] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [preview, setPreview] = useState(true)
  const t = useT()
  const focused = useRef<{ id: string; field: 'key' | 'value'; el: HTMLInputElement } | null>(null)

  const set = (h: HeaderRow[]) => setSettings({ headers: h })
  const patch = (id: string, p: Partial<HeaderRow>) => set(headers.map((h) => (h.id === id ? { ...h, ...p } : h)))

  // resolve templates against the operation in the active tab
  const ctx = useMemo(() => {
    const p = buildPayload(tab.id)
    return opContext(typeof p === 'string' ? { query: tab.query } : p)
  }, [tab.id, tab.query, tab.variables, tab.operationName])

  /** Merge parsed rows: same header name (case-insensitive) replaces the existing value. */
  const merge = (rows: HeaderRow[], replaceId?: string) => {
    let next = headers.filter((h) => h.id !== replaceId || h.key || h.value)
    for (const r of rows) {
      const i = next.findIndex((h) => h.key.toLowerCase() === r.key.toLowerCase())
      if (i >= 0) next = next.map((h, j) => (j === i ? { ...h, value: r.value, enabled: r.enabled } : h))
      else next = [...next, r]
    }
    set(next)
    toast(t('{n} header(s) añadidos', { n: rows.length }), 'ok')
  }

  const hintFull = (text: string) =>
    looksLikeFullRequest(text) &&
    toast(t('Pegaste un request completo: se tomaron solo los headers. Usa «Importar request» (📥) para cargar también la query y las variables.'), 'info')

  const onPaste = (id: string, field: 'key' | 'value') => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    hintFull(text)
    // a block of "Key: value" lines pasted anywhere → split into rows
    if (/\n/.test(text.trim()) || (field === 'key' && looksLikeBlock(text))) {
      const rows = parseHeaderBlock(text)
      if (rows.length) {
        e.preventDefault()
        merge(rows, id)
      }
    }
  }

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      hintFull(clip)
      const rows = parseHeaderBlock(clip)
      if (!rows.length) return toast(t('El portapapeles no contiene líneas "Header: valor"'), 'err')
      merge(rows)
    } catch {
      setBulk(true)
      toast(t('Pega el bloque en el editor de texto'), 'info')
    }
  }

  const insertVar = (key: string) => {
    const f = focused.current
    const token = `{{${key}}}`
    if (!f || f.field !== 'value') {
      navigator.clipboard?.writeText(token)
      return toast(t('{token} copiado — pégalo en el valor de un header', { token }), 'info')
    }
    const el = f.el
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    patch(f.id, { value: el.value.slice(0, start) + token + el.value.slice(end) })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const bulkText = headers.map((h) => `${h.enabled ? '' : '// '}${h.key}: ${h.value}`).join('\n')
  const enabled = headers.filter((h) => h.enabled && h.key).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 px-3 pt-2 pb-1.5">
        <span className="text-[11px] text-faint">
          {t(enabled === 1 ? '{n} activo · se envían con cada petición' : '{n} activos · se envían con cada petición', { n: enabled })}
        </span>
        <span className="flex-1" />
        <button className="btn btn-ghost h-6 px-2 text-[11px] text-dim" onClick={pasteFromClipboard} title={t("Importar líneas 'Header: valor' del portapapeles")}>
          <ClipboardPaste size={12} /> {t('Pegar bloque')}
        </button>
        <button className="btn btn-ghost h-6 px-2 text-[11px] text-dim" onClick={() => setBulk(!bulk)} title={bulk ? t('Editor por filas') : t('Editar como texto')}>
          {bulk ? <List size={12} /> : <FileText size={12} />} {bulk ? t('Filas') : t('Texto')}
        </button>
        <button className="icon-btn h-6 w-6" title={reveal ? t('Ocultar valores sensibles') : t('Mostrar valores sensibles')} onClick={() => setReveal(!reveal)}>
          {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        {headers.length > 0 && (
          <button className="icon-btn h-6 w-6" title={t('Borrar todos')} onClick={() => confirm(t('¿Eliminar todos los headers?')) && set([])}>
            <Eraser size={12} />
          </button>
        )}
      </div>

      {/* template variables */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        <Sparkles size={11} className="text-accent-2" />
        <span className="text-[10.5px] text-faint">{t('Dinámicos:')}</span>
        {TEMPLATE_VARS.map((v) => (
          <button
            key={v.key}
            className="rounded-md border border-accent-2/25 bg-accent-2/8 px-1.5 py-px font-mono text-[10.5px] text-dyn hover:bg-accent-2/16"
            title={`${t(v.desc)} — ${t('ahora')}: ${ctx[v.key] || '∅'}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertVar(v.key)}
          >
            {`{{${v.key}}}`}
          </button>
        ))}
        {headers.some((h) => hasTemplate(h.value)) && (
          <button className="ml-auto text-[10.5px] text-faint hover:text-dim" onClick={() => setPreview(!preview)}>
            {preview ? t('ocultar valores resueltos') : t('ver valores resueltos')}
          </button>
        )}
      </div>

      {bulk ? (
        <textarea
          key={bulkText}
          className="input mx-3 mb-3 min-h-0 flex-1 resize-none py-2 font-mono text-[12px] leading-relaxed"
          defaultValue={bulkText}
          spellCheck={false}
          autoFocus
          placeholder={'Authorization: Bearer xxx\nX-Operation-Name: {{operationName}}\n// ' + t('X-Desactivado: valor')}
          onBlur={(e) => {
            hintFull(e.target.value)
            set(parseHeaderBlock(e.target.value))
          }}
        />
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-auto px-3 pb-3">
          <datalist id="header-presets">
            {PRESETS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {headers.map((h) => {
            const dynamic = hasTemplate(h.value)
            const masked = sensitive(h.key) && !reveal
            const invalid = !!h.key && !VALID_HEADER.test(h.key.trim())
            return (
              <div key={h.id}>
                <div className="group flex items-center gap-1.5">
                  <button className="check" data-on={h.enabled} onClick={() => patch(h.id, { enabled: !h.enabled })} title={t('Activar / desactivar')}>
                    {h.enabled && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </button>
                  <input
                    className={`input h-7 font-mono text-[12px] ${large ? 'w-[40%]' : 'w-[38%]'}`}
                    list="header-presets"
                    value={h.key}
                    placeholder={t('Header (o pega un bloque)')}
                    onChange={(e) => patch(h.id, { key: e.target.value })}
                    onPaste={onPaste(h.id, 'key')}
                    onFocus={(e) => (focused.current = { id: h.id, field: 'key', el: e.currentTarget })}
                    title={invalid ? t("Nombre inválido: solo letras, números y - _ . ! # $ % & ' * + ^ ` | ~ (sin espacios ni dos puntos)") : undefined}
                    style={{ opacity: h.enabled ? 1 : 0.45, ...(invalid ? { borderColor: 'var(--color-err)', color: 'var(--color-err)' } : {}) }}
                    spellCheck={false}
                  />
                  <input
                    className="input h-7 flex-1 font-mono text-[12px]"
                    value={h.value}
                    type={masked && !dynamic ? 'password' : 'text'}
                    placeholder={t('Valor')}
                    onChange={(e) => patch(h.id, { value: e.target.value })}
                    onPaste={onPaste(h.id, 'value')}
                    onFocus={(e) => (focused.current = { id: h.id, field: 'value', el: e.currentTarget })}
                    style={{ opacity: h.enabled ? 1 : 0.45, color: dynamic ? 'var(--color-dyn)' : undefined }}
                    spellCheck={false}
                  />
                  <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => set(headers.filter((x) => x.id !== h.id))} title={t('Eliminar')}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {dynamic && preview && h.enabled && (
                  <div className="mt-0.5 mb-1 ml-[22px] truncate font-mono text-[10.5px] text-faint" title={interpolate(h.value, ctx)}>
                    → <span className="text-dim">{interpolate(h.value, ctx) || '∅'}</span>
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex items-center gap-2 pt-1">
            <button className="btn btn-ghost h-7 text-[12px] text-dim" onClick={() => set([...headers, { id: uid(), key: '', value: '', enabled: true }])}>
              <Plus size={13} /> {t('Añadir header')}
            </button>
            {!headers.length && <span className="text-[11px] text-faint">{t('o pega un bloque «Header: valor» en el campo de nombre')}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
