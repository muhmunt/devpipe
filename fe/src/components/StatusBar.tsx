import { useEffect, useState } from 'react'
import { ArrowRight, GitBranch } from 'lucide-react'
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

// Shows the worktree's own branch and the branch it is measured against.
// The base is editable because every diff, status and stat in the app is
// calculated against it, so it should not be invisible.
export function StatusBar({ worktree, onChange }: { worktree: Worktree; onChange: (wt: Worktree) => void }) {
  const [branches, setBranches] = useState<string[]>([])
  const base = worktree.targetBranch ?? 'main'

  useEffect(() => {
    api.listBranches(worktree.repositoryId).then(setBranches).catch(() => setBranches([]))
  }, [worktree.repositoryId])

  async function setBase(next: string) {
    if (next === base) return
    onChange(await api.updateWorktree(worktree.id, { targetBranch: next }))
  }

  return (
    <div className="flex items-center justify-between w-full gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <GitBranch size={11} className="text-text-faint shrink-0" />
        <span className="font-mono text-text-muted truncate">{worktree.branch}</span>
        <span className={`font-mono shrink-0 ${STATUS_COLOR[worktree.status]}`}>{worktree.status}</span>

        {worktree.kind !== 'primary' && (
          <>
            <ArrowRight size={10} className="text-text-faint shrink-0" />
            <label className="sr-only" htmlFor="base-branch">
              Base branch
            </label>
            <select
              id="base-branch"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="bg-transparent font-mono text-text-muted hover:text-text outline-none cursor-pointer max-w-[160px]"
              title="Branch this worktree is compared against"
            >
              {(branches.length ? branches : [base]).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <GitActionBar worktree={worktree} onChange={onChange} compact />
    </div>
  )
}
