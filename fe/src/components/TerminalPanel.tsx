/* devpipe · design-system: design.md */
import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { api } from '@/lib/api'

// A terminal scoped to one worktree, so a command you run is measured
// against the same checkout the agent is working in.
//
// It is not a PTY. Each command is its own `sh -c`, which means no shell
// state survives between them — `export` won't stick, and a program that
// wants a TTY (a REPL, `vim`, anything that redraws) will not work. Rather
// than let that be discovered by a command mysteriously doing nothing, `cd`
// is handled here against a tracked directory, and the header says plainly
// what this is.

type Entry = {
  cwd: string
  command: string
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: string
  running?: boolean
}

/** Resolves `cd` against the tracked path without leaving the worktree. */
function resolveCd(current: string, argument: string): string | { error: string } {
  const raw = argument.trim()
  if (!raw || raw === '~') return ''
  const base = raw.startsWith('/') ? [] : current.split('/').filter(Boolean)
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (base.length === 0) return { error: 'cd: already at the top of the worktree' }
      base.pop()
      continue
    }
    base.push(segment)
  }
  return base.join('/')
}

export function TerminalPanel({ worktreeId, branch }: { worktreeId: string; branch: string }) {
  const [cwd, setCwd] = useState('')
  const [command, setCommand] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  // Up/down through what's already been run, as any shell does.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const history = entries.map((e) => e.command)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const input = command.trim()
    if (!input || busy) return
    setCommand('')
    setHistoryIndex(null)

    if (input === 'clear') {
      setEntries([])
      return
    }

    // `cd` can't be delegated — a subprocess that changes directory exits and
    // takes the change with it.
    if (input === 'cd' || input.startsWith('cd ')) {
      const next = resolveCd(cwd, input.slice(2))
      if (typeof next === 'object') {
        setEntries((prev) => [...prev, { cwd, command: input, error: next.error }])
        return
      }
      // Confirmed against the real filesystem, so a typo fails here rather
      // than making every later command fail with a confusing error.
      try {
        await api.execCommand(worktreeId, 'true', next)
        setCwd(next)
        setEntries((prev) => [...prev, { cwd, command: input }])
      } catch (err) {
        setEntries((prev) => [...prev, { cwd, command: input, error: String((err as Error).message ?? err) }])
      }
      return
    }

    setBusy(true)
    setEntries((prev) => [...prev, { cwd, command: input, running: true }])
    try {
      const result = await api.execCommand(worktreeId, input, cwd)
      setEntries((prev) =>
        prev.map((entry, i) =>
          i === prev.length - 1
            ? { ...entry, running: false, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
            : entry,
        ),
      )
    } catch (err) {
      setEntries((prev) =>
        prev.map((entry, i) =>
          i === prev.length - 1 ? { ...entry, running: false, error: String((err as Error).message ?? err) } : entry,
        ),
      )
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (history.length === 0) return
    e.preventDefault()
    const next =
      e.key === 'ArrowUp'
        ? historyIndex === null
          ? history.length - 1
          : Math.max(0, historyIndex - 1)
        : historyIndex === null
          ? null
          : Math.min(history.length - 1, historyIndex + 1)
    setHistoryIndex(next)
    setCommand(next === null ? '' : history[next])
  }

  const prompt = `${branch}${cwd ? `/${cwd}` : ''}`
  const transcript = entries
    .map((e) => `$ ${e.command}\n${e.stdout ?? ''}${e.stderr ?? ''}${e.error ?? ''}`)
    .join('\n')

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 bg-surface">
      <header className="shrink-0 h-8 px-3 flex items-center gap-2 border-b border-border bg-surface-elevated">
        <span className="text-[11px] text-text-muted">Runs in this worktree</span>
        <span className="text-[11px] text-text-faint truncate">
          — one command at a time, no persistent shell (no <span className="font-mono">export</span>, no interactive
          programs)
        </span>
        {entries.length > 0 && (
          <div className="ml-auto shrink-0 flex items-center gap-1.5">
            <CopyButton text={transcript} label="Copy output" className="!opacity-100" />
            <button
              type="button"
              onClick={() => setEntries([])}
              className="text-[11px] text-text-faint hover:text-text transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.55]">
        {entries.length === 0 && (
          <p className="text-text-faint">
            Try <span className="text-text-muted">git status</span> or <span className="text-text-muted">npm test</span>.
          </p>
        )}

        {entries.map((entry, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-start gap-1.5">
              <span className="text-accent shrink-0">{entry.cwd ? `${branch}/${entry.cwd}` : branch}</span>
              <span className="text-text-faint shrink-0">$</span>
              <span className="whitespace-pre-wrap break-all">{entry.command}</span>
              {entry.running && <Loader2 size={11} className="mt-1 shrink-0 animate-spin text-text-faint" />}
            </div>
            {entry.stdout && <pre className="whitespace-pre-wrap break-all text-text-muted">{entry.stdout}</pre>}
            {entry.stderr && <pre className="whitespace-pre-wrap break-all text-warning">{entry.stderr}</pre>}
            {entry.error && <pre className="whitespace-pre-wrap break-all text-error">{entry.error}</pre>}
            {/* A silent failure is the worst outcome here: some commands
                write nothing at all and only report through their code. */}
            {entry.exitCode != null && entry.exitCode !== 0 && (
              <p className="text-error">exited {entry.exitCode}</p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-border px-3 py-2 flex items-center gap-1.5">
        <span className="font-mono text-[12px] text-accent shrink-0 max-w-[40%] truncate" title={prompt}>
          {prompt}
        </span>
        <span className="font-mono text-[12px] text-text-faint shrink-0">$</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          aria-label="Command"
          placeholder={busy ? 'Running…' : 'Type a command'}
          className="flex-1 min-w-0 bg-transparent font-mono text-[12px] outline-none placeholder:text-text-faint disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!command.trim() || busy}
          aria-label="Run"
          className="shrink-0 text-text-faint hover:text-text disabled:opacity-30 transition-colors"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <CornerDownLeft size={13} />}
        </button>
      </form>
    </div>
  )
}
