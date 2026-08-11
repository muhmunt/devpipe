/* devpipe · design-system: design.md */
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import { describeTool } from '@/lib/toolLabels'
import type { TimelineEntry, ToolEntry } from '@/lib/types'

// A conversation, laid out the way people already read chat: what you said
// sits right, in its own bubble; what the agent said runs full width on the
// left, because it's prose, code and lists that a narrow bubble would wrap
// to shreds. Between them, one line per action the agent took — the same
// running commentary Claude Code and Cursor show, so a long silence is
// legible as work rather than as a hang.

function ToolRow({ entry }: { entry: ToolEntry }) {
  const [open, setOpen] = useState(false)
  const { verb, subject, icon: Icon } = describeTool(entry.tool, entry.input)
  const failed = entry.isError === true
  const pending = entry.output === undefined && !failed
  const hasDetail = entry.output !== undefined || entry.input !== undefined

  return (
    <div className="text-[12px]">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((o) => !o)}
        aria-expanded={hasDetail ? open : undefined}
        disabled={!hasDetail}
        className={`group flex items-center gap-1.5 max-w-full rounded px-1 -mx-1 py-0.5 text-left transition-colors ${
          hasDetail ? 'hover:bg-surface-hover' : 'cursor-default'
        }`}
      >
        {hasDetail ? (
          open ? (
            <ChevronDown size={11} className="shrink-0 text-text-faint" />
          ) : (
            <ChevronRight size={11} className="shrink-0 text-text-faint" />
          )
        ) : (
          <span className="w-[11px] shrink-0" aria-hidden />
        )}
        {failed ? (
          <AlertTriangle size={12} className="shrink-0 text-error" />
        ) : (
          <Icon size={12} className={`shrink-0 ${pending ? 'text-accent' : 'text-text-faint'}`} />
        )}
        <span className={failed ? 'text-error shrink-0' : 'text-text-muted shrink-0'}>{verb}</span>
        {subject && <span className="font-mono text-[11px] text-text-faint truncate">{subject}</span>}
        {/* "Still running" is the difference between a slow tool and a
            stuck app, so it's stated rather than left to be guessed. */}
        {pending && <span className="shrink-0 text-text-faint">·</span>}
        {pending && <span className="shrink-0 text-accent">working</span>}
      </button>

      {open && (
        <div className="ml-[18px] mt-1 border-l border-border pl-2.5 space-y-1.5">
          {entry.input !== undefined && (
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-text-faint">
              {JSON.stringify(entry.input, null, 2)}
            </pre>
          )}
          {entry.output !== undefined && (
            <pre
              className={`text-[11px] font-mono whitespace-pre-wrap break-words ${failed ? 'text-error' : 'text-text-muted'}`}
            >
              {entry.output.length > 4000 ? `${entry.output.slice(0, 4000)}\n…truncated` : entry.output}
            </pre>
          )}
        </div>
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

          if (role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-br-sm bg-accent-soft border border-accent/20 px-3 py-2">
                  <p className="text-[13px] whitespace-pre-wrap break-words">{text}</p>
                </div>
              </div>
            )
          }

          return (
            <div key={i}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1 text-accent">{agentLabel}</p>
              <Markdown text={text} />
            </div>
          )
        }

        if (entry.type === 'tool') return <ToolRow key={i} entry={entry as ToolEntry} />

        if (entry.type === 'needs_input') {
          return (
            <div key={i} className="flex items-start gap-2 border border-warning/40 bg-warning/[0.06] rounded-md px-2.5 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warning shrink-0 mt-px">
                Waiting on you
              </span>
              <p className="text-[12px] text-text">{String((entry as { question?: string }).question ?? '')}</p>
            </div>
          )
        }

        // Anything else is lifecycle signalling that reached the transcript
        // by mistake. Rendering the raw event name mid-conversation is
        // worse than rendering nothing.
        return null
      })}
    </div>
  )
}
