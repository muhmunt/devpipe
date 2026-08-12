/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
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

/** Splits a unified diff into per-file sections so a file row can show its
    own patch instead of one wall of text for the whole branch. */
export function splitDiffByFile(diff: string): Record<string, string> {
  const out: Record<string, string> = {}
  let path: string | null = null
  let lines: string[] = []
  const flush = () => {
    if (path) out[path] = lines.join('\n')
  }
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush()
      // "diff --git a/x b/x" — take the b-side, which is the path after any
      // rename, matching what --numstat reports.
      const match = /^diff --git a\/(.*?) b\/(.*)$/.exec(line)
      path = match ? match[2] : null
      lines = [line]
      continue
    }
    if (path) lines.push(line)
  }
  flush()
  return out
}

export function DiffLines({ diff }: { diff: string }) {
  return (
    <pre className="text-[11px] font-mono leading-[1.5] overflow-x-auto whitespace-pre">
      {diff.split('\n').map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'text-success bg-success/[0.07] px-3'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'text-error bg-error/[0.07] px-3'
                : line.startsWith('@@')
                  ? 'text-accent px-3'
                  : 'text-text-faint px-3'
          }
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}

function FileRow({ file, patch }: { file: DiffFile; patch?: string }) {
  const [open, setOpen] = useState(false)
  const { letter, className } = statusLetter(file.status)
  const { name, dir } = splitPath(file.path)

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => patch && setOpen((o) => !o)}
        disabled={!patch}
        aria-expanded={patch ? open : undefined}
        title={file.path}
        className={`flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors ${
          patch ? 'hover:bg-surface-hover' : 'cursor-default'
        }`}
      >
        {patch ? (
          open ? (
            <ChevronDown size={10} className="shrink-0 text-text-faint" />
          ) : (
            <ChevronRight size={10} className="shrink-0 text-text-faint" />
          )
        ) : (
          <span className="w-[10px] shrink-0" aria-hidden />
        )}
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
      </button>

      {open && patch && (
        <div className="code-surface border-t border-border bg-surface-elevated py-1">
          <div className="absolute right-1.5 top-1.5 z-10">
            <CopyButton text={patch} label="Copy patch" />
          </div>
          <DiffLines diff={patch} />
        </div>
      )}
    </li>
  )
}

export function totals(files: DiffFile[]): { additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  )
}

/** `+N -M` in the two colours used for additions and deletions everywhere else. */
export function DiffTotals({ files, className = '' }: { files: DiffFile[]; className?: string }) {
  const { additions, deletions } = totals(files)
  return (
    <span className={`font-mono text-[11px] tnum ${className}`}>
      <span className="text-success">+{additions.toLocaleString()}</span>{' '}
      <span className="text-error">-{deletions.toLocaleString()}</span>
    </span>
  )
}

/**
 * One scope of changes: a header carrying its own `+N -M`, then a row per
 * file that opens to that file's patch.
 */
function Section({
  title,
  hint,
  diff,
  defaultOpen,
}: {
  title: string
  hint: string
  diff: Diff | null
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const patches = diff ? splitDiffByFile(diff.diff) : {}

  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-surface-hover transition-colors text-left"
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-text-faint" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-text-faint" />
        )}
        <span className="text-[12px] font-medium">{title}</span>
        <span className="text-text-faint text-[11px] tnum">{diff ? diff.files.length : '—'}</span>
        {diff && diff.files.length > 0 && <DiffTotals files={diff.files} className="ml-auto" />}
      </button>

      {open && (
        <>
          {!diff ? (
            <SkeletonRows rows={3} className="p-2" />
          ) : diff.files.length === 0 ? (
            <p className="px-3 pb-2 text-[11px] text-text-faint">{hint}</p>
          ) : (
            <ul className="border-t border-border">
              {diff.files.map((f) => (
                <FileRow key={f.path} file={f} patch={patches[f.path]} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

/**
 * The review surface. Two questions get different answers and have to be
 * asked separately: what has this branch committed that the target doesn't
 * have, and what has been written but not committed yet. Rolling both into
 * one list — which is what this panel used to show — hid the agent's
 * uncommitted work behind a count that only moved after a commit.
 */
export function DiffView({ worktreeId, reloadKey = 0 }: { worktreeId: string; reloadKey?: number }) {
  const [uncommitted, setUncommitted] = useState<Diff | null>(null)
  const [committed, setCommitted] = useState<Diff | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUncommitted(null)
    setCommitted(null)
    setError(null)
    api.diffWorktree(worktreeId, 'uncommitted').then(setUncommitted).catch((e) => setError(String((e as Error).message ?? e)))
    api.diffWorktree(worktreeId, 'committed').then(setCommitted).catch((e) => setError(String((e as Error).message ?? e)))
  }, [worktreeId, reloadKey])

  if (error) return <p className="p-3 text-[12px] text-error">{error}</p>

  const all = [...(uncommitted?.files ?? []), ...(committed?.files ?? [])]

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border bg-surface">
        <span className="text-[11px] uppercase tracking-[0.08em] text-text-faint">This branch</span>
        {uncommitted && committed ? (
          <DiffTotals files={all} />
        ) : (
          <span className="text-[11px] text-text-faint">counting…</span>
        )}
      </div>

      <Section
        title="Uncommitted"
        hint="Nothing written that isn't committed."
        diff={uncommitted}
        defaultOpen
      />
      <Section
        title="Committed"
        hint="No commits the target branch doesn't already have."
        diff={committed}
        defaultOpen={(uncommitted?.files.length ?? 0) === 0}
      />
    </div>
  )
}
