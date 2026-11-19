import { useEffect, useState } from 'react'
import { Trash2, History as HistoryIcon, Radio, Globe, Code2 } from 'lucide-react'
import { useStore } from '../store'
import { tr, useT } from '../lib/i18n'

const opLabel = (q: string) => {
  const m = q.match(/\b(query|mutation|subscription)\s*([_A-Za-z][_0-9A-Za-z]*)?/)
  return { kind: m?.[1] ?? 'query', name: m?.[2] ?? (q.match(/{\s*([_A-Za-z]\w*)/)?.[1] ?? tr('anónima')) }
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return tr('hace {n}s', { n: s })
  if (s < 3600) return tr('hace {n} min', { n: Math.round(s / 60) })
  if (s < 86400) return tr('hace {n} h', { n: Math.round(s / 3600) })
  return new Date(t).toLocaleDateString()
}

interface ProxyLog {
  id: number
  at: number
  source: 'editor' | 'introspection'
  method: string
  url: string
  operationName: string
  via: string | null
  state: 'sending' | 'done' | 'error' | 'aborted'
  status?: number
  timeMs?: number
  error?: string
  tag?: string
  query: string
}

export default function HistoryPanel() {
  const [mode, setMode] = useState<'app' | 'proxy'>('proxy')
  const t = useT()
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-2">
        <div className="seg w-full">
          <button className="flex-1 justify-center" data-active={mode === 'proxy'} onClick={() => setMode('proxy')} title={t('Lo que el proxy envió realmente al endpoint')}>
            <Radio size={12} /> {t('Enviado (proxy)')}
          </button>
          <button className="flex-1 justify-center" data-active={mode === 'app'} onClick={() => setMode('app')} title={t('Operaciones ejecutadas desde el editor')}>
            <HistoryIcon size={12} /> {t('Historial')}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{mode === 'proxy' ? <ProxyLogView /> : <AppHistory />}</div>
    </div>
  )
}

function ProxyLogView() {
  const [log, setLog] = useState<ProxyLog[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const t = useT()
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/log')
        .then((r) => r.json())
        .then((j) => alive && setLog(j))
        .catch(() => alive && setLog([]))
    load()
    const t = setInterval(load, 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const color = (e: ProxyLog) =>
    e.state === 'sending' ? 'var(--color-warn)' : e.state === 'done' && (e.status ?? 0) < 400 ? 'var(--color-ok)' : 'var(--color-err)'
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] text-faint">
        <span>{t('Cada petición que salió del proxy local (se reinicia con el servidor)')}</span>
        {!!log?.length && (
          <button className="hover:text-dim" onClick={() => fetch('/api/log', { method: 'DELETE' }).then(() => setLog([]))}>
            {t('limpiar')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {log && !log.length && <div className="p-8 text-center text-faint">{t('El proxy aún no ha enviado nada')}</div>}
        {log?.map((e) => (
          <div key={e.id} className="mb-1 rounded-lg border border-transparent px-2.5 py-2 hover:border-line hover:bg-hover">
            <button className="w-full text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] text-faint">#{e.id}</span>
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: color(e) }} />
                {e.source === 'introspection' ? (
                  <span className="inline-flex items-center gap-1 rounded bg-warn/10 px-1 font-mono text-[10px] text-warn" title={t('Consulta de introspección (no viene del editor)')}>
                    <Globe size={10} /> {t('introspección')}
                  </span>
                ) : (
                  <Code2 size={11} className="flex-none text-faint" />
                )}
                <span className="truncate font-mono text-[12px] text-fg">{e.operationName || t('anónima')}</span>
                <span className="flex-1" />
                <span className="font-mono text-[10.5px]" style={{ color: color(e) }}>
                  {e.state === 'done' ? e.status : e.state === 'sending' ? '…' : e.state === 'aborted' ? t('cancel.') : 'ERR'}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 pl-5 text-[10.5px] text-faint">
                <span className="truncate">{e.url.replace(/^https?:\/\//, '')}</span>
                {e.via && <span className="flex-none text-sky">{t('vía upstream')}</span>}
                <span className="flex-1" />
                <span className="whitespace-nowrap">
                  {e.timeMs != null ? `${e.timeMs} ms · ` : ''}
                  {new Date(e.at).toLocaleTimeString()}
                </span>
              </div>
            </button>
            {open === e.id && (
              <div className="mt-2 space-y-1 rounded-md bg-input p-2 font-mono text-[10.5px]">
                {e.tag && <div className="text-dyn">{e.tag}</div>}
                {e.error && <div className="text-err">{e.error}</div>}
                <div className="max-h-[160px] overflow-auto break-all whitespace-pre-wrap text-dim">{e.query}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AppHistory() {
  const history = useStore((s) => s.history)
  const clear = useStore((s) => s.clearHistory)
  const addTab = useStore((s) => s.addTab)
  const t = useT()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line p-3">
        <span className="text-[12px] text-dim">{t('{n} peticiones', { n: history.length })}</span>
        {history.length > 0 && (
          <button className="btn btn-ghost h-7 text-[12px] text-dim" onClick={clear}>
            <Trash2 size={12} /> {t('Limpiar')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!history.length && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-faint">
            <HistoryIcon size={22} />
            {t('Aún no hay peticiones')}
          </div>
        )}
        {history.map((h) => {
          const { kind, name } = opLabel(h.query)
          return (
            <button
              key={h.id}
              onClick={() => addTab({ query: h.query, variables: h.variables, operationName: h.operationName })}
              className="mb-1 w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-hover"
              title={t('Abrir en una pestaña nueva')}
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: h.ok ? 'var(--color-ok)' : 'var(--color-err)' }} />
                <span className="font-mono text-[10px] text-keyword uppercase">{kind.slice(0, 3)}</span>
                <span className="truncate font-mono text-[12px] text-fg">{h.operationName || name}</span>
                <span className="flex-1" />
                <span className="font-mono text-[10.5px] text-faint">{h.status || 'ERR'}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 pl-3.5 text-[10.5px] text-faint">
                <span className="truncate">{h.url.replace(/^https?:\/\//, '')}</span>
                <span className="flex-1" />
                <span className="whitespace-nowrap">{h.timeMs} ms · {ago(h.at)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
