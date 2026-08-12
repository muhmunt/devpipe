/* devpipe · design-system: design.md */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { highlightToHtml, resolveLanguage } from '@/lib/highlight'

// Agent output is untrusted text, so it is parsed then sanitised before it
// ever reaches innerHTML. Both libraries are existing project dependencies.
//
// Fenced code goes through the same highlighter and the same surface the
// rest of the app uses, and carries its own copy button. The button can't be
// a React component — this subtree is set as HTML, not rendered — so it's
// emitted as markup and handled by one delegated listener, which reads the
// code straight off the sibling <pre> rather than duplicating it into an
// attribute.
const marked = new Marked({
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = resolveLanguage(lang)
      const highlighted = highlightToHtml(text, language)
      // Not highlighted → escape by hand; highlight.js escapes its own output.
      const body = highlighted ?? escapeHtml(text)
      return `<div class="code-surface md-code">
  <button type="button" data-copy aria-label="Copy code" title="Copy code" class="copy-btn">${COPY_ICON}</button>
  <pre><code>${body}</code></pre>
</div>`
    },
  },
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const COPY_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16V4a2 2 0 0 1 2-2h10"/></svg>'

const CHECK_ICON =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

export function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    const parsed = marked.parse(text, { async: false }) as string
    return DOMPurify.sanitize(parsed)
  }, [text])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    async function onClick(e: MouseEvent) {
      const button = (e.target as HTMLElement).closest('[data-copy]')
      if (!(button instanceof HTMLElement)) return
      const code = button.parentElement?.querySelector('pre')?.textContent ?? ''
      try {
        await navigator.clipboard.writeText(code)
        button.innerHTML = CHECK_ICON
        button.setAttribute('aria-label', 'Copied')
        setTimeout(() => {
          button.innerHTML = COPY_ICON
          button.setAttribute('aria-label', 'Copy code')
        }, 1600)
      } catch {
        button.setAttribute('aria-label', 'Copy failed')
      }
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html])

  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * A whole agent turn, with one control to lift the entire reply out —
 * separate from the per-fence buttons, because "copy the answer" and "copy
 * that one snippet" are different intentions.
 */
export function CopyableMarkdown({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group/turn">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">{label}</p>
        <button
          type="button"
          onClick={copyAll}
          aria-label={copied ? 'Copied reply' : 'Copy reply'}
          className="opacity-0 group-hover/turn:opacity-100 focus-visible:opacity-100 text-[11px] text-text-faint hover:text-text transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <Markdown text={text} />
    </div>
  )
}
