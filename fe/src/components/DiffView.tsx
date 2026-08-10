import { useEffect, useState } from 'react'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import type { Diff, DiffFile } from '@/lib/types'

/** Reference shows a single status letter per row (A / M / D / R). */
function statusLetter(status: string): { letter: string; className: string } {
  switch (status) {
    case 'added':
      return { letter: 'A', className: 'text-success' }
    case 'deleted':
      return { letter: 'D', className: 'text-error' }
    case 'renamed':
      return { letter: 'R', className: 'text-warning' }
    default:
      return { letter: 'M', className: 'text-accent' }
  }
}

function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split('/')
  const name = parts.pop() ?? path
  return { name, dir: parts.join('/') }
}

function FileRow({ file }: { file: DiffFile }) {
  const { letter, className } = statusLetter(file.status)
  const { name, dir } = splitPath(file.path)
  return (
    <li className="flex items-center gap-2 px-3 py-1 hover:bg-surface-hover transition-colors" title={file.path}>
      <span className={`font-mono text-[11px] w-3 shrink-0 ${className}`} aria-label={file.status}>
        {letter}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px]">
        {name}
        {dir && <span className="text-text-faint"> {dir}</span>}
      </span>
      <span className="shrink-0 font-mono text-[11px] tnum">
        {file.additions > 0 && <span className="text-success">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-error"> -{file.deletions}</span>}
      </span>
    </li>
  )
}

// spec §23 review surface. Only the file list and unified diff text are
// backed by a real endpoint; approve/comment/revert from the reference need
// endpoints that do not exist, so they are not drawn.
export function DiffView({ worktreeId }: { worktreeId: string }) {
  const [diff, setDiff] = useState<Diff | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDiff(null)
    setError(null)
    api
      .diffWorktree(worktreeId)
      .then(setDiff)
      .catch((e) => setError(String((e as Error).message ?? e)))
  }, [worktreeId])

  if (error) return <p className="p-3 text-[12px] text-error">{error}</p>
  if (!diff) return <SkeletonRows rows={6} className="p-2" />
  if (diff.files.length === 0) return <p className="p-3 text-[12px] text-text-faint">No changes against the target branch.</p>

  return (
    <div>
      <ul className="py-1">
        {diff.files.map((f) => (
          <FileRow key={f.path} file={f} />
        ))}
      </ul>
      {diff.diff && (
        <pre className="border-t border-border p-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
          {diff.diff.split('\n').map((line, i) => (
            <span
              key={i}
              className={
                line.startsWith('+') && !line.startsWith('+++')
                  ? 'text-success'
                  : line.startsWith('-') && !line.startsWith('---')
                    ? 'text-error'
                    : line.startsWith('@@')
                      ? 'text-accent'
                      : 'text-text-muted'
              }
            >
              {line}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
    </div>
  )
}
