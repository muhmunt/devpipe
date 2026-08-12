/* devpipe · design-system: design.md */
import { Files, Sparkles, Terminal } from 'lucide-react'
import type { AgentCatalogEntry } from '@/lib/types'

// What an empty tab offers. Clicking "+" opens a tab immediately rather than
// a menu that has to be answered before anything exists — the tab is the
// thing you asked for, and this is it deciding what to be.
export function NewTabChooser({
  catalog,
  branch,
  onChat,
  onTerminal,
  onFiles,
}: {
  catalog: AgentCatalogEntry[]
  branch: string
  onChat: (agentId: string) => void
  onTerminal: () => void
  onFiles: () => void
}) {
  const row =
    'w-full flex items-center gap-3 border border-border rounded-lg bg-surface hover:bg-surface-hover px-3 py-2.5 text-left transition-colors disabled:opacity-40 disabled:hover:bg-surface'

  return (
    <div className="mx-auto w-full max-w-[520px] px-6 py-10">
      <h2 className="font-medium">New tab</h2>
      <p className="text-text-faint text-[12px] mt-0.5 mb-4">
        Everything here runs in <span className="font-mono">{branch}</span> only.
      </p>

      <div className="space-y-2">
        {catalog.map((agent) => (
          <button
            key={agent.id}
            type="button"
            disabled={!agent.available}
            onClick={() => onChat(agent.id)}
            className={row}
          >
            <span className="size-7 grid place-items-center rounded-md bg-accent-soft shrink-0">
              <Sparkles size={14} className="text-accent" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px]">Chat with {agent.name}</span>
              <span className="block text-[11px] text-text-faint">
                {agent.available ? 'A new conversation, with its own history' : 'Not installed on this machine'}
              </span>
            </span>
          </button>
        ))}

        <button type="button" onClick={onTerminal} className={row}>
          <span className="size-7 grid place-items-center rounded-md bg-surface-elevated border border-border shrink-0">
            <Terminal size={14} className="text-text-muted" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px]">Terminal</span>
            <span className="block text-[11px] text-text-faint">Run a command against this branch</span>
          </span>
        </button>

        <button type="button" onClick={onFiles} className={row}>
          <span className="size-7 grid place-items-center rounded-md bg-surface-elevated border border-border shrink-0">
            <Files size={14} className="text-text-muted" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px]">Browse files</span>
            <span className="block text-[11px] text-text-faint">Open a file to read or see its changes</span>
          </span>
        </button>
      </div>
    </div>
  )
}
