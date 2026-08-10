import { GitBranch } from 'lucide-react'
import { GitActionBar } from '@/components/GitActionBar'
import type { Worktree } from '@/lib/types'

const STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'text-success',
  modified: 'text-warning',
  conflicted: 'text-error',
  ahead: 'text-accent',
  behind: 'text-text-muted',
}

// Bottom status bar (reference screenshot) — branch + git status + the
// real commit/push action. No "Create PR" button: no GitHub integration
// exists to back one, and a button that always fails isn't a feature.
export function StatusBar({ worktree, onChange }: { worktree: Worktree; onChange: (wt: Worktree) => void }) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-1.5 text-text-muted">
        <GitBranch size={12} />
        <span className="font-mono">{worktree.branch}</span>
        <span className={`font-mono ${STATUS_COLOR[worktree.status]}`}>· {worktree.status}</span>
      </div>
      <GitActionBar worktree={worktree} onChange={onChange} compact />
    </div>
  )
}
