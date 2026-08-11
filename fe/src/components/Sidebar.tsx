import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pin,
  Plus,
  Settings,
  Star,
  Trash2,
} from 'lucide-react'
import { Menu } from '@/components/Menu'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { api } from '@/lib/api'
import { addTab, removeTab } from '@/lib/tabs'
import { relativeTime } from '@/lib/time'
import type { Repository, Worktree, Workspace } from '@/lib/types'

const STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'bg-success',
  modified: 'bg-warning',
  conflicted: 'bg-error',
  ahead: 'bg-accent',
  behind: 'bg-text-faint',
}

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
  if (!additions && !deletions) return null
  return (
    <span className="shrink-0 font-mono text-[11px] tnum">
      <span className="text-success">+{additions ?? 0}</span> <span className="text-error">-{deletions ?? 0}</span>
    </span>
  )
}

/** Inline "new worktree" form with a real branch list to branch from. */
function NewWorktree({ repo, onDone }: { repo: Repository; onDone: (wt: Worktree) => void }) {
  const [branch, setBranch] = useState('')
  const [base, setBase] = useState(repo.defaultBranch)
  const [branches, setBranches] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listBranches(repo.id)
      .then((b) => {
        setBranches(b)
        if (b.length && !b.includes(repo.defaultBranch)) setBase(b[0])
      })
      .catch(() => setBranches([]))
  }, [repo.id, repo.defaultBranch])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!branch.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      onDone(await api.createWorktree(repo.id, { branch: branch.trim(), targetBranch: base }))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="ml-5 mr-2 my-1 p-2 rounded-md bg-surface-elevated border border-border space-y-1.5">
      <input
        autoFocus
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        placeholder="feature/name"
        className="w-full bg-background border border-border rounded px-1.5 py-1 font-mono text-[12px] outline-none focus:border-accent"
      />
      <label className="flex items-center gap-1.5 text-[11px] text-text-faint">
        from
        <select
          value={base}
          onChange={(e) => setBase(e.target.value)}
          className="flex-1 min-w-0 bg-background border border-border rounded px-1 py-0.5 font-mono text-[11px] outline-none focus:border-accent"
        >
          {(branches.length ? branches : [repo.defaultBranch]).map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-[11px] text-error">{error}</p>}
      <button
        type="submit"
        disabled={!branch.trim() || busy}
        className="w-full flex items-center justify-center gap-1 bg-action-strong text-white rounded py-1 text-[12px] disabled:opacity-40"
      >
        {busy && <Loader2 size={11} className="animate-spin" />}
        Create worktree
      </button>
    </form>
  )
}

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [openWorkspaces, setOpenWorkspaces] = useState<Set<string>>(new Set())
  const [reposByWs, setReposByWs] = useState<Record<string, Repository[]>>({})
  const [openRepos, setOpenRepos] = useState<Set<string>>(new Set())
  const [worktreesByRepo, setWorktreesByRepo] = useState<Record<string, Worktree[]>>({})
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)

  function loadWorkspaces() {
    api.listWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]))
  }
  useEffect(loadWorkspaces, [])

  async function loadWorktrees(repoId: string) {
    setWorktreesByRepo((prev) => ({ ...prev, [repoId]: prev[repoId] ?? [] }))
    const wts = await api.listWorktrees(repoId)
    setWorktreesByRepo((prev) => ({ ...prev, [repoId]: wts }))
  }

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
    if (!worktreesByRepo[id]) await loadWorktrees(id)
  }

  async function patchWorktree(wt: Worktree, body: { pinned?: boolean; favorite?: boolean }) {
    const updated = await api.updateWorktree(wt.id, body)
    setWorktreesByRepo((prev) => ({
      ...prev,
      [wt.repositoryId]: (prev[wt.repositoryId] ?? [])
        .map((w) => (w.id === updated.id ? updated : w))
        .sort((a, b) => {
          if ((a.kind === 'primary') !== (b.kind === 'primary')) return a.kind === 'primary' ? -1 : 1
          if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1
          return b.updatedAt.localeCompare(a.updatedAt)
        }),
    }))
  }

  async function removeWorktree(wt: Worktree) {
    await api.deleteWorktree(wt.id)
    removeTab(wt.id)
    setWorktreesByRepo((prev) => ({
      ...prev,
      [wt.repositoryId]: (prev[wt.repositoryId] ?? []).filter((w) => w.id !== wt.id),
    }))
    if (location.pathname === `/worktrees/${wt.id}`) navigate('/')
  }

  async function renameRepo(repo: Repository) {
    const name = window.prompt('Rename project', repo.name)?.trim()
    if (!name || name === repo.name) return
    const updated = await api.renameRepository(repo.id, name)
    setReposByWs((prev) => ({
      ...prev,
      [repo.workspaceId]: (prev[repo.workspaceId] ?? []).map((r) => (r.id === updated.id ? updated : r)),
    }))
  }

  async function removeRepo(repo: Repository) {
    if (!window.confirm(`Remove "${repo.name}" from devpipe?\n\nWorktrees devpipe created are deleted. Your repository folder and its code are not touched.`)) return
    await api.deleteRepository(repo.id)
    setReposByWs((prev) => ({
      ...prev,
      [repo.workspaceId]: (prev[repo.workspaceId] ?? []).filter((r) => r.id !== repo.id),
    }))
  }

  async function renameWs(ws: Workspace) {
    const name = window.prompt('Rename workspace', ws.name)?.trim()
    if (!name || name === ws.name) return
    const updated = await api.renameWorkspace(ws.id, name)
    setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
  }

  async function removeWs(ws: Workspace) {
    if (!window.confirm(`Remove workspace "${ws.name}"?\n\nWorktrees devpipe created are deleted. Your repository folders and code are not touched.`)) return
    await api.deleteWorkspace(ws.id)
    setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id))
  }

  return (
    <nav className="flex flex-col h-full min-h-0" aria-label="Projects">
      <div className="shrink-0 flex items-center justify-between px-3 h-9">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">Projects</span>
        <button
          type="button"
          onClick={() => setShowNewProject(true)}
          className="text-text-faint hover:text-text transition-colors"
          aria-label="New project"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
        {workspaces.map((ws) => {
          const wsOpen = openWorkspaces.has(ws.id)
          return (
            <div key={ws.id} className="mb-1">
              <div className="group flex items-center gap-1 px-1.5 h-7 rounded-md hover:bg-surface-hover transition-colors">
                <button
                  type="button"
                  onClick={() => toggleWorkspace(ws.id)}
                  aria-expanded={wsOpen}
                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                >
                  {wsOpen ? (
                    <ChevronDown size={12} className="text-text-faint shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-text-faint shrink-0" />
                  )}
                  <Monogram name={ws.name} />
                  <span className="truncate font-medium">{ws.name}</span>
                </button>
                <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <Menu
                    label={`Workspace ${ws.name} actions`}
                    trigger={<MoreHorizontal size={13} />}
                    items={[
                      { label: 'Rename', onSelect: () => renameWs(ws) },
                      { label: 'Remove', onSelect: () => removeWs(ws), danger: true },
                    ]}
                  />
                </span>
              </div>

              {wsOpen &&
                (reposByWs[ws.id] ?? []).map((repo) => {
                  const repoOpen = openRepos.has(repo.id)
                  const worktrees = worktreesByRepo[repo.id] ?? []
                  return (
                    <div key={repo.id}>
                      <div className="group flex items-center gap-1 pl-5 pr-1.5 h-6 rounded-md hover:bg-surface-hover transition-colors">
                        <button
                          type="button"
                          onClick={() => toggleRepo(repo.id)}
                          aria-expanded={repoOpen}
                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left text-text-muted"
                        >
                          {repoOpen ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
                          <span className="truncate text-[12px]">{repo.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!repoOpen) toggleRepo(repo.id)
                            setCreatingIn(creatingIn === repo.id ? null : repo.id)
                          }}
                          aria-label={`New worktree in ${repo.name}`}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded text-text-faint hover:text-text transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                        <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                          <Menu
                            label={`Project ${repo.name} actions`}
                            trigger={<MoreHorizontal size={12} />}
                            items={[
                              { label: 'Rename', onSelect: () => renameRepo(repo) },
                              { label: 'Project settings', onSelect: () => navigate(`/repositories/${repo.id}/settings`) },
                              { label: 'Remove', onSelect: () => removeRepo(repo), danger: true },
                            ]}
                          />
                        </span>
                      </div>

                      {repoOpen && creatingIn === repo.id && (
                        <NewWorktree
                          repo={repo}
                          onDone={(wt) => {
                            setCreatingIn(null)
                            setWorktreesByRepo((prev) => ({ ...prev, [repo.id]: [...(prev[repo.id] ?? []), wt] }))
                            addTab({ id: wt.id, branch: wt.branch })
                            navigate(`/worktrees/${wt.id}`)
                          }}
                        />
                      )}

                      {repoOpen &&
                        worktrees.map((wt) => {
                          const active = location.pathname === `/worktrees/${wt.id}`
                          const isPrimary = wt.kind === 'primary'
                          return (
                            <div
                              key={wt.id}
                              className={`group flex items-start gap-2 pl-5 pr-1.5 py-1.5 rounded-md transition-colors ${
                                active ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                              }`}
                            >
                              <Link
                                to={`/worktrees/${wt.id}`}
                                onClick={() => addTab({ id: wt.id, branch: wt.branch })}
                                title={wt.status}
                                aria-current={active ? 'page' : undefined}
                                className="flex items-start gap-2 min-w-0 flex-1"
                              >
                                <span className={`mt-[5px] size-1.5 rounded-full shrink-0 ${STATUS_COLOR[wt.status]}`} aria-hidden />
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1">
                                    <GitBranch size={11} className="shrink-0 text-text-faint" />
                                    <span className={`truncate font-mono text-[12px] ${active ? 'text-accent' : 'text-text'}`}>
                                      {wt.branch}
                                    </span>
                                    {isPrimary && <Star size={10} className="shrink-0 text-warning" aria-label="main repository" />}
                                    {wt.favorite && !isPrimary && (
                                      <Star size={10} className="shrink-0 text-warning" aria-label="favorite" />
                                    )}
                                    {wt.pinnedAt && <Pin size={10} className="shrink-0 text-text-faint" aria-label="pinned" />}
                                  </span>
                                  <span className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] text-text-faint">{relativeTime(wt.updatedAt)}</span>
                                    <DiffStat additions={wt.additions} deletions={wt.deletions} />
                                  </span>
                                </span>
                              </Link>
                              <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 mt-0.5">
                                <Menu
                                  label={`Worktree ${wt.branch} actions`}
                                  trigger={<MoreHorizontal size={12} />}
                                  items={[
                                    {
                                      label: wt.pinnedAt ? 'Unpin' : 'Pin',
                                      icon: <Pin size={12} />,
                                      onSelect: () => patchWorktree(wt, { pinned: !wt.pinnedAt }),
                                    },
                                    {
                                      label: wt.favorite ? 'Remove favorite' : 'Favorite',
                                      icon: <Star size={12} />,
                                      onSelect: () => patchWorktree(wt, { favorite: !wt.favorite }),
                                    },
                                    // The primary worktree is the repository's own
                                    // checkout: removing it would delete the user's code.
                                    ...(isPrimary
                                      ? []
                                      : [
                                          {
                                            label: 'Delete worktree',
                                            icon: <Trash2 size={12} />,
                                            danger: true,
                                            onSelect: () => removeWorktree(wt),
                                          },
                                        ]),
                                  ]}
                                />
                              </span>
                            </div>
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

        {workspaces.length === 0 && <p className="px-3 py-2 text-[12px] text-text-faint">No projects yet</p>}
      </div>

      <div className="shrink-0 border-t border-border px-2 h-9 flex items-center gap-1">
        <Link
          to="/settings"
          className="p-1 rounded-md text-text-faint hover:text-text hover:bg-surface-hover transition-colors"
          aria-label="Settings"
        >
          <Settings size={14} />
        </Link>
        <button
          type="button"
          onClick={() => setShowNewProject(true)}
          className="flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors text-left"
        >
          <Plus size={13} /> New project
        </button>
      </div>

      {showNewProject && (
        <NewProjectDialog
          onCancel={() => setShowNewProject(false)}
          onCreated={(workspaceId) => {
            setShowNewProject(false)
            loadWorkspaces()
            setOpenWorkspaces((prev) => new Set(prev).add(workspaceId))
            navigate(`/workspaces/${workspaceId}`)
          }}
        />
      )}
    </nav>
  )
}
