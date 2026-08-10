import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { api } from '@/lib/api'
import { addTab } from '@/lib/tabs'
import type { Repository, Worktree } from '@/lib/types'

const WORKTREE_STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'bg-success',
  modified: 'bg-warning',
  conflicted: 'bg-error',
  ahead: 'bg-accent',
  behind: 'bg-text-muted',
}

// spec §86 "Repository" — primary + task worktrees per repository, per the
// Workspace -> Repository -> Worktree hierarchy (spec §5).
export default function RepositoryPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [repos, setRepos] = useState<Repository[]>([])
  const [worktrees, setWorktrees] = useState<Record<string, Worktree[]>>({})
  const [form, setForm] = useState({ name: '', localPath: '', defaultBranch: 'main' })
  const [branchForm, setBranchForm] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function load() {
    if (!workspaceId) return
    api.listRepositories(workspaceId).then(async (rs) => {
      setRepos(rs)
      const pairs = await Promise.all(rs.map((r) => api.listWorktrees(r.id).then((wts) => [r.id, wts] as const)))
      setWorktrees(Object.fromEntries(pairs))
    })
  }

  useEffect(load, [workspaceId])

  async function createRepository(e: React.FormEvent) {
    e.preventDefault()
    if (!workspaceId || !form.name.trim() || !form.localPath.trim()) return
    try {
      await api.createRepository({
        workspaceId,
        name: form.name.trim(),
        localPath: form.localPath.trim(),
        defaultBranch: form.defaultBranch.trim() || 'main',
      })
      setForm({ name: '', localPath: '', defaultBranch: 'main' })
      load()
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  async function createWorktree(repoId: string) {
    const branch = branchForm[repoId]?.trim()
    if (!branch) return
    try {
      const wt = await api.createWorktree(repoId, { branch })
      setWorktrees((prev) => ({ ...prev, [repoId]: [...(prev[repoId] ?? []), wt] }))
      setBranchForm((prev) => ({ ...prev, [repoId]: '' }))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  return (
    <AppShell>
      <div className="p-6 max-w-[760px]">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xs text-text-muted hover:text-text">
            ← Workspaces
          </Link>
          <Link to={`/workspaces/${workspaceId}/observability`} className="text-xs text-text-muted hover:text-text">
            Observability →
          </Link>
        </div>
        <h1 className="text-lg font-medium mt-2 mb-4">Repositories</h1>

        <form onSubmit={createRepository} className="grid grid-cols-3 gap-2 mb-6">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={form.localPath}
            onChange={(e) => setForm({ ...form, localPath: e.target.value })}
            placeholder="Local path (/abs/path)"
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
          <button type="submit" className="flex items-center justify-center gap-1.5 bg-accent-strong text-white px-3 py-2 rounded-md text-sm">
            <Plus size={14} /> Add repo
          </button>
        </form>

        {error && <p className="text-error text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          {repos.map((repo) => (
            <div key={repo.id} className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{repo.name}</div>
                  <div className="text-xs text-text-muted font-mono">{repo.localPath}</div>
                </div>
                <div className="flex gap-2">
                  <input
                    value={branchForm[repo.id] ?? ''}
                    onChange={(e) => setBranchForm((prev) => ({ ...prev, [repo.id]: e.target.value }))}
                    placeholder="feature/branch"
                    className="bg-surface-elevated border border-border rounded-md px-2 py-1 text-xs font-mono outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => createWorktree(repo.id)}
                    className="text-xs bg-accent-strong text-white px-2 py-1 rounded-md"
                  >
                    New worktree
                  </button>
                </div>
              </div>
              <div className="divide-y divide-border">
                {(worktrees[repo.id] ?? []).map((wt) => (
                  <Link
                    key={wt.id}
                    to={`/worktrees/${wt.id}`}
                    onClick={() => addTab({ id: wt.id, branch: wt.branch })}
                    className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface"
                  >
                    <span className={`size-1.5 rounded-full shrink-0 ${WORKTREE_STATUS_COLOR[wt.status]}`} aria-hidden />
                    <span className="font-mono text-xs">{wt.branch}</span>
                    <span className="text-text-muted text-xs ml-auto">{wt.status}</span>
                  </Link>
                ))}
                {(worktrees[repo.id] ?? []).length === 0 && (
                  <div className="px-4 py-3 text-xs text-text-muted">No task worktrees yet</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
