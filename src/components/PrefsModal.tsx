import { useEffect } from 'react'
import { Check, Languages, Palette, Type, X, RotateCcw, Code2, ZoomIn } from 'lucide-react'
import { DEFAULT_PREFS, useStore, type Lang } from '../store'
import { MONO_FONTS, THEMES, UI_FONTS } from '../lib/prefs'
import { useT } from '../lib/i18n'

const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'es', label: 'Español', flag: 'ES' },
  { id: 'en', label: 'English', flag: 'EN' },
]
const SCALES = [0.9, 1, 1.1, 1.25]

function Section({ icon: Icon, title, children }: { icon: typeof Type; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.12em] text-faint uppercase">
        <Icon size={12} className="text-accent-2" />
        {title}
        <span className="h-px flex-1 bg-line" />
      </div>
      {children}
    </section>
  )
}

export default function PrefsModal({ onClose }: { onClose: () => void }) {
  const prefs = useStore((s) => s.prefs)
  const setPrefs = useStore((s) => s.setPrefs)
  const t = useT()

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="fade-in glass flex max-h-[90vh] w-[720px] max-w-[94vw] flex-col overflow-hidden rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Palette size={15} className="text-accent-2" />
          <div className="flex-1">
            <div className="font-semibold">{t('Preferencias')}</div>
            <div className="text-[11px] text-faint">{t('Idioma, tema y tipografía. Se guardan en este navegador.')}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
          <Section icon={Languages} title={t('Idioma')}>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map((l) => (
                <Choice key={l.id} active={prefs.lang === l.id} onClick={() => setPrefs({ lang: l.id })}>
                  <span className="rounded bg-elev px-1.5 py-0.5 font-mono text-[10px] font-bold text-dim">{l.flag}</span>
                  <span className="text-[13px]">{l.label}</span>
                </Choice>
              ))}
            </div>
          </Section>

          <Section icon={Palette} title={t('Tema')}>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((th) => {
                const [bg, panel, a1, a2] = th.swatch
                const on = prefs.theme === th.id
                return (
                  <button
                    key={th.id}
                    onClick={() => setPrefs({ theme: th.id })}
                    className="group overflow-hidden rounded-xl border text-left transition-all"
                    style={{
                      borderColor: on ? 'var(--color-accent-2)' : 'var(--color-line-2)',
                      boxShadow: on ? '0 0 0 1px var(--color-accent-2)' : undefined,
                    }}
                  >
                    {/* mini mock of the app in that theme */}
                    <div className="relative h-[64px] p-2" style={{ background: bg }}>
                      <div className="flex h-full gap-1.5">
                        <div className="w-1/3 rounded-md" style={{ background: panel }}>
                          <div className="m-1.5 h-1 w-3/4 rounded-full" style={{ background: a2, opacity: 0.7 }} />
                          <div className="mx-1.5 h-1 w-1/2 rounded-full" style={{ background: a1, opacity: 0.5 }} />
                        </div>
                        <div className="flex flex-1 flex-col gap-1 rounded-md p-1.5" style={{ background: panel }}>
                          <div className="h-1 w-2/3 rounded-full" style={{ background: a1, opacity: 0.8 }} />
                          <div className="h-1 w-1/2 rounded-full" style={{ background: a2, opacity: 0.6 }} />
                          <div className="mt-auto ml-auto h-2.5 w-8 rounded" style={{ background: `linear-gradient(135deg, ${a1}, ${a2})` }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-panel-2 px-2.5 py-1.5 text-[12px]">
                      <span className="flex-1">{th.name}</span>
                      {!th.dark && <span className="text-[10px] text-faint">{t('claro')}</span>}
                      {on && <Check size={13} className="text-accent-2" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section icon={Type} title={t('Fuente de la interfaz')}>
            <div className="grid grid-cols-3 gap-2">
              {UI_FONTS.map((f) => (
                <Choice key={f.id} active={prefs.uiFont === f.id} onClick={() => setPrefs({ uiFont: f.id })}>
                  <span className="text-[14px]" style={{ fontFamily: f.css }}>
                    {f.name}
                  </span>
                </Choice>
              ))}
            </div>
          </Section>

          <Section icon={Code2} title={t('Fuente del código')}>
            <div className="grid grid-cols-2 gap-2">
              {MONO_FONTS.map((f) => (
                <Choice key={f.id} active={prefs.monoFont === f.id} onClick={() => setPrefs({ monoFont: f.id })}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-dim">{f.name}</span>
                    <span className="block truncate text-[12.5px]" style={{ fontFamily: f.css }}>
                      <span className="text-keyword">query</span> <span className="text-field">user</span>(id: <span className="text-arg">$id</span>) {'{ … }'}
                    </span>
                  </span>
                </Choice>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="w-[150px] text-[12px] text-dim">{t('Tamaño en el editor')}</span>
              <input
                type="range"
                min={11}
                max={18}
                step={0.5}
                value={prefs.editorFontSize}
                onChange={(e) => setPrefs({ editorFontSize: Number(e.target.value) })}
                className="flex-1 accent-accent-2"
              />
              <span className="w-12 text-right font-mono text-[11.5px] text-dim">{prefs.editorFontSize}px</span>
            </div>
          </Section>

          <Section icon={ZoomIn} title={t('Escala de la interfaz')}>
            <div className="seg">
              {SCALES.map((s) => (
                <button key={s} className="font-mono text-[12px]" data-active={prefs.uiScale === s} onClick={() => setPrefs({ uiScale: s })}>
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <button className="btn btn-ghost text-[12px] text-dim" onClick={() => setPrefs({ ...DEFAULT_PREFS, lang: prefs.lang })}>
            <RotateCcw size={13} /> {t('Restablecer apariencia')}
          </button>
          <span className="text-[11px] text-faint">© {new Date().getFullYear()} jadkorr</span>
          <button className="btn btn-primary" onClick={onClose}>
            {t('Listo')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:bg-hover"
      style={{
        borderColor: active ? 'var(--color-accent-2)' : 'var(--color-line-2)',
        background: active ? 'color-mix(in oklab, var(--color-accent-2) 10%, transparent)' : undefined,
      }}
    >
      {children}
      {active && <Check size={13} className="ml-auto flex-none text-accent-2" />}
    </button>
  )
}
