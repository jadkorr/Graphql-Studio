/* Appearance preferences: themes, fonts and sizes, applied as CSS variables on <html>. */
import { useEffect } from 'react'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/geist'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource-variable/manrope'
import '@fontsource-variable/fira-code'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/source-code-pro'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import { useStore, type ThemeId } from '../store'

export interface ThemeDef {
  id: ThemeId
  name: string
  dark: boolean
  /** swatches for the picker: bg, panel, accent, accent-2 */
  swatch: [string, string, string, string]
}

export const THEMES: ThemeDef[] = [
  { id: 'studio', name: 'Studio', dark: true, swatch: ['#07070d', '#131322', '#e535ab', '#8b5cf6'] },
  { id: 'ocean', name: 'Ocean', dark: true, swatch: ['#050a12', '#0e1829', '#22d3ee', '#3b82f6'] },
  { id: 'forest', name: 'Forest', dark: true, swatch: ['#050c09', '#0e1b15', '#a3e635', '#10b981'] },
  { id: 'ember', name: 'Ember', dark: true, swatch: ['#0d0806', '#1d1410', '#fb923c', '#f43f5e'] },
  { id: 'graphite', name: 'Graphite', dark: true, swatch: ['#0a0a0b', '#17171a', '#e4e4e7', '#a1a1aa'] },
  { id: 'light', name: 'Light', dark: false, swatch: ['#f4f4f9', '#ffffff', '#d0279b', '#7c3aed'] },
]

const SYS_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const SYS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const UI_FONTS = [
  { id: 'inter', name: 'Inter', css: `'Inter Variable', ${SYS_SANS}` },
  { id: 'geist', name: 'Geist', css: `'Geist Variable', ${SYS_SANS}` },
  { id: 'plex', name: 'IBM Plex Sans', css: `'IBM Plex Sans Variable', ${SYS_SANS}` },
  { id: 'manrope', name: 'Manrope', css: `'Manrope Variable', ${SYS_SANS}` },
  { id: 'system', name: 'System', css: SYS_SANS },
]

export const MONO_FONTS = [
  { id: 'jetbrains', name: 'JetBrains Mono', css: `'JetBrains Mono Variable', ${SYS_MONO}` },
  { id: 'fira', name: 'Fira Code', css: `'Fira Code Variable', ${SYS_MONO}` },
  { id: 'geist-mono', name: 'Geist Mono', css: `'Geist Mono Variable', ${SYS_MONO}` },
  { id: 'plex-mono', name: 'IBM Plex Mono', css: `'IBM Plex Mono', ${SYS_MONO}` },
  { id: 'source', name: 'Source Code Pro', css: `'Source Code Pro Variable', ${SYS_MONO}` },
  { id: 'system-mono', name: 'System', css: SYS_MONO },
]

export const isDarkTheme = (id: ThemeId) => THEMES.find((t) => t.id === id)?.dark ?? true

/** Keep <html> in sync with the stored preferences. */
export function usePrefsEffect() {
  const prefs = useStore((s) => s.prefs)
  useEffect(() => {
    const el = document.documentElement
    if (prefs.theme === 'studio') el.removeAttribute('data-theme')
    else el.setAttribute('data-theme', prefs.theme)
    el.style.setProperty('--font-sans', (UI_FONTS.find((f) => f.id === prefs.uiFont) ?? UI_FONTS[0]).css)
    el.style.setProperty('--font-mono', (MONO_FONTS.find((f) => f.id === prefs.monoFont) ?? MONO_FONTS[0]).css)
    el.style.setProperty('--editor-size', `${prefs.editorFontSize}px`)
    el.style.zoom = prefs.uiScale === 1 ? '' : String(prefs.uiScale)
    el.lang = prefs.lang
  }, [prefs])
}
