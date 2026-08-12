/* devpipe · design-system: design.md */
import { useMemo } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { highlightToHtml } from '@/lib/highlight'

// One code surface used everywhere code appears: chat fences, tool output,
// file tabs. Highlighting is best-effort — an unknown language renders as
// plain monospace rather than as guessed, wrong colours.
export function CodeBlock({
  code,
  language,
  /** Show a 1..n gutter, as a file viewer would. */
  lineNumbers = false,
  /** Long tool output is clipped so one call can't bury the conversation. */
  maxLines,
  className = '',
}: {
  code: string
  language?: string
  lineNumbers?: boolean
  maxLines?: number
  className?: string
}) {
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code])
  const clipped = maxLines != null && lines.length > maxLines
  const shown = clipped ? lines.slice(0, maxLines).join('\n') : code
  const html = useMemo(() => highlightToHtml(shown, language), [shown, language])

  return (
    <div className={`code-surface rounded-md border border-border bg-surface-elevated overflow-hidden ${className}`}>
      <div className="absolute right-1.5 top-1.5 z-10">
        {/* Copies the whole thing, not the clipped view — the point of the
            button is to get the real content out. */}
        <CopyButton text={code} label="Copy code" />
      </div>

      <div className="overflow-x-auto">
        {lineNumbers ? (
          <div className="code-lines text-[12px] font-mono leading-[1.55] py-2">
            <div className="ln tnum px-2">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="px-3 whitespace-pre">
              {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{shown}</code>}
            </pre>
          </div>
        ) : (
          <pre className="px-3 py-2 text-[12px] font-mono leading-[1.55] whitespace-pre">
            {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{shown}</code>}
          </pre>
        )}
      </div>

      {clipped && (
        <p className="border-t border-border px-3 py-1 text-[11px] text-text-faint">
          {lines.length - (maxLines ?? 0)} more lines — copy to see all of it
        </p>
      )}
    </div>
  )
}
