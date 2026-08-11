/* devpipe · design-system: design.md */
import { useState } from 'react'
import { api } from '@/lib/api'
import type { Worktree } from '@/lib/types'

// spec §24 — one smart action driven by worktree git state, not a menu of
// commands to remember. Only wired to real endpoints (commit, push);
// create-PR/review/merge from the spec's example flow need a GitHub
// integration that doesn't exist yet, so they're not shown as buttons.
// `compact`: renders inline for the bottom status bar instead of a
// bordered block for the worktree page body.
export function GitActionBar({
  worktree,
  onChange,
  compact = false,
}: {
  worktree: Worktree
  onChange: (wt: Worktree) => void
  compact?: boolean
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit() {
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api.commitWorktree(worktree.id, message.trim())
      setMessage('')
      onChange(updated)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function push() {
    setBusy(true)
    setError(null)
    try {
      onChange(await api.pushWorktree(worktree.id))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const wrapperClass = compact ? 'flex items-center gap-2' : 'border border-border rounded-lg p-3 mb-4 bg-surface space-y-2';
  const inputClass = compact
    ? 'bg-surface-elevated border border-border rounded px-2 py-0.5 text-xs outline-none focus:border-accent'
    : 'flex-1 bg-surface-elevated border border-border rounded-md px-2 py-1.5 text-sm outline-none focus:border-accent'
  const buttonClass = compact
    ? 'bg-action-strong text-white px-2 py-0.5 rounded text-xs disabled:opacity-50'
    : 'bg-action-strong text-white px-3 py-1.5 rounded-md text-sm disabled:opacity-50'

  if (worktree.status === 'conflicted') {
    return compact ? (
      <span className="text-error text-xs">Conflicted. Resolve manually.</span>
    ) : (
      <div className="border border-error/40 bg-error/10 rounded-md px-3 py-2 text-sm text-error mb-4">
        Conflicted. Resolve manually in the worktree, then refresh status. Automatic conflict resolution is not
        supported.
      </div>
    )
  }

  if (worktree.status === 'behind' || worktree.status === 'clean') {
    return null
  }

  return (
    <div className={wrapperClass}>
      {error && <p className="text-error text-xs">{error}</p>}
      {worktree.status === 'modified' && (
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
            className={inputClass}
          />
          <button type="button" onClick={commit} disabled={busy || !message.trim()} className={buttonClass}>
            Commit
          </button>
        </div>
      )}
      {worktree.status === 'ahead' && (
        <button type="button" onClick={push} disabled={busy} className={buttonClass}>
          Push
        </button>
      )}
    </div>
  )
}
