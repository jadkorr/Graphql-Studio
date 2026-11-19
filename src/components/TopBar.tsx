import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Square,
  ChevronDown,
  Upload,
  Globe,
  ClipboardPaste,
  Trash2,
  Check,
  FileCode2,
  Settings2,
  Shield,
  Zap,
  Radio,
  LayoutPanelLeft,
  Network,
  Database,
  Pencil,
  KeyRound,
  X,
  FileInput,
  SlidersHorizontal,
} from 'lucide-react'
import PrefsModal from './PrefsModal'
import { useT } from '../lib/i18n'
import ImportModal from './ImportModal'
import HeadersEditor from './HeadersEditor'
import { useActiveTab, useStore, type SchemaEntry } from '../store'
import { importFiles, importFromEndpoint, importSDL } from '../lib/importer'
import { runTab, cancelTab } from '../lib/useRun'
import { getBuilt } from '../lib/schema'
import Popover from './Popover'

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 pr-2" title={`GraphQL Studio · © ${new Date().getFullYear()} jadkorr`}>
      <img src="/favicon.svg" className="h-7 w-7 drop-shadow-[0_0_12px_rgba(229,53,171,0.5)]" />
      <div className="leading-none">
        <div className="text-[14px] font-bold tracking-tight">
          GraphQL <span className="grad-text">Studio</span>
        </div>
        <div className="mt-0.5 text-[10px] text-faint">schema explorer & client</div>
      </div>
    </div>
  )
}

export default function TopBar() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const t = useT()
  const [prefsOpen, setPrefsOpen] = useState(false)
  return (
    <header className="flex h-14 flex-none items-center gap-3 px-3">
      <Logo />
      <div className="seg">
        <button data-active={view === 'workspace'} onClick={() => setView('workspace')}>
          <LayoutPanelLeft size={13} /> Workspace
        </button>
        <button data-active={view === 'schema'} onClick={() => setView('schema')}>
          <Network size={13} /> {t('Esquema')}
        </button>
      </div>
      <SchemaMenu />
      <EndpointBar />
      <button className="btn h-9 px-2.5" onClick={() => setPrefsOpen(true)} title={t('Preferencias')}>
        <SlidersHorizontal size={14} className="text-dim" />
      </button>
      {prefsOpen && <PrefsModal onClose={() => setPrefsOpen(false)} />}
    </header>
  )
}

const SOURCE_ICON = { file: FileCode2, introspection: Globe, paste: ClipboardPaste }

function SchemaMenu() {
  const schemas = useStore((s) => s.schemas)
  const activeId = useStore((s) => s.activeSchemaId)
  const setActive = useStore((s) => s.setActiveSchema)
  const remove = useStore((s) => s.removeSchema)
  const rename = useStore((s) => s.renameSchema)
  const fileRef = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = schemas.find((s) => s.id === activeId)
  const t = useT()

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".graphql,.graphqls,.gql,.sdl,.json,.txt"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) importFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Popover
        width={340}
        trigger={(open, toggle) => (
          <button className="btn max-w-[240px]" onClick={toggle} data-open={open}>
            <Database size={14} className="flex-none text-accent-2" />
            <span className="truncate">{active ? active.name : t('Sin esquema')}</span>
            <ChevronDown size={13} className="flex-none text-faint" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">{t('Esquemas cargados')}</div>
            {!schemas.length && <div className="px-2 py-3 text-[12px] text-faint">{t('Aún no hay esquemas. Carga un archivo .graphql o usa introspección.')}</div>}
            <div className="max-h-[300px] overflow-auto">
              {schemas.map((s) => (
                <SchemaItem
                  key={s.id}
                  s={s}
                  active={s.id === activeId}
                  onPick={() => (setActive(s.id), close())}
                  onRemove={() => remove(s.id)}
                  onRename={(n) => rename(s.id, n)}
                />
              ))}
            </div>
            <div className="my-1.5 h-px bg-line" />
            <MenuItem icon={Upload} label={t('Cargar archivos .graphql / .json')} hint={t('o arrástralos')} onClick={() => (fileRef.current?.click(), close())} />
            <MenuItem
              icon={Globe}
              label={busy ? t('Obteniendo esquema…') : t('Introspección del endpoint')}
              hint={t('usa URL + headers')}
              onClick={async () => {
                setBusy(true)
                await importFromEndpoint()
                setBusy(false)
                close()
              }}
            />
            <MenuItem icon={ClipboardPaste} label={t('Pegar SDL')} onClick={() => (setPaste(true), close())} />
          </div>
        )}
      </Popover>
      {paste && <PasteModal onClose={() => setPaste(false)} />}
    </>
  )
}

function SchemaItem({ s, active, onPick, onRemove, onRename }: { s: SchemaEntry; active: boolean; onPick: () => void; onRemove: () => void; onRename: (n: string) => void }) {
  const Icon = SOURCE_ICON[s.source]
  const [editing, setEditing] = useState(false)
  const built = getBuilt(s)
  const count = built.schema ? Object.keys(built.schema.getTypeMap()).filter((n) => !n.startsWith('__')).length : 0
  const t = useT()
  return (
    <div className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${active ? 'bg-elev' : 'hover:bg-hover'}`}>
      <Icon size={14} className="flex-none text-faint" />
      {editing ? (
        <input
          autoFocus
          className="input h-6 flex-1 text-[12px]"
          defaultValue={s.name}
          onBlur={(e) => (onRename(e.target.value || s.name), setEditing(false))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <button className="min-w-0 flex-1 text-left" onClick={onPick}>
          <div className="truncate text-[12.5px]">{s.name}</div>
          <div className="text-[10.5px] text-faint">
            {built.error ? <span className="text-err">{t('inválido')}</span> : t('{n} tipos', { n: count })} · {new Date(s.addedAt).toLocaleDateString()}
          </div>
        </button>
      )}
      {active && <Check size={14} className="flex-none text-ok" />}
      <button className="icon-btn hidden h-6 w-6 group-hover:inline-grid" onClick={() => setEditing(true)} title={t('Renombrar')}>
        <Pencil size={11} />
      </button>
      <button className="icon-btn hidden h-6 w-6 group-hover:inline-grid" onClick={onRemove} title={t('Eliminar')}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function MenuItem({ icon: Icon, label, hint, onClick }: { icon: typeof Upload; label: string; hint?: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[12.5px] hover:bg-hover" onClick={onClick}>
      <Icon size={14} className="text-dim" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
    </button>
  )
}

function PasteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const t = useT()
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm" onMouseDown={onClose}>
      <div className="fade-in glass w-[640px] max-w-[92vw] rounded-2xl p-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 font-semibold">{t('Pegar esquema SDL o JSON de introspección')}</div>
        <input className="input mb-2 w-full" placeholder={t('Nombre del esquema')} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          className="input h-[360px] w-full resize-none py-2 font-mono text-[12px]"
          placeholder={'type Query {\n  hello: String\n}'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => importSDL(name, text) && onClose()}>
            {t('Cargar')}
          </button>
        </div>
      </div>
    </div>
  )
}

function EndpointBar() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const tab = useActiveTab()
  const [headersOpen, setHeadersOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const lastSend = useRef(0)
  const t = useT()
  const headerCount = settings.headers.filter((h) => h.enabled && h.key.trim()).length
  const hasAuth = settings.headers.some((h) => h.enabled && /^(authorization|cookie|x-api-key)$/i.test(h.key.trim()) && h.value.trim())
  const ModeIcon = !settings.useProxy ? Zap : settings.upstreamEnabled ? Radio : Shield
  const modeLabel = !settings.useProxy ? t('Directo') : settings.upstreamEnabled ? 'Upstream' : 'Proxy'
  const modeColor = !settings.useProxy ? 'var(--color-dim)' : settings.upstreamEnabled ? 'var(--color-sky)' : 'var(--color-accent-2)'

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-9 min-w-0 flex-1 items-center rounded-xl border border-line-2 bg-input pr-1 transition-shadow focus-within:border-accent-2 focus-within:ring-3 focus-within:ring-accent-2/20">
        <select
          className="h-full cursor-pointer rounded-l-xl border-r border-line bg-transparent pr-1 pl-3 font-mono text-[11.5px] font-bold text-keyword outline-none"
          value={settings.method}
          onChange={(e) => setSettings({ method: e.target.value as 'POST' | 'GET' })}
        >
          <option value="POST">POST</option>
          <option value="GET">GET</option>
        </select>
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[12.5px] outline-none placeholder:text-faint"
          value={settings.url}
          placeholder={t('https://api.ejemplo.com/graphql')}
          onChange={(e) => setSettings({ url: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          spellCheck={false}
        />
        <Popover
          align="right"
          width={360}
          trigger={(_, toggle) => (
            <button
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-medium transition-colors hover:bg-hover"
              style={{ color: modeColor }}
              onClick={toggle}
              title={t('Conexión y proxy')}
            >
              <ModeIcon size={13} /> {modeLabel}
              <Settings2 size={12} className="text-faint" />
            </button>
          )}
        >
          {() => <ConnectionSettings />}
        </Popover>
      </div>
      <button className="btn h-9 px-2.5" onClick={() => setImportOpen(true)} title={t('Importar request de Burp o cURL')}>
        <FileInput size={14} className="text-dim" />
      </button>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      <button
        className="btn h-9 px-3"
        onClick={() => setHeadersOpen(true)}
        title={t('Headers de la petición (autenticación, custom…)')}
      >
        <KeyRound size={14} className={hasAuth ? 'text-ok' : 'text-dim'} />
        Headers
        <span className="rounded-full bg-elev px-1.5 font-mono text-[10.5px] text-dim">{headerCount}</span>
      </button>
      {headersOpen && <HeadersModal onClose={() => setHeadersOpen(false)} />}
      {tab.loading ? (
        <button
          className="btn h-9 px-4"
          onClick={() => {
            // guard against the second click of a double-click landing on «Cancelar»
            if (Date.now() - lastSend.current < 700) return
            cancelTab(tab.id)
          }}
        >
          <Square size={13} className="fill-current" /> {t('Cancelar')}
        </button>
      ) : (
        <button
          className="btn btn-primary h-9 px-4"
          onClick={() => {
            lastSend.current = Date.now()
            runTab()
          }}
          title={t('Ejecutar') + ' (⌘/Ctrl + Enter)'}
        >
          <Play size={14} className="fill-current" /> {t('Enviar')}
        </button>
      )}
    </div>
  )
}

function ConnectionSettings() {
  const settings = useStore((s) => s.settings)
  const set = useStore((s) => s.setSettings)
  const [health, setHealth] = useState<'checking' | 'up' | 'down'>('checking')
  const t = useT()
  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setHealth('up'))
      .catch(() => setHealth('down'))
  }, [])

  return (
    <div className="space-y-3 p-2.5">
      <div>
        <div className="mb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">{t('Modo de envío')}</div>
        <div className="grid grid-cols-2 gap-1.5">
          <ModeCard active={settings.useProxy} icon={Shield} title={t('Proxy local')} desc={t('Sin CORS, vía Node')} onClick={() => set({ useProxy: true })} />
          <ModeCard active={!settings.useProxy} icon={Zap} title={t('Directo')} desc={t('fetch del navegador')} onClick={() => set({ useProxy: false })} />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: health === 'up' ? 'var(--color-ok)' : health === 'down' ? 'var(--color-err)' : 'var(--color-warn)' }}
          />
          <span className="text-faint">
            {health === 'up' ? t('Proxy local activo') : health === 'down' ? t('Proxy local no disponible — ejecuta ./start.sh') : t('Comprobando proxy local…')}
          </span>
        </div>
      </div>

      <div className={settings.useProxy ? '' : 'pointer-events-none opacity-40'}>
        <Toggle
          on={settings.upstreamEnabled}
          onChange={(v) => set(v ? { upstreamEnabled: true, insecureTLS: true } : { upstreamEnabled: false })}
          label={t('Encadenar proxy upstream')}
          desc="Burp Suite (127.0.0.1:8080), mitmproxy, Charles…"
        />
        <input
          className="input mt-2 w-full font-mono text-[12px]"
          value={settings.upstreamProxy}
          onChange={(e) => set({ upstreamProxy: e.target.value })}
          placeholder="http://127.0.0.1:8080"
          disabled={!settings.upstreamEnabled}
          style={{ opacity: settings.upstreamEnabled ? 1 : 0.5 }}
        />
        <div className="mt-3">
          <Toggle on={settings.insecureTLS} onChange={(v) => set({ insecureTLS: v })} label={t('Ignorar errores TLS')} desc={t('Certificados autofirmados / interceptados')} />
        </div>
      </div>

      <div>
        <Toggle
          on={settings.tagEnabled}
          onChange={(v) => set({ tagEnabled: v })}
          label={t('Marcar peticiones de la tool')}
          desc={t('Añade un header para distinguirlas de la app en Burp')}
        />
        <input
          className="input mt-2 w-full font-mono text-[12px]"
          value={settings.tagName}
          onChange={(e) => set({ tagName: e.target.value })}
          placeholder="X-GraphQL-Studio"
          disabled={!settings.tagEnabled}
          style={{ opacity: settings.tagEnabled ? 1 : 0.5 }}
        />
        <div className="mt-1 font-mono text-[10.5px] text-faint">
          {settings.tagEnabled ? `${settings.tagName || 'X-GraphQL-Studio'}: req-<n>-<${t('Operación')}>` : t('Desactivado: el request sale idéntico al de la app')}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11.5px] text-dim">Timeout</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={5}
            max={300}
            step={5}
            value={settings.timeoutMs / 1000}
            onChange={(e) => set({ timeoutMs: Number(e.target.value) * 1000 })}
            className="flex-1 accent-accent-2"
          />
          <span className="w-12 text-right font-mono text-[11.5px] text-dim">{settings.timeoutMs / 1000}s</span>
        </div>
      </div>
    </div>
  )
}

function ModeCard({ active, icon: Icon, title, desc, onClick }: { active: boolean; icon: typeof Shield; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border p-2.5 text-left transition-all"
      style={{
        borderColor: active ? 'var(--color-accent-2)' : 'var(--color-line-2)',
        background: active ? 'color-mix(in oklab, var(--color-accent-2) 10%, transparent)' : 'transparent',
      }}
    >
      <Icon size={15} className={active ? 'text-accent-2' : 'text-faint'} />
      <div className="mt-1 text-[12.5px] font-medium">{title}</div>
      <div className="text-[10.5px] text-faint">{desc}</div>
    </button>
  )
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button className="flex w-full items-center gap-3 text-left" onClick={() => onChange(!on)}>
      <span className="relative h-[18px] w-8 flex-none rounded-full transition-colors" style={{ background: on ? 'var(--grad)' : 'var(--color-track)' }}>
        <span className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all" style={{ left: on ? 16 : 2 }} />
      </span>
      <span>
        <span className="block text-[12.5px]">{label}</span>
        {desc && <span className="block text-[10.5px] text-faint">{desc}</span>}
      </span>
    </button>
  )
}

function HeadersModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const t = useT()
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm" onMouseDown={onClose}>
      <div className="fade-in glass flex h-[min(620px,85vh)] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <KeyRound size={15} className="text-accent-2" />
          <div className="flex-1">
            <div className="font-semibold">{t('Headers de la petición')}</div>
            <div className="text-[11px] text-faint">
              {t('Autenticación y headers custom. Pega un bloque «Header: valor» en cualquier campo de nombre para importarlo de golpe.')}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 pt-1">
          <HeadersEditor large />
        </div>
      </div>
    </div>
  )
}
