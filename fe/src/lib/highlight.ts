/* devpipe · design-system: design.md */
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// highlight.js ships ~190 grammars; importing the bundle would cost more
// than the rest of the app. Only languages this project could plausibly show
// are registered, and anything unregistered renders as plain monospace
// rather than as a crash or as wrong colours.
const LANGUAGES: Record<string, unknown> = {
  bash,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  ruby,
  rust,
  sql,
  typescript,
  xml,
  yaml,
}

for (const [name, lang] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, lang as Parameters<typeof hljs.registerLanguage>[1])
}

// Aliases for the names people (and agents) actually write in fences.
const ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  rs: 'rust',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  md: 'markdown',
  scss: 'css',
  golang: 'go',
}

export function resolveLanguage(name?: string): string | undefined {
  if (!name) return undefined
  const key = name.toLowerCase().trim()
  const resolved = ALIASES[key] ?? key
  return hljs.getLanguage(resolved) ? resolved : undefined
}

/** File extension → language, for file tabs where there's no fence to read. */
export function languageForPath(path: string): string | undefined {
  const ext = path.split('.').pop()
  return ext && ext !== path ? resolveLanguage(ext) : undefined
}

/**
 * Returns highlighted HTML, or null when the language is unknown.
 *
 * highlight.js escapes the source it emits, so the result is safe to insert;
 * `ignoreIllegals` keeps a half-written snippet (very common mid-stream)
 * from throwing and blanking the block.
 */
export function highlightToHtml(code: string, language?: string): string | null {
  const resolved = resolveLanguage(language)
  if (!resolved) return null
  try {
    return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
  } catch {
    return null
  }
}
