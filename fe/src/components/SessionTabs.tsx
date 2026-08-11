/* devpipe · design-system: design.md */
import { FileCode, Files, History, MessageSquare, Plus, X } from 'lucide-react'
import { Menu } from '@/components/Menu'
import type { AgentSession } from '@/lib/types'

export type MainView = { kind: 'session'; id: string } | { kind: 'new' } | { kind: 'files' } | { kind: 'file'; path: string }

function label(session: AgentSession): string {
  const t = session.startedAt ? new Date(session.startedAt) : null
  const time = t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'pending'
  return `${session.agentDefinitionId} · ${time}`
}

function basename(path: string): string {
  return path.split('/').pop() || path
}

// Each worktree keeps its own chats. Labels are agent plus start time, both
// real fields; no invented titles. The tab strip isn't chat-only — clicking
// a file (FilesPanel, either mount point) opens it here too, alongside the
// chat sessions. Closing a chat tab never deletes the session (there's no
// delete-session endpoint, nor should there be) — it just drops out of the
// open-tabs row into the History menu, where it can be reopened.
export function SessionTabs({
  sessions,
  closedSessionIds,
  view,
  onSelect,
  agents,
  agentId,
  onAgentChange,
  openFiles,
  onCloseFile,
  onCloseSession,
  onReopenSession,
}: {
  sessions: AgentSession[]
  closedSessionIds: Set<string>
  view: MainView
  onSelect: (v: MainView) => void
  agents: Record<string, boolean>
  agentId: string
  onAgentChange: (v: string) => void
  openFiles: string[]
  onCloseFile: (path: string) => void
  onCloseSession: (id: string) => void
  onReopenSession: (id: string) => void
}) {
  const openSessions = sessions.filter((s) => !closedSessionIds.has(s.id))
  const closedSessions = sessions.filter((s) => closedSessionIds.has(s.id))
  const tab = (active: boolean) =>
    `relative flex items-center gap-1.5 h-9 px-3 whitespace-nowrap transition-colors ${
      active ? 'text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
    }`
  const underline = <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" aria-hidden />

  return (
    <div className="flex items-stretch h-9 border-b border-border overflow-x-auto" role="tablist">
      {openSessions.map((s) => {
        const active = view.kind === 'session' && view.id === s.id
        return (
          <span key={s.id} className={`${tab(active)} pr-1.5 gap-1`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect({ kind: 'session', id: s.id })}
              className="flex items-center gap-1.5"
            >
              <MessageSquare size={12} className={active ? 'text-accent' : 'text-text-faint'} />
              <span className="text-[12px]">{label(s)}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(s.id)
              }}
              aria-label={`Close ${label(s)}`}
              className="text-text-faint hover:text-text active:translate-y-px rounded p-0.5"
            >
              <X size={11} />
            </button>
            {active && underline}
          </span>
        )
      })}

      {openFiles.map((path, i) => {
        const active = view.kind === 'file' && view.path === path
        // File tabs are a different kind of thing than chat sessions — when
        // both are in the strip, a hairline marks where "chat" ends and
        // "files" begins instead of one undifferentiated run of tabs.
        const firstFileTab = i === 0 && sessions.length > 0
        return (
          <span
            key={path}
            className={`relative flex items-center gap-1 h-9 pl-3 pr-1.5 whitespace-nowrap transition-colors ${
              firstFileTab ? 'border-l border-border' : ''
            } ${active ? 'text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'}`}
          >
            <button type="button" role="tab" aria-selected={active} onClick={() => onSelect({ kind: 'file', path })} className="flex items-center gap-1.5">
              <FileCode size={12} className={active ? 'text-accent' : 'text-text-faint'} />
              <span className="text-[12px]" title={path}>
                {basename(path)}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCloseFile(path)
              }}
              aria-label={`Close ${basename(path)}`}
              className="text-text-faint hover:text-text active:translate-y-px rounded p-0.5"
            >
              <X size={11} />
            </button>
            {active && underline}
          </span>
        )
      })}

      <span className="relative flex items-center gap-1.5 pl-1">
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
        {/* Which agent the next "New chat" tab launches — set here, up
            front, not buried in the composer after the tab's already open. */}
        <select
          value={agentId}
          onChange={(e) => {
            onAgentChange(e.target.value)
            onSelect({ kind: 'new' })
          }}
          aria-label="Agent for new chat"
          className="bg-surface-elevated border border-border rounded-md px-1.5 py-0.5 text-[11px] text-text-muted outline-none focus:border-accent"
        >
          {Object.entries(agents).map(([id, available]) => (
            <option key={id} value={id} disabled={!available}>
              {id}
              {available ? '' : ' (not detected)'}
            </option>
          ))}
        </select>
      </span>

      {closedSessions.length > 0 && (
        <div className="ml-auto flex items-center border-l border-border px-1.5">
          <Menu
            label="Chat history"
            trigger={
              <span className="flex items-center gap-1 text-[12px]">
                <History size={12} />
                History
                <span className="text-text-faint tnum">{closedSessions.length}</span>
              </span>
            }
            items={closedSessions.map((s) => ({
              label: label(s),
              icon: <MessageSquare size={12} />,
              onSelect: () => onReopenSession(s.id),
            }))}
          />
        </div>
      )}

      <button
        type="button"
        role="tab"
        aria-selected={view.kind === 'files'}
        onClick={() => onSelect({ kind: 'files' })}
        className={`${tab(view.kind === 'files')} ${closedSessions.length > 0 ? '' : 'ml-auto'} border-l border-border`}
      >
        <Files size={12} className={view.kind === 'files' ? 'text-accent' : 'text-text-faint'} />
        <span className="text-[12px]">Files</span>
        {view.kind === 'files' && underline}
      </button>
    </div>
  )
}
