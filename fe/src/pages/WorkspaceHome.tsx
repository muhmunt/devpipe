import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen, GitBranch, ArrowRight, Loader2 } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { api } from '@/lib/api'
import type { Workspace } from '@/lib/types'

function nameFromPath(path: string): string {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? 'workspace'
}

function nameFromUrl(url: string): string {
  const last = url.replace(/\/+$/, '').split('/').pop() ?? 'repository'
  return last.replace(/\.git$/, '')
}

// spec §58 "First Launch" — VS Code-style entry point: Open Folder / Clone
// Repository, each a single action that creates a workspace + repository
// together (collapses the old two-step workspace-then-repo flow). No fake
// native file picker — browsers can't return an absolute POSIX path from
// <input type="file">, so this is a real path field, honestly.
export default function WorkspaceHome() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<'open' | 'clone' | null>(null)
  const [path, setPath] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [destPath, setDestPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listWorkspaces()
      .then(setWorkspaces)
      .finally(() => setLoading(false))
  }, [])

  async function openFolder(e: React.FormEvent) {
    e.preventDefault()
    if (!path.trim()) return
    setBusy(true)
    setError(null)
    try {
      const ws = await api.createWorkspace({ name: nameFromPath(path.trim()) })
      await api.createRepository({ workspaceId: ws.id, name: nameFromPath(path.trim()), localPath: path.trim() })
      navigate(`/workspaces/${ws.id}`)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function cloneRepository(e: React.FormEvent) {
    e.preventDefault()
    if (!cloneUrl.trim() || !destPath.trim()) return
    setBusy(true)
    setError(null)
    try {
      const name = nameFromUrl(cloneUrl.trim())
      const ws = await api.createWorkspace({ name })
      await api.cloneRepository({ workspaceId: ws.id, name, cloneUrl: cloneUrl.trim(), destPath: destPath.trim() })
      navigate(`/workspaces/${ws.id}`)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell>
      <div className="h-full flex items-center justify-center overflow-y-auto py-10">
        <div className="w-full max-w-[720px] px-6">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-accent/15 mb-4">
              <GitBranch className="text-accent" size={26} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">devpipe</h1>
            <p className="text-text-muted text-sm mt-1">Orchestrate AI coding agents across isolated git worktrees.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              type="button"
              onClick={() => setMode(mode === 'open' ? null : 'open')}
              className={`text-left border rounded-xl p-5 transition-colors duration-150 ${
                mode === 'open' ? 'border-accent bg-surface-elevated' : 'border-border bg-surface hover:border-text-muted'
              }`}
              style={{ transitionTimingFunction: 'var(--ease-out)' }}
            >
              <FolderOpen className="text-accent mb-3" size={22} />
              <div className="text-sm font-medium">Open Folder</div>
              <div className="text-xs text-text-muted mt-0.5">Open an existing local git repository</div>
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'clone' ? null : 'clone')}
              className={`text-left border rounded-xl p-5 transition-colors duration-150 ${
                mode === 'clone' ? 'border-accent bg-surface-elevated' : 'border-border bg-surface hover:border-text-muted'
              }`}
              style={{ transitionTimingFunction: 'var(--ease-out)' }}
            >
              <GitBranch className="text-accent mb-3" size={22} />
              <div className="text-sm font-medium">Clone Repository</div>
              <div className="text-xs text-text-muted mt-0.5">Clone from a URL into a new folder</div>
            </button>
          </div>

          {mode === 'open' && (
            <form onSubmit={openFolder} className="border border-border rounded-xl p-4 mb-8 bg-surface space-y-3">
              <label className="block text-xs text-text-muted">Absolute path to an existing git repository</label>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/Users/you/code/my-project"
                  className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={busy || !path.trim()}
                  className="flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  Open
                </button>
              </div>
            </form>
          )}

          {mode === 'clone' && (
            <form onSubmit={cloneRepository} className="border border-border rounded-xl p-4 mb-8 bg-surface space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Repository URL</label>
                <input
                  autoFocus
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/you/repo.git"
                  className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Clone into (absolute path, must not exist yet)</label>
                <div className="flex gap-2">
                  <input
                    value={destPath}
                    onChange={(e) => setDestPath(e.target.value)}
                    placeholder="/Users/you/code/repo"
                    className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={busy || !cloneUrl.trim() || !destPath.trim()}
                    className="flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    Clone
                  </button>
                </div>
              </div>
            </form>
          )}

          {error && <p className="text-error text-sm mb-6 text-center">{error}</p>}

          <div>
            <h2 className="text-xs font-mono uppercase tracking-wide text-text-muted mb-2">Recent</h2>
            <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
              {workspaces.map((ws) => (
                <Link key={ws.id} to={`/workspaces/${ws.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-elevated text-sm">
                  <span className="font-medium">{ws.name}</span>
                  <span className="text-text-muted text-xs">{new Date(ws.createdAt).toLocaleDateString()}</span>
                </Link>
              ))}
              {!loading && workspaces.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-text-muted">No workspaces yet — open a folder to get started.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
