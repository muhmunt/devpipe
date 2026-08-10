import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen, GitBranch, ArrowRight, Loader2, Trash2, CornerDownLeft } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import type { Workspace } from '@/lib/types'

type Source = 'open' | 'clone'

function basename(value: string): string {
  const last = value.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? ''
  return last.replace(/\.git$/, '')
}

/** Suggests a sibling destination path from a clone URL, the way a CLI would. */
function suggestDest(url: string): string {
  const name = basename(url)
  return name ? `~/code/${name}` : ''
}

// spec §58 first launch. Two real sources: open an existing local repo, or
// clone one. Both submit to a single atomic endpoint, so a bad path can no
// longer leave an empty workspace behind. There is no native folder picker:
// a browser cannot read an absolute filesystem path, so this asks for one
// directly rather than faking an OS dialog.
export default function WorkspaceHome() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const [source, setSource] = useState<Source>('open')
  const [path, setPath] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  function load() {
    api
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((e) => setError(String((e as Error).message ?? e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const name = source === 'clone' ? basename(cloneUrl) : basename(path)
  const canSubmit = source === 'clone' ? Boolean(cloneUrl.trim() && path.trim()) : Boolean(path.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      const { workspace } = await api.initWorkspace({
        name: name || 'workspace',
        source,
        path: path.trim(),
        cloneUrl: source === 'clone' ? cloneUrl.trim() : undefined,
      })
      navigate(`/workspaces/${workspace.id}`)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setRemoving(id)
    setError(null)
    try {
      await api.deleteWorkspace(id)
      setWorkspaces((prev) => prev.filter((w) => w.id !== id))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setRemoving(null)
    }
  }

  function pick(next: Source) {
    setSource(next)
    setError(null)
    if (next === 'open') setCloneUrl('')
  }

  const fieldClass =
    'w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[13px] font-mono text-text placeholder:text-text-faint outline-none focus:border-accent transition-colors'

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[560px] px-6 py-16">
          <header className="mb-8">
            <h1 className="text-[15px] font-semibold tracking-tight">devpipe</h1>
            <p className="text-text-muted mt-0.5">Run coding agents in isolated git worktrees.</p>
          </header>

          <div className="border border-border rounded-lg bg-surface overflow-hidden mb-8">
            <div className="grid grid-cols-2">
              {(
                [
                  { key: 'open', icon: FolderOpen, label: 'Open folder', hint: 'Existing local repository' },
                  { key: 'clone', icon: GitBranch, label: 'Clone', hint: 'Fetch from a remote URL' },
                ] as const
              ).map(({ key, icon: Icon, label, hint }, i) => {
                const active = source === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pick(key)}
                    aria-pressed={active}
                    className={`text-left px-4 py-3 transition-colors duration-150 ${i === 0 ? 'border-r border-border' : ''} ${
                      active ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                    }`}
                    style={{ transitionTimingFunction: 'var(--ease-out)' }}
                  >
                    <Icon size={15} className={active ? 'text-accent' : 'text-text-muted'} />
                    <div className={`mt-2 font-medium ${active ? 'text-text' : 'text-text-muted'}`}>{label}</div>
                    <div className="text-text-faint text-[12px] mt-0.5">{hint}</div>
                  </button>
                )
              })}
            </div>

            <form onSubmit={submit} className="border-t border-border p-4 space-y-3">
              {source === 'clone' && (
                <div className="space-y-1">
                  <label htmlFor="clone-url" className="block text-[12px] text-text-muted">
                    Repository URL
                  </label>
                  <input
                    id="clone-url"
                    autoFocus
                    value={cloneUrl}
                    onChange={(e) => {
                      setCloneUrl(e.target.value)
                      if (!path.trim()) setPath(suggestDest(e.target.value))
                    }}
                    placeholder="https://github.com/owner/repo.git"
                    className={fieldClass}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="repo-path" className="block text-[12px] text-text-muted">
                  {source === 'clone' ? 'Destination path' : 'Repository path'}
                </label>
                <input
                  id="repo-path"
                  autoFocus={source === 'open'}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/Users/you/code/project"
                  className={fieldClass}
                  aria-describedby="path-hint"
                />
                <p id="path-hint" className="text-[12px] text-text-faint">
                  {source === 'clone'
                    ? 'Absolute path. Must not exist yet.'
                    : 'Absolute path to a folder that is already a git repository.'}
                </p>
              </div>

              {error && (
                <p role="alert" className="text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-2">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[12px] text-text-faint font-mono truncate">
                  {name ? `creates workspace "${name}"` : ''}
                </span>
                <button
                  type="submit"
                  disabled={!canSubmit || busy}
                  className="flex items-center gap-1.5 bg-action-strong text-white px-3 py-1.5 rounded-md font-medium transition-transform active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                  {busy ? (source === 'clone' ? 'Cloning' : 'Opening') : source === 'clone' ? 'Clone' : 'Open'}
                </button>
              </div>
            </form>
          </div>

          <section>
            <h2 className="text-[12px] text-text-muted mb-2">Workspaces</h2>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : workspaces.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center">
                <p className="text-text-muted">No workspaces yet.</p>
                <p className="text-text-faint text-[12px] mt-1 flex items-center justify-center gap-1">
                  Open a folder above to start <CornerDownLeft size={11} className="rotate-180" />
                </p>
              </div>
            ) : (
              <ul className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                {workspaces.map((ws) => (
                  <li key={ws.id} className="group flex items-center hover:bg-surface-hover transition-colors">
                    <Link to={`/workspaces/${ws.id}`} className="flex-1 min-w-0 px-3 py-2">
                      <span className="font-medium truncate">{ws.name}</span>
                    </Link>
                    <time className="text-text-faint text-[12px] tnum px-2" dateTime={ws.createdAt}>
                      {new Date(ws.createdAt).toLocaleDateString()}
                    </time>
                    <button
                      type="button"
                      onClick={() => remove(ws.id)}
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
    </AppShell>
  )
}
