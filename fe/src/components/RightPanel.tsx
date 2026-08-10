import { useEffect, useState } from 'react'
import { GitCommitHorizontal } from 'lucide-react'
import { DiffView } from '@/components/DiffView'
import { FilesPanel } from '@/components/FilesPanel'
import { RepoScriptsPanel } from '@/components/RepoScriptsPanel'
import { api } from '@/lib/api'
import type { Commit, Repository } from '@/lib/types'

function CommitsList({ worktreeId }: { worktreeId: string }) {
  const [commits, setCommits] = useState<Commit[] | null>(null)

  useEffect(() => {
    setCommits(null)
    api.listCommits(worktreeId).then(setCommits)
  }, [worktreeId])

  if (!commits) return <p className="text-xs text-text-muted p-3">Loading...</p>
  if (commits.length === 0) return <p className="text-xs text-text-muted p-3">No commits yet.</p>

  return (
    <div className="divide-y divide-border">
      {commits.map((c) => (
        <div key={c.hash} className="px-3 py-2 flex items-start gap-2">
          <GitCommitHorizontal size={12} className="text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs truncate">{c.message}</div>
            <div className="text-[10px] font-mono text-text-muted">
              {c.hash} · {c.author} · {c.date}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const TABS = ['files', 'diff', 'commits', 'scripts'] as const
type PanelTab = (typeof TABS)[number]

// spec §86 right panel — Files/Changes/Commits (reference's "Review" tab is
// the same diff data as "Changes", so it isn't duplicated as a 4th tab;
// "Checks" is omitted entirely — no CI integration exists to back it, and
// showing an empty tab forever would be worse than not having it).
export function RightPanel({ worktreeId, repository, onRepositoryChange }: { worktreeId: string; repository: Repository | null; onRepositoryChange: (r: Repository) => void }) {
  const [tab, setTab] = useState<PanelTab>('files')

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border text-xs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 capitalize border-b-2 ${
              tab === t ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'files' && <FilesPanel worktreeId={worktreeId} />}
        {tab === 'diff' && (
          <div className="p-2">
            <DiffView worktreeId={worktreeId} />
          </div>
        )}
        {tab === 'commits' && <CommitsList worktreeId={worktreeId} />}
        {tab === 'scripts' && repository && (
          <div className="p-2">
            <RepoScriptsPanel repository={repository} worktreeId={worktreeId} onRepositoryChange={onRepositoryChange} />
          </div>
        )}
      </div>
    </div>
  )
}
