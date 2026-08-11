import { useEffect, useState } from 'react'
import { ChevronRight, CornerLeftUp, Folder, GitBranch, Home, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { BrowseResult } from '@/lib/types'

// A browser cannot report the absolute path of a folder the user picks, so
// this browses the filesystem through the backend instead of faking an OS
// dialog. `requireRepo` gates the confirm button for "open existing project";
// the clone and quick-start flows pick a parent directory, so they don't.
export function FolderPicker({
  title,
  requireRepo,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  requireRepo: boolean
  confirmLabel: string
  onCancel: () => void
  onConfirm: (path: string) => void
}) {
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function go(path?: string) {
    setLoading(true)
    setError(null)
    api
      .browse(path)
      .then(setResult)
      .catch((e) => setError(String((e as Error).message ?? e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => go(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const current = result?.path ?? ''
  // For "open existing", the folder itself must be a repository, so the
  // button reflects that rather than letting the backend reject the submit.
  const canConfirm = Boolean(current) && !loading && (!requireRepo || Boolean(result?.isGitRepo))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-[600px] max-h-[70vh] flex flex-col bg-surface border border-border rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-4 h-11 flex items-center justify-between border-b border-border">
          <span className="font-medium">{title}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go()}
              className="p-1 text-text-muted hover:text-text rounded-md hover:bg-surface-hover transition-colors"
              aria-label="Home directory"
            >
              <Home size={14} />
            </button>
            <button
              type="button"
              onClick={() => result?.parent && go(result.parent)}
              disabled={!result?.parent}
              className="p-1 text-text-muted hover:text-text rounded-md hover:bg-surface-hover disabled:opacity-30 transition-colors"
              aria-label="Parent directory"
            >
              <CornerLeftUp size={14} />
            </button>
          </div>
        </header>

        <div className="shrink-0 px-4 py-2 border-b border-border">
          <p className="font-mono text-[12px] text-text-muted truncate" title={current}>
            {current || '...'}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && (
            <div className="p-4 flex items-center gap-2 text-text-faint">
              <Loader2 size={13} className="animate-spin" /> Loading
            </div>
          )}
          {error && <p className="p-4 text-[12px] text-error">{error}</p>}
          {!loading && !error && result?.entries.length === 0 && (
            <p className="p-4 text-[12px] text-text-faint">No sub-folders here.</p>
          )}
          {!loading &&
            !error &&
            result?.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onDoubleClick={() => go(entry.path)}
                onClick={() => go(entry.path)}
                className="w-full flex items-center gap-2 px-4 h-8 text-left hover:bg-surface-hover transition-colors"
              >
                <Folder size={13} className="shrink-0 text-text-faint" />
                <span className="truncate">{entry.name}</span>
                {entry.isGitRepo && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-accent shrink-0">
                    <GitBranch size={10} /> repo
                  </span>
                )}
                <ChevronRight size={12} className={`shrink-0 text-text-faint ${entry.isGitRepo ? 'ml-1' : 'ml-auto'}`} />
              </button>
            ))}
        </div>

        <footer className="shrink-0 px-4 py-3 border-t border-border flex items-center justify-between gap-3">
          <p className="text-[12px] text-text-faint truncate">
            {!requireRepo
              ? 'Pick the folder to create the project in.'
              : result?.isGitRepo
                ? 'This folder is a git repository.'
                : 'Open a folder that is a git repository.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(current)}
              disabled={!canConfirm}
              className="bg-action-strong text-white px-3 py-1.5 rounded-md font-medium transition-transform active:translate-y-px disabled:opacity-40"
            >
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
