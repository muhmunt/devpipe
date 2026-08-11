/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// Read-only viewer backing a file tab (SessionTabs' 'file' kind). No syntax
// highlighting — plain monospace, styled like the tool_output blocks already
// used in the chat transcript (surface-elevated panel, bordered header) so a
// file tab and a chat tab read as the same product, not two bolted-together
// UIs. Code intentionally doesn't wrap — horizontal scroll is the expected
// behavior for source, same as GitHub/any code viewer.
export function FileView({ worktreeId, path }: { worktreeId: string; path: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setContent(null)
    setError(null)
    api
      .readFile(worktreeId, path)
      .then((r) => setContent(r.content))
      .catch((e) => setError(String((e as Error).message ?? e)))
  }, [worktreeId, path])

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0">
      <header className="shrink-0 px-3 h-8 flex items-center border-b border-border bg-surface-elevated">
        <span className="text-[11px] font-mono text-text-muted truncate">{path}</span>
      </header>
      <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-surface">
        {error && <p className="p-3 text-[12px] text-error">{error}</p>}
        {!error && content == null && <p className="p-3 text-[12px] text-text-faint">Loading…</p>}
        {!error && content != null && (
          <pre className="min-w-fit p-3 text-[12px] leading-relaxed">
            <code className="font-mono whitespace-pre text-text">{content}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
