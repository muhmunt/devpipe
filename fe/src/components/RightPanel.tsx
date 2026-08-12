/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { GitCommitHorizontal } from 'lucide-react'
import { DiffView } from '@/components/DiffView'
import { FilesPanel } from '@/components/FilesPanel'
import { GitActionBar } from '@/components/GitActionBar'
import { RepoScriptsPanel } from '@/components/RepoScriptsPanel'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import type { Commit, Repository, Worktree } from '@/lib/types'

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

type PanelTab = 'changes' | 'files' | 'commits' | 'scripts'

// Right panel per the reference: pill tabs carrying live counts, dense rows.
// "Checks" is deliberately absent — devpipe has no CI integration, so the tab
// would have nothing behind it.
//
// Changes leads, because it's the answer to "what did the agent just do to my
// branch" and that's the question this panel exists for. Reviewing and
// committing sit together there rather than in separate places: nobody
// commits without looking, and looking is what the diff is.
export function RightPanel({
  worktreeId,
  worktree,
  repository,
  onWorktreeChange,
  onRepositoryChange,
  onOpenFile,
}: {
  worktreeId: string
  worktree: Worktree | null
  repository: Repository | null
  onWorktreeChange: (wt: Worktree) => void
  onRepositoryChange: (r: Repository) => void
  onOpenFile: (path: string) => void
}) {
  const [tab, setTab] = useState<PanelTab>('changes')
  const [changeCount, setChangeCount] = useState<number | null>(null)
  // Committing moves files from one section to the other, so the diff has to
  // be re-read afterwards or the panel keeps showing the pre-commit state.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setChangeCount(null)
    api
      .diffWorktree(worktreeId)
      .then((d) => setChangeCount(d.files.length))
      .catch(() => setChangeCount(null))
  }, [worktreeId, reloadKey])

  const tabs: { key: PanelTab; label: string; count?: number | null }[] = [
    { key: 'changes', label: 'Changes', count: changeCount },
    { key: 'files', label: 'Files' },
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
        {tab === 'changes' && (
          <>
            <DiffView worktreeId={worktreeId} reloadKey={reloadKey} />
            {worktree && (
              <div className="p-2 border-t border-border">
                <GitActionBar
                  worktree={worktree}
                  onChange={(wt) => {
                    onWorktreeChange(wt)
                    setReloadKey((k) => k + 1)
                  }}
                />
              </div>
            )}
          </>
        )}
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
