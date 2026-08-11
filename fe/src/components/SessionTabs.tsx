import { Files, MessageSquare, Plus } from 'lucide-react'
import type { AgentSession } from '@/lib/types'

export type MainView = { kind: 'session'; id: string } | { kind: 'new' } | { kind: 'files' }

function label(session: AgentSession): string {
  const t = session.startedAt ? new Date(session.startedAt) : null
  const time = t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'pending'
  return `${session.agentDefinitionId} · ${time}`
}

// Each worktree keeps its own chats. Labels are agent plus start time, both
// real fields; no invented titles.
export function SessionTabs({
  sessions,
  view,
  onSelect,
}: {
  sessions: AgentSession[]
  view: MainView
  onSelect: (v: MainView) => void
}) {
  const tab = (active: boolean) =>
    `relative flex items-center gap-1.5 h-9 px-3 whitespace-nowrap transition-colors ${
      active ? 'text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
    }`
  const underline = <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" aria-hidden />

  return (
    <div className="flex items-stretch h-9 border-b border-border overflow-x-auto" role="tablist">
      {sessions.map((s) => {
        const active = view.kind === 'session' && view.id === s.id
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect({ kind: 'session', id: s.id })}
            className={tab(active)}
          >
            <MessageSquare size={12} className={active ? 'text-accent' : 'text-text-faint'} />
            <span className="text-[12px]">{label(s)}</span>
            {active && underline}
          </button>
        )
      })}

      <button
        type="button"
        role="tab"
        aria-selected={view.kind === 'new'}
        onClick={() => onSelect({ kind: 'new' })}
        className={tab(view.kind === 'new')}
      >
        <Plus size={12} />
        <span className="text-[12px]">New chat</span>
        {view.kind === 'new' && underline}
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={view.kind === 'files'}
        onClick={() => onSelect({ kind: 'files' })}
        className={`${tab(view.kind === 'files')} ml-auto border-l border-border`}
      >
        <Files size={12} className={view.kind === 'files' ? 'text-accent' : 'text-text-faint'} />
        <span className="text-[12px]">Files</span>
        {view.kind === 'files' && underline}
      </button>
    </div>
  )
}
