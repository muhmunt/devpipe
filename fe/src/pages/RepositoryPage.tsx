import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { GitBranch, Settings2, Star } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import { addTab } from '@/lib/tabs'
import { relativeTime } from '@/lib/time'
import type { Repository, Worktree } from '@/lib/types'

const STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'bg-success',
  modified: 'bg-warning',
  conflicted: 'bg-error',
  ahead: 'bg-accent',
  behind: 'bg-text-faint',
}

// Overview of a workspace's repositories and their worktrees. Creating
// projects and worktrees happens in the sidebar, so this page reads rather
// than duplicating those forms.
export default function RepositoryPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [repos, setRepos] = useState<Repository[] | null>(null)
  const [worktrees, setWorktrees] = useState<Record<string, Worktree[]>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    api
      .listRepositories(workspaceId)
      .then(async (rs) => {
        setRepos(rs)
        const pairs = await Promise.all(rs.map((r) => api.listWorktrees(r.id).then((w) => [r.id, w] as const)))
        setWorktrees(Object.fromEntries(pairs))
      })
      .catch((e) => {
        setError(String((e as Error).message ?? e))
        setRepos([])
      })
  }, [workspaceId])

  return (
    <AppShell>
      <div className="h-full flex flex-col min-h-0">
        <header className="shrink-0 px-6 h-11 flex items-center justify-between border-b border-border">
          <h1 className="font-medium">Projects</h1>
          <Link
            to={`/workspaces/${workspaceId}/observability`}
            className="text-text-muted hover:text-text transition-colors"
          >
            Observability
          </Link>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full max-w-[760px] px-6 py-6 space-y-4">
            {error && (
              <p role="alert" className="text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-2">
                {error}
              </p>
            )}

            {!repos ? (
              <SkeletonRows rows={4} />
            ) : repos.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg px-4 py-10 text-center">
                <p className="text-text-muted">No projects in this workspace.</p>
                <p className="text-text-faint text-[12px] mt-1">Add one from the sidebar.</p>
              </div>
            ) : (
              repos.map((repo) => (
                <section key={repo.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{repo.name}</div>
                      <div className="text-[12px] text-text-faint font-mono truncate">{repo.localPath}</div>
                    </div>
                    <Link
                      to={`/repositories/${repo.id}/settings`}
                      className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                      aria-label={`${repo.name} settings`}
                    >
                      <Settings2 size={14} />
                    </Link>
                  </div>

                  <ul className="divide-y divide-border">
                    {(worktrees[repo.id] ?? []).map((wt) => (
                      <li key={wt.id}>
                        <Link
                          to={`/worktrees/${wt.id}`}
                          onClick={() => addTab({ id: wt.id, branch: wt.branch })}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-surface-hover transition-colors"
                        >
                          <span className={`size-1.5 rounded-full shrink-0 ${STATUS_COLOR[wt.status]}`} aria-hidden />
                          <GitBranch size={11} className="shrink-0 text-text-faint" />
                          <span className="font-mono text-[12px] truncate">{wt.branch}</span>
                          {wt.kind === 'primary' && <Star size={10} className="shrink-0 text-warning" aria-label="main" />}
                          <span className="ml-auto shrink-0 flex items-center gap-2">
                            {(wt.additions || wt.deletions) && (
                              <span className="font-mono text-[11px] tnum">
                                <span className="text-success">+{wt.additions ?? 0}</span>{' '}
                                <span className="text-error">-{wt.deletions ?? 0}</span>
                              </span>
                            )}
                            <span className="text-text-faint text-[11px]">{relativeTime(wt.updatedAt)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                    {(worktrees[repo.id] ?? []).length === 0 && (
                      <li className="px-4 py-3 text-[12px] text-text-faint">No worktrees yet</li>
                    )}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
