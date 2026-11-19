import { useEffect, useMemo, useState } from 'react'
import { FileInput, X, Sparkles, AlertTriangle } from 'lucide-react'
import { applyImport, buildImport, parseRequest } from '../lib/importRequest'
import { Toggle } from './TopBar'
import { useT } from '../lib/i18n'

const sensitive = (k: string) => /auth|token|cookie|secret|session|key/i.test(k)
const mask = (v: string) => (v.length > 16 ? `${v.slice(0, 8)}…${v.slice(-4)}` : '••••')

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [scheme, setScheme] = useState<'https' | 'http'>('https')
  const [replace, setReplace] = useState(true)
  const t = useT()

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const result = useMemo(() => {
    if (!text.trim()) return null
    try {
      return { ok: buildImport(parseRequest(text, scheme)) }
    } catch (e) {
      return { err: (e as Error).message }
    }
  }, [text, scheme])

  const p = result && 'ok' in result ? result.ok : null

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm" onMouseDown={onClose}>
      <div className="fade-in glass flex h-[min(680px,90vh)] w-[1000px] max-w-[95vw] flex-col overflow-hidden rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <FileInput size={15} className="text-accent-2" />
          <div className="flex-1">
            <div className="font-semibold">{t('Importar request')}</div>
            <div className="text-[11px] text-faint">
              {t('Pega un request HTTP crudo (Burp → Copy request) o un comando cURL. Se cargan URL, headers, operación y variables.')}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <textarea
            autoFocus
            className="input h-full min-w-0 flex-1 resize-none py-2 font-mono text-[11.5px] leading-relaxed"
            placeholder={'POST /graphql HTTP/1.1\nHost: api.example.com\nAuthorization: …\nContent-Type: application/json\n\n{"operationName":"…","variables":{…},"query":"…"}'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <div className="flex w-[400px] flex-none flex-col gap-3 overflow-auto">
            {!result && <div className="p-4 text-[12px] text-faint">{t('La vista previa aparecerá aquí.')}</div>}
            {result && 'err' in result && (
              <div className="flex gap-2 rounded-lg border border-err/35 bg-err/10 p-3 text-[12px] text-err">
                <AlertTriangle size={14} className="mt-0.5 flex-none" /> {result.err}
              </div>
            )}
            {p && (
              <>
                <div className="rounded-lg border border-line bg-panel-2 p-3">
                  <div className="mb-1 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">Endpoint</div>
                  <div className="font-mono text-[12px] break-all">
                    <span className="mr-2 font-bold text-keyword">{p.parsed.method}</span>
                    {p.parsed.url}
                  </div>
                  {p.parsed.format === 'http' && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
                      {t('Protocolo')}
                      <div className="seg">
                        {(['https', 'http'] as const).map((s) => (
                          <button key={s} className="!h-5 !px-2 text-[11px]" data-active={scheme === s} onClick={() => setScheme(s)}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-line bg-panel-2 p-3">
                  <div className="mb-1 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">{t('Operación')}</div>
                  {p.query ? (
                    <div className="font-mono text-[12px]">
                      <span className="text-field">{p.operationName ?? t('(anónima)')}</span>
                      <div className="mt-1 max-h-[80px] overflow-hidden text-[10.5px] whitespace-pre text-faint">{p.query.slice(0, 300)}</div>
                    </div>
                  ) : (
                    <div className="text-[12px] text-faint">{t('Sin cuerpo GraphQL — solo se importarán URL y headers.')}</div>
                  )}
                </div>
                <div className="rounded-lg border border-line bg-panel-2 p-3">
                  <div className="mb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">Headers ({p.headers.length})</div>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {p.headers.map((h) => (
                      <div key={h.id} className="flex gap-1.5">
                        <span className="flex-none text-field">{h.key}:</span>
                        <span className={`truncate ${p.templated.includes(h.key) ? 'text-dyn' : 'text-dim'}`}>
                          {sensitive(h.key) ? mask(h.value) : h.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  {p.templated.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-dyn">
                      <Sparkles size={12} className="mt-0.5 flex-none" />
                      {t('{n} header(s) convertidos a dinámicos: se actualizarán con cada operación que envíes.', { n: p.templated.length })}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10.5px] text-faint">{t('Host, Content-Length y Connection se calculan automáticamente.')}</div>
                </div>
                <Toggle on={replace} onChange={setReplace} label={t('Reemplazar los headers actuales')} desc={t('Si no, se combinan (los repetidos se sobrescriben)')} />
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button className="btn" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!p}
            onClick={() => {
              if (!p) return
              applyImport(p, replace)
              onClose()
            }}
          >
            {t('Importar')}
          </button>
        </div>
      </div>
    </div>
  )
}
