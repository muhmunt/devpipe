import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { api } from '@/lib/api'
import type { RunWithCard } from '@/lib/types'

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return 'in progress'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

export default function LogsPage() {
  const [runs, setRuns] = useState<RunWithCard[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api.getRecentRuns(100).then(setRuns)
  }, [])

  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto w-full px-4 py-8">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
          Global process log
        </p>
        <h1 className="text-2xl font-bold tracking-tight mb-8">Logs</h1>

        {runs === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {runs !== null && runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}

        <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
          {runs?.map((r) => {
            const isExpanded = expanded === r.id
            const state = r.exitCode === 0 ? 'success' : r.exitCode == null ? 'running' : 'failed'
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                  className="focus-ring w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${
                      state === 'success' ? 'bg-green-500' : state === 'failed' ? 'bg-destructive' : 'bg-primary animate-pulse'
                    }`}
                  />
                  <span className="text-sm font-medium truncate">{r.cardTitle}</span>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">{r.stage}</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">agent: {r.agent}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">
                    {formatDuration(r.startedAt, r.finishedAt)} · {relativeTime(r.startedAt)}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border">
                    <div className="bg-secondary/60 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="size-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {r.cmd}
                        </span>
                      </div>
                      <Link to={`/cards/${r.cardId}`} className="text-[10px] text-primary hover:underline">
                        Open card →
                      </Link>
                    </div>
                    <pre className="terminal-panel font-mono text-xs p-4 max-h-64 overflow-y-auto whitespace-pre-wrap">
                      {r.stdout || '(no output)'}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
