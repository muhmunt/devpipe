/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { ArrowRight, GitBranch, Loader2 } from 'lucide-react'
import { GitActionBar } from '@/components/GitActionBar'
import { api } from '@/lib/api'
import type { Worktree } from '@/lib/types'

const STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'text-success',
  modified: 'text-warning',
  conflicted: 'text-error',
  ahead: 'text-accent',
  behind: 'text-text-muted',
}

// Reads as one sentence: this branch, measured against that one. Both ends
// are live controls — the left switches what's checked out here, the right
// switches what every diff, status and `+N -M` in the app is calculated
// against. Neither should be a label you can't act on.
export function StatusBar({ worktree, onChange }: { worktree: Worktree; onChange: (wt: Worktree) => void }) {
  const [branches, setBranches] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = worktree.targetBranch ?? 'main'

  useEffect(() => {
    api.listBranches(worktree.repositoryId).then(setBranches).catch(() => setBranches([]))
  }, [worktree.repositoryId])

  async function setBase(next: string) {
    if (next === base) return
    setError(null)
    try {
      onChange(await api.updateWorktree(worktree.id, { targetBranch: next }))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  // Git refuses a checkout that would discard uncommitted work, or one onto
  // a branch another worktree already holds. Those refusals are the honest
  // answer, so they're surfaced verbatim instead of being swallowed.
  async function checkout(next: string) {
    if (next === worktree.branch) return
    setBusy(true)
    setError(null)
    try {
      onChange(await api.checkoutWorktree(worktree.id, next))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const options = branches.length ? branches : [worktree.branch]

  return (
    <div className="flex items-center justify-between w-full gap-3 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {busy ? (
          <Loader2 size={11} className="text-text-faint shrink-0 animate-spin" />
        ) : (
          <GitBranch size={11} className="text-text-faint shrink-0" />
        )}

        <span className="text-text-faint shrink-0 hidden sm:inline">on</span>
        <label className="sr-only" htmlFor="current-branch">
          Branch checked out here
        </label>
        <select
          id="current-branch"
          value={worktree.branch}
          disabled={busy}
          onChange={(e) => checkout(e.target.value)}
          title="Switch which branch this worktree has checked out"
          className="bg-transparent font-mono text-text hover:text-text outline-none cursor-pointer max-w-[180px] min-w-0 truncate disabled:opacity-50"
        >
          {(options.includes(worktree.branch) ? options : [worktree.branch, ...options]).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <span className={`font-mono shrink-0 ${STATUS_COLOR[worktree.status]}`}>{worktree.status}</span>

        <ArrowRight size={10} className="text-text-faint shrink-0" />
        <span className="text-text-faint shrink-0 hidden sm:inline">target</span>
        <label className="sr-only" htmlFor="base-branch">
          Base branch
        </label>
        <select
          id="base-branch"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          className="bg-transparent font-mono text-text-muted hover:text-text outline-none cursor-pointer max-w-[160px] min-w-0 truncate"
          title="Branch this worktree is compared against"
        >
          {(options.includes(base) ? options : [base, ...options]).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {error && (
          <span role="alert" className="text-error truncate min-w-0" title={error}>
            {error}
          </span>
        )}
      </div>

      <GitActionBar worktree={worktree} onChange={onChange} compact />
    </div>
  )
}
