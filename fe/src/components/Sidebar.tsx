import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { addTab } from '@/lib/tabs'
import type { Repository, Worktree, Workspace } from '@/lib/types'

// Worktree git status (clean/modified/conflicted/ahead/behind) — distinct
// from session status (StatusDot), so it gets its own color mapping rather
// than reusing that component's glyphs, which would misrepresent it.
const WORKTREE_STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'bg-success',
  modified: 'bg-warning',
  conflicted: 'bg-error',
  ahead: 'bg-accent',
  behind: 'bg-text-muted',
}

// spec §20 sidebar IA — Workspace -> Repository -> Worktree tree, lazily
// expanded (repos/worktrees only fetched once their parent is opened, not
// eagerly for every workspace on mount). This is the real navigation
// surface AppShell's layout was designed around — previously every page
// passed a static placeholder here instead.
export function Sidebar() {
  const location = useLocation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [openWorkspaces, setOpenWorkspaces] = useState<Set<string>>(new Set())
  const [reposByWs, setReposByWs] = useState<Record<string, Repository[]>>({})
  const [openRepos, setOpenRepos] = useState<Set<string>>(new Set())
  const [worktreesByRepo, setWorktreesByRepo] = useState<Record<string, Worktree[]>>({})

  useEffect(() => {
    api.listWorkspaces().then(setWorkspaces)
  }, [])

  async function toggleWorkspace(id: string) {
    setOpenWorkspaces((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (!reposByWs[id]) {
      const repos = await api.listRepositories(id)
      setReposByWs((prev) => ({ ...prev, [id]: repos }))
    }
  }

  async function toggleRepo(id: string) {
    setOpenRepos((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (!worktreesByRepo[id]) {
      const worktrees = await api.listWorktrees(id)
      setWorktreesByRepo((prev) => ({ ...prev, [id]: worktrees }))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-mono uppercase tracking-wide text-text-muted">Workspaces</span>
        <Link to="/" className="text-text-muted hover:text-text" aria-label="New workspace">
          <Plus size={13} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {workspaces.map((ws) => {
          const wsOpen = openWorkspaces.has(ws.id)
          return (
            <div key={ws.id}>
              <button
                type="button"
                onClick={() => toggleWorkspace(ws.id)}
                className="w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-surface-elevated text-left"
              >
                {wsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Link
                  to={`/workspaces/${ws.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`truncate hover:text-accent ${location.pathname === `/workspaces/${ws.id}` ? 'text-accent' : ''}`}
                >
                  {ws.name}
                </Link>
              </button>
              {wsOpen &&
                (reposByWs[ws.id] ?? []).map((repo) => {
                  const repoOpen = openRepos.has(repo.id)
                  return (
                    <div key={repo.id}>
                      <button
                        type="button"
                        onClick={() => toggleRepo(repo.id)}
                        className="w-full flex items-center gap-1 pl-6 pr-2 py-1 text-sm hover:bg-surface-elevated text-left text-text-muted"
                      >
                        {repoOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        <span className="truncate font-mono text-xs">{repo.name}</span>
                      </button>
                      {repoOpen &&
                        (worktreesByRepo[repo.id] ?? []).map((wt) => (
                          <Link
                            key={wt.id}
                            to={`/worktrees/${wt.id}`}
                            title={wt.status}
                            onClick={() => addTab({ id: wt.id, branch: wt.branch })}
                            className={`flex items-center gap-1.5 pl-10 pr-2 py-1 text-xs font-mono hover:bg-surface-elevated ${
                              location.pathname === `/worktrees/${wt.id}` ? 'bg-surface-elevated text-accent' : 'text-text-muted'
                            }`}
                          >
                            <span className={`size-1.5 rounded-full shrink-0 ${WORKTREE_STATUS_COLOR[wt.status]}`} aria-hidden />
                            <span className="truncate">{wt.branch}</span>
                          </Link>
                        ))}
                      {repoOpen && (worktreesByRepo[repo.id] ?? []).length === 0 && (
                        <div className="pl-10 pr-2 py-1 text-xs text-text-muted">no worktrees</div>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
        {workspaces.length === 0 && <div className="px-3 py-2 text-xs text-text-muted">No workspaces yet</div>}
      </div>
    </div>
  )
}
