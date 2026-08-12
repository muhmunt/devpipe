/* devpipe · design-system: design.md */
import { Brain, CircleCheck, CircleDot, CircleX, Loader2, MessageSquare } from 'lucide-react'
import { relativeTime } from '@/lib/time'
import type { AgentCatalogEntry, AgentSession, SessionStatus } from '@/lib/types'

// Every chat that has run on this branch. It lives in the main area, not
// only behind a menu, because on a branch an agent has been working for a
// while the history *is* the record of what happened — closing a tab
// shouldn't tuck it out of sight.

const STATUS: Record<SessionStatus, { label: string; className: string; icon: typeof CircleDot }> = {
  created: { label: 'Starting', className: 'text-text-faint', icon: CircleDot },
  starting: { label: 'Starting', className: 'text-accent', icon: Loader2 },
  running: { label: 'Working', className: 'text-accent', icon: Loader2 },
  needs_input: { label: 'Waiting on you', className: 'text-warning', icon: CircleDot },
  waiting: { label: 'Ready for your reply', className: 'text-success', icon: CircleDot },
  completed: { label: 'Finished', className: 'text-text-faint', icon: CircleCheck },
  failed: { label: 'Failed', className: 'text-error', icon: CircleX },
  stopped: { label: 'Stopped', className: 'text-text-faint', icon: CircleX },
}

export function SessionHistory({
  sessions,
  catalog,
  onOpen,
}: {
  sessions: AgentSession[]
  catalog: AgentCatalogEntry[]
  onOpen: (id: string) => void
}) {
  if (sessions.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-[11px] uppercase tracking-[0.08em] text-text-faint mb-2">
        Earlier on this branch
      </h2>
      <ul className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {sessions.map((s) => {
          const agent = catalog.find((a) => a.id === s.agentDefinitionId)
          const status = STATUS[s.status]
          const Icon = status.icon
          const spinning = s.status === 'running' || s.status === 'starting'
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
              >
                <MessageSquare size={12} className="shrink-0 text-text-faint" />
                <span className="text-[12px] truncate">{agent?.name ?? s.agentDefinitionId}</span>

                {/* Model and thinking level are recorded per chat, so the
                    history says how each one was set up rather than
                    implying they were all the same. */}
                {s.model && <span className="text-[11px] text-text-faint font-mono shrink-0">{s.model}</span>}
                {s.reasoningLevel && (
                  <span className="hidden sm:flex items-center gap-0.5 text-[11px] text-text-faint shrink-0">
                    <Brain size={10} />
                    {s.reasoningLevel}
                  </span>
                )}

                <span className={`ml-auto flex items-center gap-1 text-[11px] shrink-0 ${status.className}`}>
                  <Icon size={10} className={spinning ? 'animate-spin' : ''} />
                  {status.label}
                </span>
                <span className="text-[11px] text-text-faint shrink-0 tnum w-[64px] text-right">
                  {s.startedAt ? relativeTime(s.startedAt) : '—'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
