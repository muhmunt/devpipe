/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { GitCommitHorizontal } from 'lucide-react'
import { DiffView } from '@/components/DiffView'
import { FilesPanel } from '@/components/FilesPanel'
import { RepoScriptsPanel } from '@/components/RepoScriptsPanel'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import type { Commit, Repository } from '@/lib/types'

function CommitsList({ worktreeId }: { worktreeId: string }) {
  const [commits, setCommits] = useState<Commit[] | null>(null)

  useEffect(() => {
    setCommits(null)
    api.listCommits(worktreeId).then(setCommits).catch(() => setCommits([]))
  }, [worktreeId])

  if (!commits) return <SkeletonRows rows={6} className="p-2" />
  if (commits.length === 0) return <p className="p-3 text-[12px] text-text-faint">No commits yet.</p>

  return (
    <ul>
      {commits.map((c) => (
        <li key={c.hash} className="flex items-start gap-2 px-3 py-1.5 hover:bg-surface-hover transition-colors">
          <GitCommitHorizontal size={12} className="text-text-faint mt-[3px] shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[12px]">{c.message}</p>
            <p className="text-[11px] font-mono text-text-faint tnum">
              {c.hash} · {c.author} · {c.date}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

type PanelTab = 'files' | 'changes' | 'commits' | 'scripts'

// Right panel per the reference: pill tabs carrying live counts, dense rows.
// "Checks" and "Review" from the reference are deliberately absent: devpipe
// has no CI or review integration, so those tabs would have nothing behind
// them.
export function RightPanel({
  worktreeId,
  repository,
  onRepositoryChange,
  onOpenFile,
}: {
  worktreeId: string
  repository: Repository | null
  onRepositoryChange: (r: Repository) => void
  onOpenFile: (path: string) => void
}) {
  const [tab, setTab] = useState<PanelTab>('files')
  const [changeCount, setChangeCount] = useState<number | null>(null)

  useEffect(() => {
    setChangeCount(null)
    api
      .diffWorktree(worktreeId)
      .then((d) => setChangeCount(d.files.length))
      .catch(() => setChangeCount(null))
  }, [worktreeId])

  const tabs: { key: PanelTab; label: string; count?: number | null }[] = [
    { key: 'files', label: 'Files' },
    { key: 'changes', label: 'Changes', count: changeCount },
    { key: 'commits', label: 'Commits' },
    { key: 'scripts', label: 'Scripts' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 h-9 shrink-0 border-b border-border" role="tablist">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`px-2 py-0.5 rounded-md text-[12px] active:translate-y-px transition-colors ${
                active ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {t.label}
              {t.count != null && <span className="ml-1 text-text-faint tnum">{t.count}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'files' && <FilesPanel worktreeId={worktreeId} onOpenFile={onOpenFile} />}
        {tab === 'changes' && <DiffView worktreeId={worktreeId} />}
        {tab === 'commits' && <CommitsList worktreeId={worktreeId} />}
        {tab === 'scripts' &&
          (repository ? (
            <div className="p-2">
              <RepoScriptsPanel repository={repository} worktreeId={worktreeId} onRepositoryChange={onRepositoryChange} />
            </div>
          ) : (
            <SkeletonRows rows={4} className="p-2" />
          ))}
      </div>
    </div>
  )
}
