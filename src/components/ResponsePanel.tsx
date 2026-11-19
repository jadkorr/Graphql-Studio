import { useMemo, useState } from 'react'
import { Copy, Clock, HardDrive, Shield, Zap, AlertCircle, Radio, Download } from 'lucide-react'
import type { QueryTab } from '../store'
import { useStore } from '../store'
import { formatBytes } from '../lib/request'
import CodeEditor from './CodeEditor'
import { useT } from '../lib/i18n'

export default function ResponsePanel({ tab }: { tab: QueryTab }) {
  const [view, setView] = useState<'body' | 'headers'>('body')
  const toast = useStore((s) => s.toast)
  const t = useT()
  const r = tab.response

  const pretty = useMemo(() => {
    if (!r?.body) return ''
    try {
      return JSON.stringify(JSON.parse(r.body), null, 2)
    } catch {
      return r.body
    }
  }, [r?.body])

  const gqlErrors = useMemo(() => {
    try {
      const j = JSON.parse(r?.body ?? '')
      return Array.isArray(j?.errors) ? j.errors.length : 0
    } catch {
      return 0
    }
  }, [r?.body])

  const statusColor = !r ? '' : r.error || r.status >= 500 ? 'var(--color-err)' : r.status >= 400 ? 'var(--color-warn)' : 'var(--color-ok)'

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
        <div className="seg">
          <button data-active={view === 'body'} onClick={() => setView('body')}>
            {t('Respuesta')}
          </button>
          <button data-active={view === 'headers'} onClick={() => setView('headers')}>
            Headers {r && <span className="text-[10px] text-faint">{Object.keys(r.headers).length}</span>}
          </button>
        </div>
        <span className="flex-1" />
        {r && !tab.loading && (
          <div className="fade-in flex items-center gap-3 text-[11.5px] whitespace-nowrap text-dim">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono font-semibold"
              style={{ color: statusColor, background: `color-mix(in oklab, ${statusColor} 14%, transparent)` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
              {r.error ? 'ERROR' : `${r.status} ${r.statusText}`}
            </span>
            {gqlErrors > 0 && (
              <span className="inline-flex items-center gap-1 text-err">
                <AlertCircle size={12} /> {t(gqlErrors > 1 ? '{n} errores' : '{n} error', { n: gqlErrors })}
              </span>
            )}
            <span className="inline-flex items-center gap-1" title={t('Tiempo')}>
              <Clock size={12} /> {r.timeMs} ms
            </span>
            <span className="inline-flex items-center gap-1" title={t('Tamaño')}>
              <HardDrive size={12} /> {formatBytes(r.size)}
            </span>
            <span className="inline-flex items-center gap-1" title={r.mode === 'proxy' ? `${t('Vía proxy local')}${r.via ? ' → ' + r.via : ''}` : t('Directo desde el navegador')}>
              {r.mode === 'proxy' ? (r.via ? <Radio size={12} className="text-sky" /> : <Shield size={12} className="text-accent-2" />) : <Zap size={12} />}
            </span>
          </div>
        )}
        {r?.body && (
          <>
            <button
              className="icon-btn"
              title={t('Copiar')}
              onClick={() => {
                navigator.clipboard.writeText(view === 'body' ? pretty : JSON.stringify(r.headers, null, 2))
                toast(t('Copiado al portapapeles'), 'ok')
              }}
            >
              <Copy size={14} />
            </button>
            <button
              className="icon-btn"
              title={t('Descargar JSON')}
              onClick={() => {
                const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([pretty], { type: 'application/json' }))
                a.download = `response-${new Date(r.at).toISOString().replace(/[:.]/g, '-')}.json`
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              <Download size={14} />
            </button>
          </>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {tab.loading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-bg/40 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-3 text-dim">
              <div className="h-9 w-9 rounded-full border-2 border-line-2 border-t-accent spin" />
              <span className="text-[12px]">{t('Enviando petición…')}</span>
            </div>
          </div>
        )}
        {!r && !tab.loading && <EmptyResponse />}
        {r?.error && (
          <div className="m-4 rounded-xl border border-err/35 bg-err/10 p-4">
            <div className="mb-1 flex items-center gap-2 font-semibold text-err">
              <AlertCircle size={15} /> {t('La petición falló')}
            </div>
            <div className="font-mono text-[12px] leading-relaxed break-words text-fg/85">{r.error}</div>
          </div>
        )}
        {r && !r.error && view === 'body' && <CodeEditor language="json" value={pretty} readOnly />}
        {r && view === 'headers' && (
          <div className="h-full overflow-auto p-3">
            <table className="w-full font-mono text-[12px]">
              <tbody>
                {Object.entries(r.headers).map(([k, v]) => (
                  <tr key={k} className="border-b border-line/60">
                    <td className="py-1.5 pr-4 align-top whitespace-nowrap text-field">{k}</td>
                    <td className="py-1.5 break-all text-dim">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!Object.keys(r.headers).length && <div className="p-4 text-center text-faint">{t('Sin headers')}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyResponse() {
  const t = useT()
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex max-w-[280px] flex-col items-center text-center">
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-full blur-2xl" style={{ background: 'var(--grad)', opacity: 0.35 }} />
          <svg viewBox="0 0 64 64" className="relative h-16 w-16">
            <defs>
              <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--color-accent)' }} />
                <stop offset="1" style={{ stopColor: 'var(--color-accent-2)' }} />
              </linearGradient>
            </defs>
            <path d="M32 6 54.5 19v26L32 58 9.5 45V19Z" fill="none" stroke="url(#eg)" strokeWidth="2.5" />
            <path d="M32 6 54.5 45h-45Z" fill="none" stroke="url(#eg)" strokeWidth="2" />
            {[[32, 6], [54.5, 19], [54.5, 45], [32, 58], [9.5, 45], [9.5, 19]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill="url(#eg)" />
            ))}
          </svg>
        </div>
        <div className="font-semibold text-fg">{t('Listo para consultar')}</div>
        <div className="mt-1 text-[12px] text-faint">
          {t('Ejecuta la operación con')} <span className="kbd">⌘</span> <span className="kbd">Enter</span> {t('y la respuesta aparecerá aquí.')}
        </div>
      </div>
    </div>
  )
}
