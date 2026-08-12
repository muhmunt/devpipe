/* devpipe · design-system: design.md */
import { FileCode, Files, History, Plus, Sparkles, SquarePlus, Terminal, X } from 'lucide-react'
import { Menu } from '@/components/Menu'
import type { AgentCatalogEntry, AgentSession } from '@/lib/types'
import type { WorktreeTab } from '@/lib/worktreeTabs'

/** Agent plus start time — both real fields. A tab is never given an
    invented title, because the only thing that could generate one is the
    conversation, and reading it to name it would be a guess. */
function sessionLabel(session: AgentSession | undefined, catalog: AgentCatalogEntry[]): string {
  if (!session) return 'Chat'
  const name = catalog.find((a) => a.id === session.agentDefinitionId)?.name ?? session.agentDefinitionId
  const t = session.startedAt ? new Date(session.startedAt) : null
  const time = t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'starting'
  return `${name} · ${time}`
}

function iconFor(tab: WorktreeTab) {
  switch (tab.kind) {
    case 'session':
      return Sparkles
    case 'file':
      return FileCode
    case 'terminal':
      return Terminal
    case 'files':
      return Files
    case 'draft':
      return SquarePlus
  }
}

// One strip, one list of tabs, in the order they were opened. "+" opens a
// tab straight away — the tab itself asks what it should be — so the button
// always does something visible, which the old menu-first version did not.
export function SessionTabs({
  tabs,
  activeId,
  sessions,
  catalog,
  closedSessions,
  onSelect,
  onClose,
  onNewTab,
  onReopenSession,
}: {
  tabs: WorktreeTab[]
  activeId: string | null
  sessions: AgentSession[]
  catalog: AgentCatalogEntry[]
  closedSessions: AgentSession[]
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  onNewTab: () => void
  onReopenSession: (sessionId: string) => void
}) {
  function title(tab: WorktreeTab): string {
    switch (tab.kind) {
      case 'session':
        return sessionLabel(sessions.find((s) => s.id === tab.sessionId), catalog)
      case 'file':
        return tab.path.split('/').pop() || tab.path
      case 'terminal':
        return 'Terminal'
      case 'files':
        return 'Files'
      case 'draft':
        return 'New tab'
    }
  }

  return (
    <div className="flex items-stretch h-11 border-b border-border min-w-0">
      <div className="flex items-stretch overflow-x-auto min-w-0" role="tablist">
        {tabs.map((tab) => {
          const active = tab.id === activeId
          const Icon = iconFor(tab)
          const label = title(tab)
          return (
            <span
              key={tab.id}
              className={`relative flex items-center gap-2 h-11 pl-3 pr-2 whitespace-nowrap transition-colors ${
                active ? 'text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(tab.id)}
                className="flex items-center gap-2 min-w-0"
              >
                <Icon size={14} className={active ? 'text-accent' : 'text-text-faint'} />
                <span
                  className={`text-[13px] truncate max-w-[200px] ${tab.kind === 'file' ? 'italic' : ''}`}
                  title={tab.kind === 'file' ? tab.path : label}
                >
                  {label}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                aria-label={`Close ${label}`}
                className="text-text-faint hover:text-text active:translate-y-px rounded p-0.5"
              >
                <X size={12} />
              </button>
              {active && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" aria-hidden />}
            </span>
          )
        })}
      </div>

      {/* Outside the scroll container, so it stays reachable however many
          tabs are open — and so its own rendering can't be clipped by the
          strip's overflow. */}
      <button
        type="button"
        onClick={onNewTab}
        aria-label="New tab"
        title="New tab"
        className="shrink-0 flex items-center h-11 px-2.5 text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
      >
        <Plus size={15} />
      </button>

      <div className="ml-auto shrink-0 flex items-center pr-2">
        {closedSessions.length > 0 ? (
          <Menu
            label="Reopen a closed chat"
            numbered
            trigger={
              <span className="flex items-center gap-1 text-[12px]">
                <History size={15} />
                <span className="text-text-faint tnum">{closedSessions.length}</span>
              </span>
            }
            triggerClassName="flex items-center h-11 px-2 text-text-muted hover:text-text transition-colors"
            items={closedSessions.map((s) => ({
              label: sessionLabel(s, catalog),
              icon: <Sparkles size={14} />,
              onSelect: () => onReopenSession(s.id),
            }))}
          />
        ) : (
          <span className="flex items-center h-11 px-2 text-text-faint/40" title="No closed chats yet">
            <History size={15} />
          </span>
        )}
      </div>
    </div>
  )
}
