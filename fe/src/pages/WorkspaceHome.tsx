/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/time'
import type { Workspace } from '@/lib/types'

// First launch. Project creation lives entirely in NewProjectDialog, which
// resolves a real absolute path through the folder picker, so nothing here
// asks the user to type one.
export default function WorkspaceHome() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  function load() {
    api
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((e) => setError(String((e as Error).message ?? e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function remove(ws: Workspace) {
    if (!window.confirm(`Remove workspace "${ws.name}"?\n\nWorktrees devpipe created are deleted. Your repository folders and code are not touched.`)) return
    setRemoving(ws.id)
    setError(null)
    try {
      await api.deleteWorkspace(ws.id)
      setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <AppShell>
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[560px] px-6 py-14">
            <header className="mb-8">
              <h1 className="text-[15px] font-semibold tracking-tight">devpipe</h1>
              <p className="text-text-muted mt-0.5">Run coding agents in isolated git worktrees.</p>
            </header>

            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="w-full flex items-center gap-3 border border-border rounded-lg bg-surface hover:bg-surface-hover px-4 py-3 mb-8 text-left transition-colors"
            >
              <span className="size-8 grid place-items-center rounded-md bg-accent-soft shrink-0">
                <Plus size={15} className="text-accent" />
              </span>
              <span>
                <span className="block font-medium">New project</span>
                <span className="block text-[12px] text-text-faint mt-0.5">
                  Add an existing folder, clone a URL, or start something new
                </span>
              </span>
            </button>

            {error && (
              <p role="alert" className="text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-2 mb-4">
                {error}
              </p>
            )}

            <section>
              <h2 className="text-[12px] text-text-muted mb-2">Workspaces</h2>
              {loading ? (
                <SkeletonRows rows={3} />
              ) : workspaces.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg px-4 py-10 text-center">
                  <FolderOpen size={18} className="mx-auto text-text-faint mb-2" />
                  <p className="text-text-muted">No projects yet.</p>
                  <p className="text-text-faint text-[12px] mt-1">Create one above to get started.</p>
                </div>
              ) : (
                <ul className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {workspaces.map((ws) => (
                    <li key={ws.id} className="group flex items-center hover:bg-surface-hover transition-colors">
                      <Link to={`/workspaces/${ws.id}`} className="flex-1 min-w-0 px-3 py-2">
                        <span className="font-medium truncate">{ws.name}</span>
                      </Link>
                      <span className="text-text-faint text-[12px] px-2 tnum">{relativeTime(ws.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => remove(ws)}
                        disabled={removing === ws.id}
                        aria-label={`Remove workspace ${ws.name}`}
                        title="Remove from devpipe. Your code is not deleted."
                        className="px-3 py-2 text-text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-error transition-colors"
                      >
                        {removing === ws.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {showNew && (
        <NewProjectDialog
          onCancel={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false)
            navigate(`/workspaces/${id}`)
          }}
        />
      )}
    </AppShell>
  )
}
