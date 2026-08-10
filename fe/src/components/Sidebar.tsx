import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, GitBranch, Plus, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { addTab } from '@/lib/tabs'
import { relativeTime } from '@/lib/time'
import type { Repository, Worktree, Workspace } from '@/lib/types'

/* Worktree git status. Distinct from agent-session status, so it gets its own
   mapping rather than borrowing StatusDot's glyphs, which would misreport it. */
const STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'bg-success',
  modified: 'bg-warning',
  conflicted: 'bg-error',
  ahead: 'bg-accent',
  behind: 'bg-text-faint',
}

/** Derived monogram. Generated from the real name, not a stand-in avatar. */
function Monogram({ name }: { name: string }) {
  return (
    <span
      className="size-[18px] shrink-0 rounded-[5px] bg-surface-hover text-text-muted grid place-items-center text-[10px] font-semibold uppercase"
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  )
}

function DiffStat({ additions, deletions }: { additions?: number; deletions?: number }) {
  if (additions === undefined || deletions === undefined) return null
  if (additions === 0 && deletions === 0) return null
  return (
    <span className="ml-auto shrink-0 font-mono text-[11px] tnum">
      <span className="text-success">+{additions}</span> <span className="text-error">-{deletions}</span>
    </span>
  )
}

// Sidebar per the reference: Workspace > Repository > Worktree, lazily
// expanded. Two-line worktree rows carrying real git diff stats and a
// relative timestamp, with an inset rounded selection pill.
export function Sidebar() {
  const location = useLocation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [openWorkspaces, setOpenWorkspaces] = useState<Set<string>>(new Set())
  const [reposByWs, setReposByWs] = useState<Record<string, Repository[]>>({})
  const [openRepos, setOpenRepos] = useState<Set<string>>(new Set())
  const [worktreesByRepo, setWorktreesByRepo] = useState<Record<string, Worktree[]>>({})

  useEffect(() => {
    api.listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
  }, [])

  async function toggleWorkspace(id: string) {
    setOpenWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!reposByWs[id]) {
      const repos = await api.listRepositories(id)
      setReposByWs((prev) => ({ ...prev, [id]: repos }))
      // Auto-expand a single repository: one click instead of two.
      if (repos.length === 1) toggleRepo(repos[0].id)
    }
  }

  async function toggleRepo(id: string) {
    setOpenRepos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!worktreesByRepo[id]) {
      const worktrees = await api.listWorktrees(id)
      setWorktreesByRepo((prev) => ({ ...prev, [id]: worktrees }))
    }
  }

  return (
    <nav className="flex flex-col h-full" aria-label="Workspaces">
      <div className="flex items-center justify-between px-3 h-9 shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">Projects</span>
        <Link to="/" className="text-text-faint hover:text-text transition-colors" aria-label="New workspace">
          <Plus size={13} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {workspaces.map((ws) => {
          const wsOpen = openWorkspaces.has(ws.id)
          return (
            <div key={ws.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleWorkspace(ws.id)}
                aria-expanded={wsOpen}
                className="w-full flex items-center gap-1.5 px-1.5 h-7 rounded-md hover:bg-surface-hover text-left transition-colors"
              >
                {wsOpen ? (
                  <ChevronDown size={12} className="text-text-faint shrink-0" />
                ) : (
                  <ChevronRight size={12} className="text-text-faint shrink-0" />
                )}
                <Monogram name={ws.name} />
                <span className="truncate font-medium">{ws.name}</span>
              </button>

              {wsOpen &&
                (reposByWs[ws.id] ?? []).map((repo) => {
                  const repoOpen = openRepos.has(repo.id)
                  const worktrees = worktreesByRepo[repo.id] ?? []
                  return (
                    <div key={repo.id}>
                      <button
                        type="button"
                        onClick={() => toggleRepo(repo.id)}
                        aria-expanded={repoOpen}
                        className="w-full flex items-center gap-1.5 pl-5 pr-1.5 h-6 rounded-md hover:bg-surface-hover text-left text-text-muted transition-colors"
                      >
                        {repoOpen ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
                        <span className="truncate text-[12px]">{repo.name}</span>
                      </button>

                      {repoOpen &&
                        worktrees.map((wt) => {
                          const active = location.pathname === `/worktrees/${wt.id}`
                          const isDefault = wt.branch === repo.defaultBranch
                          return (
                            <Link
                              key={wt.id}
                              to={`/worktrees/${wt.id}`}
                              onClick={() => addTab({ id: wt.id, branch: wt.branch })}
                              title={wt.status}
                              aria-current={active ? 'page' : undefined}
                              className={`flex gap-2 items-start pl-5 pr-2 py-1.5 rounded-md transition-colors ${
                                active ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                              }`}
                            >
                              <span
                                className={`mt-[5px] size-1.5 rounded-full shrink-0 ${STATUS_COLOR[wt.status]}`}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1">
                                  <GitBranch size={11} className="shrink-0 text-text-faint" />
                                  <span
                                    className={`truncate font-mono text-[12px] ${active ? 'text-accent' : 'text-text'}`}
                                  >
                                    {wt.branch}
                                  </span>
                                  {isDefault && <Star size={10} className="shrink-0 text-text-faint" aria-label="default branch" />}
                                  <DiffStat additions={wt.additions} deletions={wt.deletions} />
                                </span>
                                <span className="block text-[11px] text-text-faint mt-0.5">{relativeTime(wt.updatedAt)}</span>
                              </span>
                            </Link>
                          )
                        })}

                      {repoOpen && worktrees.length === 0 && (
                        <p className="pl-10 pr-2 py-1 text-[11px] text-text-faint">No worktrees</p>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}

        {workspaces.length === 0 && <p className="px-3 py-2 text-[12px] text-text-faint">No workspaces yet</p>}
      </div>
    </nav>
  )
}
