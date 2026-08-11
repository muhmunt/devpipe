import { useState } from 'react'
import { FolderOpen, GitBranch, Loader2, Sparkles } from 'lucide-react'
import { FolderPicker } from '@/components/FolderPicker'
import { api } from '@/lib/api'

type Source = 'open' | 'clone' | 'new'

function basename(value: string): string {
  const last = value.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? ''
  return last.replace(/\.git$/, '')
}

const SOURCES = [
  { key: 'open', icon: FolderOpen, label: 'Add existing project', hint: 'A folder on this machine that is already a git repository' },
  { key: 'clone', icon: GitBranch, label: 'Clone from URL', hint: 'Fetch a remote repository into a new folder' },
  { key: 'new', icon: Sparkles, label: 'Quick start', hint: 'Create an empty repository with an initial commit' },
] as const

// Every source resolves to an absolute path chosen through the folder picker,
// so no path is ever typed. All three submit to the same atomic endpoint,
// which validates before writing anything.
export function NewProjectDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (workspaceId: string) => void }) {
  const [source, setSource] = useState<Source | null>(null)
  const [picking, setPicking] = useState(false)
  const [parentPath, setParentPath] = useState('')
  const [folderName, setFolderName] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(path: string, name: string) {
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      const { workspace } = await api.initWorkspace({
        name,
        source,
        path,
        cloneUrl: source === 'clone' ? cloneUrl.trim() : undefined,
      })
      onCreated(workspace.id)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  // "open" needs no extra input: the picked folder is the project.
  function onPicked(path: string) {
    setPicking(false)
    if (source === 'open') {
      submit(path, basename(path))
      return
    }
    setParentPath(path)
    if (!folderName && source === 'clone' && cloneUrl) setFolderName(basename(cloneUrl))
  }

  if (picking && source) {
    return (
      <FolderPicker
        title={source === 'open' ? 'Choose a repository folder' : 'Choose where to create it'}
        requireRepo={source === 'open'}
        confirmLabel={source === 'open' ? 'Open' : 'Choose'}
        onCancel={() => setPicking(false)}
        onConfirm={onPicked}
      />
    )
  }

  const name = folderName.trim() || (source === 'clone' ? basename(cloneUrl) : '')
  const targetPath = parentPath && name ? `${parentPath.replace(/\/+$/, '')}/${name}` : ''
  const ready = source === 'clone' ? Boolean(cloneUrl.trim() && targetPath) : Boolean(targetPath)

  const field =
    'w-full bg-background border border-border rounded-md px-2.5 py-1.5 font-mono text-text placeholder:text-text-faint outline-none focus:border-accent transition-colors'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onCancel} role="dialog" aria-modal="true">
      <div
        className="w-full max-w-[520px] bg-surface border border-border rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 h-11 flex items-center border-b border-border">
          <span className="font-medium">New project</span>
        </header>

        <div className="divide-y divide-border">
          {SOURCES.map(({ key, icon: Icon, label, hint }) => {
            const active = source === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSource(key)
                  setError(null)
                  setPicking(true)
                }}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                  active ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                }`}
              >
                <Icon size={15} className={`mt-0.5 shrink-0 ${active ? 'text-accent' : 'text-text-muted'}`} />
                <span>
                  <span className={`block font-medium ${active ? 'text-text' : ''}`}>{label}</span>
                  <span className="block text-[12px] text-text-faint mt-0.5">{hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        {source && source !== 'open' && (
          <div className="border-t border-border p-4 space-y-3">
            {source === 'clone' && (
              <div className="space-y-1">
                <label htmlFor="np-url" className="block text-[12px] text-text-muted">
                  Repository URL
                </label>
                <input
                  id="np-url"
                  autoFocus
                  value={cloneUrl}
                  onChange={(e) => {
                    setCloneUrl(e.target.value)
                    if (!folderName) setFolderName(basename(e.target.value))
                  }}
                  placeholder="https://github.com/owner/repo.git"
                  className={field}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[12px] text-text-muted">Location</label>
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 font-mono text-[12px] text-text-muted truncate">
                  {parentPath || 'No folder chosen'}
                </span>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="shrink-0 px-2 py-1 rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                >
                  Choose folder
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="np-name" className="block text-[12px] text-text-muted">
                Project folder name
              </label>
              <input
                id="np-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="my-project"
                className={field}
              />
              {targetPath && <p className="text-[12px] text-text-faint font-mono truncate">creates {targetPath}</p>}
            </div>

            {error && (
              <p role="alert" className="text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit(targetPath, name)}
                disabled={!ready || busy}
                className="flex items-center gap-1.5 bg-action-strong text-white px-3 py-1.5 rounded-md font-medium transition-transform active:translate-y-px disabled:opacity-40"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {source === 'clone' ? 'Clone' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {source === 'open' && error && (
          <div className="border-t border-border p-4">
            <p role="alert" className="text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-2">
              {error}
            </p>
          </div>
        )}

        {busy && source === 'open' && (
          <div className="border-t border-border p-4 flex items-center gap-2 text-text-muted">
            <Loader2 size={13} className="animate-spin" /> Opening
          </div>
        )}
      </div>
    </div>
  )
}
