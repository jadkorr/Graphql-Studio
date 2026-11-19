import { useEffect, useRef } from 'react'
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder as ph } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, HighlightStyle, foldKeymap } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { json } from '@codemirror/lang-json'
import { tags as t } from '@lezer/highlight'
import { graphql, updateSchema } from 'cm6-graphql'
import type { GraphQLSchema } from 'graphql'

// colors come from CSS variables so every theme (including light) restyles the editor
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.definitionKeyword, t.operatorKeyword, t.modifier], color: 'var(--syn-keyword)', fontWeight: '500' },
  { tag: [t.propertyName], color: 'var(--syn-prop)' },
  { tag: [t.variableName, t.special(t.variableName)], color: 'var(--syn-var)' },
  { tag: [t.definition(t.variableName), t.function(t.variableName)], color: 'var(--syn-def)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.attributeName, t.meta], color: 'var(--syn-attr)' },
  { tag: [t.punctuation, t.bracket, t.separator, t.brace, t.paren, t.squareBracket], color: 'var(--syn-punct)' },
  { tag: [t.name], color: 'var(--syn-prop)' },
])

const baseTheme = EditorView.theme({
  '.cm-content': { padding: '10px 0' },
  '.cm-line': { padding: '0 14px 0 6px' },
})

interface Props {
  value: string
  onChange?: (v: string) => void
  language: 'graphql' | 'json'
  schema?: GraphQLSchema | null
  readOnly?: boolean
  onRun?: () => void
  onPrettify?: () => void
  onShowInDocs?: (type?: string) => void
  placeholder?: string
  lineNumbers?: boolean
}

export default function CodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cbs = useRef(props)
  cbs.current = props
  const roComp = useRef(new Compartment())

  useEffect(() => {
    const lang: Extension =
      props.language === 'graphql'
        ? graphql(props.schema ?? undefined, {
            onShowInDocs: (field, type, parentType) => cbs.current.onShowInDocs?.(type ?? parentType ?? field),
          })
        : json()
    const runKeys = Prec.highest(
      keymap.of([
        { key: 'Mod-Enter', run: () => (cbs.current.onRun?.(), true) },
        { key: 'Shift-Mod-p', run: () => (cbs.current.onPrettify?.(), true) },
      ]),
    )
    const state = EditorState.create({
      doc: props.value,
      extensions: [
        runKeys,
        props.lineNumbers === false ? [] : [lineNumbers(), highlightActiveLineGutter(), foldGutter()],
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        autocompletion({ icons: false }),
        syntaxHighlighting(highlight),
        baseTheme,
        EditorView.lineWrapping,
        props.placeholder ? ph(props.placeholder) : [],
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
        lang,
        roComp.current.of([EditorState.readOnly.of(!!props.readOnly), EditorView.editable.of(!props.readOnly)]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbs.current.onChange?.(u.state.doc.toString())
        }),
      ],
    })
    const v = new EditorView({ state, parent: host.current! })
    view.current = v
    return () => v.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.language])

  // external value changes (builder, tab switch, history)
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur !== props.value) v.dispatch({ changes: { from: 0, to: cur.length, insert: props.value } })
  }, [props.value])

  useEffect(() => {
    if (view.current && props.language === 'graphql') updateSchema(view.current, props.schema ?? undefined)
  }, [props.schema, props.language])

  useEffect(() => {
    view.current?.dispatch({
      effects: roComp.current.reconfigure([EditorState.readOnly.of(!!props.readOnly), EditorView.editable.of(!props.readOnly)]),
    })
  }, [props.readOnly])

  return <div ref={host} className="h-full w-full overflow-hidden" />
}
