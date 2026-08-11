/* devpipe · design-system: design.md */
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import type { TimelineEntry } from '@/lib/types'

// Engineering transcript, not a messaging app: labels above plain text
// instead of speech bubbles, no avatars, tool calls collapsed by default.
function ToolRow({ tool, input, output }: { tool: string; input?: unknown; output?: string }) {
  const [open, setOpen] = useState(false)
  const detail = output ?? (input !== undefined ? JSON.stringify(input, null, 2) : '')

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-2.5 py-1 text-left text-[11px] font-mono text-text-muted hover:bg-surface-hover transition-colors"
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-text-faint" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-text-faint" />
        )}
        {tool}
      </button>
      {open && detail && (
        <pre className="px-2.5 py-2 border-t border-border text-[11px] font-mono whitespace-pre-wrap text-text-muted bg-surface">
          {detail}
        </pre>
      )}
    </div>
  )
}

export function Transcript({ entries, agentLabel }: { entries: TimelineEntry[]; agentLabel: string }) {
  return (
    <div className="space-y-4">
      {entries.map((entry, i) => {
        if (entry.type === 'message' && 'role' in entry) {
          const role = String(entry.role)
          const text = String((entry as { text: string }).text)
          const isUser = role === 'user'
          return (
            <div key={i}>
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.08em] mb-1 ${
                  isUser ? 'text-text-faint' : 'text-accent'
                }`}
              >
                {isUser ? 'You' : agentLabel}
              </p>
              {isUser ? <p className="text-[13px] whitespace-pre-wrap">{text}</p> : <Markdown text={text} />}
            </div>
          )
        }

        if (entry.type === 'needs_input') {
          return (
            <div key={i} className="flex items-start gap-2 border border-warning/40 bg-warning/[0.06] rounded-md px-2.5 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warning shrink-0 mt-px">
                Input needed
              </span>
              <p className="text-[12px] text-text">{String((entry as { question?: string }).question ?? '')}</p>
            </div>
          )
        }

        if (entry.type === 'tool_started' || entry.type === 'tool_output') {
          const tool = String((entry as { tool?: string }).tool ?? 'tool')
          const input = (entry as { input?: unknown }).input
          const output = (entry as { output?: string }).output
          return <ToolRow key={i} tool={tool} input={input} output={output} />
        }

        // Anything else is lifecycle signalling that reached the transcript
        // by mistake. Rendering the raw event name mid-conversation is
        // worse than rendering nothing.
        return null
      })}
    </div>
  )
}
