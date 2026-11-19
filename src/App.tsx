import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, UploadCloud, AlertTriangle, X } from 'lucide-react'
import { useStore } from './store'
import { useT } from './lib/i18n'
import { usePrefsEffect } from './lib/prefs'
import { useActiveSchema } from './lib/schema'
import { importFiles } from './lib/importer'
import TopBar from './components/TopBar'
import Workspace from './components/Workspace'
import SchemaView from './components/SchemaView'

export default function App() {
  const view = useStore((s) => s.view)
  const { schema, error, warning, entry } = useActiveSchema()
  const [dragging, setDragging] = useState(false)
  const t = useT()
  usePrefsEffect()

  // global drag & drop of schema files
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      {entry && (error || warning) && (
        <div
          className={`mx-2 mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] ${error ? 'border-err/35 bg-err/10 text-err' : 'border-warn/35 bg-warn/10 text-warn'}`}
        >
          <AlertTriangle size={14} className="flex-none" />
          <span className="truncate">{error ? t('No se pudo construir «{name}»: {error}', { name: entry.name, error }) : t('Esquema cargado sin validar: {msg}', { msg: warning ?? '' })}</span>
        </div>
      )}
      <main className="min-h-0 flex-1">
        {view === 'schema' && schema ? <SchemaView schema={schema} /> : view === 'schema' ? <SchemaEmpty /> : <Workspace schema={schema} />}
      </main>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[200] grid place-items-center bg-bg/80 backdrop-blur-md">
          <div className="fade-in flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-accent-2/65 px-20 py-14" style={{ boxShadow: '0 0 80px -20px var(--color-accent-2)' }}>
            <UploadCloud size={44} className="text-accent-2" />
            <div className="text-[18px] font-semibold">{t('Suelta tus esquemas aquí')}</div>
            <div className="text-faint">.graphql · .graphqls · .gql · introspection .json</div>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  )
}

function SchemaEmpty() {
  const t = useT()
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <UploadCloud size={40} className="text-accent-2" />
        <div className="text-[16px] font-semibold">{t('No hay un esquema activo')}</div>
        <div className="max-w-sm text-faint">{t('Arrastra uno o varios archivos .graphql a la ventana para explorar sus tipos como grafo interactivo.')}</div>
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[300] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'ok' ? CheckCircle2 : t.kind === 'err' ? AlertCircle : Info
        const color = t.kind === 'ok' ? 'var(--color-ok)' : t.kind === 'err' ? 'var(--color-err)' : 'var(--color-accent-2)'
        return (
          <div key={t.id} className={`fade-in glass flex max-w-[440px] items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-[12.5px] shadow-2xl ${t.action ? 'pointer-events-auto' : ''}`}>
            <Icon size={15} style={{ color }} className="mt-px flex-none" />
            <span className="break-words">{t.text}</span>
            {t.action && (
              <>
                <button
                  className="-my-0.5 flex-none rounded-md border border-line-2 px-2 py-0.5 text-[11.5px] font-semibold text-accent-2 hover:bg-hover"
                  onClick={() => {
                    t.action!.run()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
                <button className="flex-none text-faint hover:text-fg" onClick={() => dismiss(t.id)}>
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
