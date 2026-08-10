import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Diff } from '@/lib/types'

const STATUS_COLOR: Record<string, string> = {
  added: 'text-success',
  deleted: 'text-error',
  renamed: 'text-warning',
  modified: 'text-text-muted',
}

// spec §23 diff review surface. Only the file list + unified diff text are
// backed by a real endpoint (Rung 3's git::diff) — approve/comment/revert
// actions from the spec's example are NOT built here since no backend
// endpoint exists for them yet; showing those buttons would be dead UI.
export function DiffView({ worktreeId }: { worktreeId: string }) {
  const [diff, setDiff] = useState<Diff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .diffWorktree(worktreeId)
      .then(setDiff)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [worktreeId])

  if (loading) return <p className="text-sm text-text-muted p-4">Loading diff...</p>
  if (error) return <p className="text-sm text-error p-4">{error}</p>
  if (!diff || diff.files.length === 0) return <p className="text-sm text-text-muted p-4">No changes relative to target branch.</p>

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-surface text-xs text-text-muted font-mono">
        {diff.files.length} file{diff.files.length === 1 ? '' : 's'} changed
      </div>
      <div className="divide-y divide-border">
        {diff.files.map((f) => (
          <div key={f.path} className="px-4 py-2 flex items-center gap-2 text-sm font-mono">
            <span className={STATUS_COLOR[f.status] ?? 'text-text-muted'}>{f.status}</span>
            <span className="flex-1 truncate">{f.path}</span>
            <span className="text-success text-xs">+{f.additions}</span>
            <span className="text-error text-xs">-{f.deletions}</span>
          </div>
        ))}
      </div>
      <pre className="p-4 text-xs font-mono overflow-x-auto bg-surface-elevated whitespace-pre-wrap max-h-[500px] overflow-y-auto">
        {diff.diff || '(no textual diff)'}
      </pre>
    </div>
  )
}
