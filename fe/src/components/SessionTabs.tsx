/* devpipe · design-system: design.md */
import { ChevronDown, FileCode, Files, History, Plus, Sparkles, Terminal, X } from 'lucide-react'
import { Menu } from '@/components/Menu'
import type { AgentCatalogEntry, AgentSession } from '@/lib/types'

export type MainView =
  | { kind: 'session'; id: string }
  | { kind: 'new' }
  | { kind: 'files' }
  | { kind: 'file'; path: string }
  | { kind: 'terminal' }

/** Agent plus start time — both real fields. A tab is never given an
    invented title, because the only thing that could generate one is the
    conversation, and reading it to name it would be a guess. */
function label(session: AgentSession, catalog: AgentCatalogEntry[]): string {
  const name = catalog.find((a) => a.id === session.agentDefinitionId)?.name ?? session.agentDefinitionId
  const t = session.startedAt ? new Date(session.startedAt) : null
  const time = t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'starting'
  return `${name} · ${time}`
}

function basename(path: string): string {
  return path.split('/').pop() || path
}

// Each worktree keeps its own chats, files and terminal side by side. The
// strip scrolls; the controls that open and reopen tabs sit outside that
// scrolling region so they stay reachable no matter how many tabs are open.
export function SessionTabs({
  sessions,
  closedSessionIds,
  view,
  onSelect,
  catalog,
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
  catalog: AgentCatalogEntry[]
  onAgentChange: (v: string) => void
  openFiles: string[]
  onCloseFile: (path: string) => void
  onCloseSession: (id: string) => void
  onReopenSession: (id: string) => void
}) {
  const openSessions = sessions.filter((s) => !closedSessionIds.has(s.id))
  const closedSessions = sessions.filter((s) => closedSessionIds.has(s.id))

  const tabClass = (active: boolean) =>
    `relative flex items-center gap-2 h-11 pl-3 pr-2 whitespace-nowrap transition-colors ${
      active ? 'text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
    }`
  const underline = <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" aria-hidden />

  return (
    <div className="flex items-stretch h-11 border-b border-border min-w-0">
      {/* Only the tabs scroll. */}
      <div className="flex items-stretch overflow-x-auto min-w-0" role="tablist">
        {openSessions.map((s) => {
          const active = view.kind === 'session' && view.id === s.id
          return (
            <span key={s.id} className={tabClass(active)}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect({ kind: 'session', id: s.id })}
                className="flex items-center gap-2"
              >
                <Sparkles size={14} className={active ? 'text-accent' : 'text-text-faint'} />
                <span className="text-[13px]">{label(s, catalog)}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseSession(s.id)
                }}
                aria-label={`Close ${label(s, catalog)}`}
                className="text-text-faint hover:text-text active:translate-y-px rounded p-0.5"
              >
                <X size={12} />
              </button>
              {active && underline}
            </span>
          )
        })}

        {openFiles.map((path, i) => {
          const active = view.kind === 'file' && view.path === path
          // File tabs are a different kind of thing than chat sessions —
          // when both are in the strip, a hairline marks where "chat" ends
          // and "files" begins instead of one undifferentiated run of tabs.
          const firstFileTab = i === 0 && openSessions.length > 0
          return (
            <span key={path} className={`${tabClass(active)} ${firstFileTab ? 'border-l border-border' : ''}`}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect({ kind: 'file', path })}
                className="flex items-center gap-2"
              >
                <FileCode size={14} className={active ? 'text-accent' : 'text-text-faint'} />
                <span className="text-[13px] italic" title={path}>
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
                <X size={12} />
              </button>
              {active && underline}
            </span>
          )
        })}

        {view.kind === 'terminal' && (
          <span className={`${tabClass(true)} border-l border-border`}>
            <Terminal size={14} className="text-accent" />
            <span className="text-[13px]">Terminal</span>
            <button
              type="button"
              onClick={() => onSelect({ kind: 'new' })}
              aria-label="Close terminal"
              className="text-text-faint hover:text-text active:translate-y-px rounded p-0.5"
            >
              <X size={12} />
            </button>
            {underline}
          </span>
        )}
      </div>

      {/* One entry point for opening a tab, listing what kinds exist. Sits
          outside the scroll container: previously it lived inside, where the
          strip's own overflow clipped the dropdown — the menu opened and was
          invisible, which read as the button being broken. */}
      <div className="shrink-0 flex items-center pl-1.5 relative">
        <Menu
          label="Open a new tab"
          align="left"
          numbered
          triggerClassName={`flex items-center gap-1 h-11 px-2 transition-colors ${
            view.kind === 'new' ? 'text-text' : 'text-text-muted hover:text-text'
          }`}
          footer="Chats keep their own history per tab"
          trigger={
            <>
              <Plus size={15} />
              <ChevronDown size={12} className="text-text-faint" />
            </>
          }
          items={[
            ...catalog.map((a) => ({
              label: a.name,
              icon: <Sparkles size={14} />,
              disabled: !a.available,
              hint: a.available ? undefined : 'not installed',
              onSelect: () => {
                onAgentChange(a.id)
                onSelect({ kind: 'new' })
              },
            })),
            { label: 'Terminal', icon: <Terminal size={14} />, onSelect: () => onSelect({ kind: 'terminal' }) },
            { label: 'Files', icon: <Files size={14} />, onSelect: () => onSelect({ kind: 'files' }) },
          ]}
        />
        {view.kind === 'new' && underline}
      </div>

      <div className="ml-auto shrink-0 flex items-center gap-1 pr-2 pl-2">
        {/* Reopening a closed chat. Disabled rather than hidden when there
            are none, so the control doesn't appear and vanish. */}
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
              label: label(s, catalog),
              icon: <Sparkles size={14} />,
              onSelect: () => onReopenSession(s.id),
            }))}
          />
        ) : (
          <span className="flex items-center h-11 px-2 text-text-faint/40" title="No closed chats yet">
            <History size={15} />
          </span>
        )}

        <span className="relative flex items-stretch">
          <button
            type="button"
            role="tab"
            aria-selected={view.kind === 'files'}
            onClick={() => onSelect({ kind: 'files' })}
            className={`${tabClass(view.kind === 'files')} pr-3 border-l border-border`}
          >
            <Files size={14} className={view.kind === 'files' ? 'text-accent' : 'text-text-faint'} />
            <span className="text-[13px]">Files</span>
            {view.kind === 'files' && underline}
          </button>
        </span>
      </div>
    </div>
  )
}
