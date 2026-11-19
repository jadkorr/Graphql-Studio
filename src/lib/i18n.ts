/* Minimal i18n: Spanish source strings are the keys; EN holds the translations.
   Missing keys fall back to the Spanish text, so nothing ever renders blank. */
import { useCallback } from 'react'
import { useStore, type Lang } from '../store'
import { EN, ES_SYMBOLIC } from './i18n.en'

type Vars = Record<string, string | number>

export function translate(text: string, lang: Lang, vars?: Vars) {
  let out = lang === 'en' ? (EN[text] ?? text) : (ES_SYMBOLIC[text] ?? text)
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return out
}

/** For non-React code (toasts, errors): reads the current language from the store. */
export const tr = (text: string, vars?: Vars) => translate(text, useStore.getState().prefs.lang, vars)

/** React hook: re-renders the component when the language changes. */
export function useT() {
  const lang = useStore((s) => s.prefs.lang)
  return useCallback((text: string, vars?: Vars) => translate(text, lang, vars), [lang])
}
