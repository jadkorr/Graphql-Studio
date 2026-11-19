import { buildClientSchema, printSchema, type IntrospectionQuery } from 'graphql'
import { useStore } from '../store'
import { buildFromSDL, fileToSDL } from './schema'
import { introspect } from './request'
import { tr } from './i18n'

const ACCEPT = /\.(graphql|graphqls|gql|sdl|json|txt)$/i

export async function importFiles(files: FileList | File[]) {
  const st = useStore.getState()
  let ok = 0
  for (const f of Array.from(files)) {
    if (!ACCEPT.test(f.name)) {
      st.toast(tr('Formato no soportado: {name}', { name: f.name }), 'err')
      continue
    }
    try {
      const sdl = fileToSDL(await f.text())
      const built = buildFromSDL(sdl)
      if (!built.schema) throw new Error(built.error ?? tr('Esquema inválido'))
      st.addSchema({ name: f.name.replace(/\.(graphqls?|gql|sdl|json|txt)$/i, ''), sdl, source: 'file' })
      if (built.warning) st.toast(tr('Esquema cargado sin validar: {msg}', { msg: built.warning }), 'info')
      ok++
    } catch (e) {
      st.toast(`${f.name}: ${(e as Error).message}`, 'err')
    }
  }
  if (ok) st.toast(tr('{n} esquema(s) cargado(s)', { n: ok }), 'ok')
}

export function importSDL(name: string, text: string) {
  const st = useStore.getState()
  try {
    const sdl = fileToSDL(text)
    const built = buildFromSDL(sdl)
    if (!built.schema) throw new Error(built.error ?? tr('Esquema inválido'))
    st.addSchema({ name: name || tr('Esquema pegado'), sdl, source: 'paste' })
    st.toast(tr('Esquema cargado'), 'ok')
    return true
  } catch (e) {
    st.toast((e as Error).message, 'err')
    return false
  }
}

export async function importFromEndpoint() {
  const st = useStore.getState()
  const headers = st.settings.headers.filter((h) => h.enabled && h.key.trim()).length
  if (
    !confirm(
      tr(st.settings.upstreamEnabled ? 'INTROSPECTION_CONFIRM_UPSTREAM' : 'INTROSPECTION_CONFIRM', { url: st.settings.url, n: headers }),
    )
  )
    return
  try {
    const data = (await introspect(st.settings)) as IntrospectionQuery
    const sdl = printSchema(buildClientSchema(data))
    let host = st.settings.url
    try {
      host = new URL(st.settings.url).host
    } catch {
      /* noop */
    }
    st.addSchema({ name: host, sdl, source: 'introspection' })
    st.toast(tr('Esquema obtenido por introspección'), 'ok')
  } catch (e) {
    st.toast(tr('Introspección falló: {msg}', { msg: (e as Error).message }), 'err')
  }
}
