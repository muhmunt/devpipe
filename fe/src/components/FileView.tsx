/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { CodeBlock } from '@/components/CodeBlock'
import { CopyButton } from '@/components/CopyButton'
import { DiffLines, splitDiffByFile } from '@/components/DiffView'
import { api } from '@/lib/api'
import { languageForPath } from '@/lib/highlight'

type Mode = 'code' | 'diff'

// A file tab, in two readings: the file as it stands, and what this branch
// did to it. The diff tab only appears when there is one — offering an empty
// "Diff" on an untouched file would be a control that does nothing.
export function FileView({ worktreeId, path }: { worktreeId: string; path: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [patch, setPatch] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('code')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setContent(null)
    setPatch(null)
    setMode('code')
    setError(null)
    api
      .readFile(worktreeId, path)
      .then((r) => setContent(r.content))
      .catch((e) => setError(String((e as Error).message ?? e)))
    // The whole-branch diff is already what the Changes panel fetches, so
    // this is a cache hit in practice; slicing it here avoids a per-file
    // endpoint that would only re-derive the same thing.
    api
      .diffWorktree(worktreeId)
      .then((d) => setPatch(splitDiffByFile(d.diff)[path] ?? null))
      .catch(() => setPatch(null))
  }, [worktreeId, path])

  const language = languageForPath(path)

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0">
      <header className="shrink-0 px-3 h-8 flex items-center gap-2 border-b border-border bg-surface-elevated">
        <span className="text-[11px] font-mono text-text-muted truncate">{path}</span>

        {patch && (
          <div className="ml-auto flex items-center gap-0.5 shrink-0" role="tablist">
            {(['code', 'diff'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                  mode === m ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text'
                }`}
              >
                {m === 'code' ? 'Code' : 'Changes'}
              </button>
            ))}
          </div>
        )}

        {content != null && (
          <div className={patch ? 'shrink-0' : 'ml-auto shrink-0'}>
            <CopyButton text={mode === 'diff' && patch ? patch : content} label="Copy file" className="!opacity-100" />
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 min-w-0 overflow-auto bg-surface">
        {error && <p className="p-3 text-[12px] text-error">{error}</p>}
        {!error && content == null && <p className="p-3 text-[12px] text-text-faint">Loading…</p>}

        {!error && content != null && mode === 'code' && (
          <CodeBlock code={content} language={language} lineNumbers className="border-0 rounded-none bg-surface" />
        )}

        {!error && mode === 'diff' && patch && (
          <div className="py-2">
            <DiffLines diff={patch} />
          </div>
        )}
      </div>
    </div>
  )
}
