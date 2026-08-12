/* devpipe · design-system: design.md */
import { useMemo, useState } from 'react'
import { AlertTriangle, Brain, ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { CodeBlock } from '@/components/CodeBlock'
import { CopyButton } from '@/components/CopyButton'
import { CopyableMarkdown } from '@/components/Markdown'
import { describeTool } from '@/lib/toolLabels'
import { languageForPath } from '@/lib/highlight'
import type { TimelineEntry, ToolEntry } from '@/lib/types'

// A conversation, laid out the way people already read chat: what you said
// sits right, in its own bubble; what the agent said runs full width on the
// left, because it's prose, code and lists that a narrow bubble would wrap
// to shreds.
//
// Between them, the work. A single answer can involve dozens of tool calls,
// and one row each buries the actual reply — so a consecutive run collapses
// to one line ("14 tool calls · 09:42") that opens to show every step.

function clockTime(at?: string): string | null {
  if (!at) return null
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** An Edit call carries the before and after text; showing them as a diff is
    far more readable than two JSON string literals with escaped newlines. */
function editDiff(input: unknown): { before: string; after: string } | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const before = record.old_string
  const after = record.new_string
  if (typeof before !== 'string' || typeof after !== 'string') return null
  return { before, after }
}

function ToolDetail({ entry }: { entry: ToolEntry }) {
  const input = (entry.input ?? {}) as Record<string, unknown>
  const path = typeof input.file_path === 'string' ? input.file_path : undefined
  const command = typeof input.command === 'string' ? input.command : undefined
  const content = typeof input.content === 'string' ? input.content : undefined
  const diff = editDiff(entry.input)

  return (
    <div className="space-y-2 pt-1.5">
      {command && <CodeBlock code={command} language="bash" />}
      {content && <CodeBlock code={content} language={path ? languageForPath(path) : undefined} maxLines={40} />}

      {diff && (
        <div className="rounded-md border border-border overflow-hidden">
          <pre className="text-[11px] font-mono leading-[1.55] overflow-x-auto">
            {diff.before.split('\n').map((line, i) => (
              <div key={`d${i}`} className="px-3 text-error bg-error/[0.07] whitespace-pre">
                - {line}
              </div>
            ))}
            {diff.after.split('\n').map((line, i) => (
              <div key={`a${i}`} className="px-3 text-success bg-success/[0.07] whitespace-pre">
                + {line}
              </div>
            ))}
          </pre>
        </div>
      )}

      {/* Anything not already shown above, so nothing the agent actually
          passed is hidden — but without repeating it. */}
      {!command && !content && !diff && entry.input !== undefined && (
        <CodeBlock code={JSON.stringify(entry.input, null, 2)} language="json" maxLines={30} />
      )}

      {entry.output !== undefined && entry.output !== '' && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-text-faint mb-1">
            {entry.isError ? 'Refused' : 'Result'}
          </p>
          {entry.isError ? (
            <div className="code-surface rounded-md border border-error/30 bg-error/[0.07] px-3 py-2">
              <div className="absolute right-1.5 top-1.5">
                <CopyButton text={entry.output} label="Copy result" />
              </div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-error">{entry.output}</pre>
            </div>
          ) : (
            <CodeBlock
              code={entry.output}
              language={entry.tool === 'Read' && path ? languageForPath(path) : undefined}
              maxLines={30}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ToolRow({ entry }: { entry: ToolEntry }) {
  const [open, setOpen] = useState(false)
  const { verb, subject, icon: Icon } = describeTool(entry.tool, entry.input)
  const failed = entry.isError === true
  const pending = entry.output === undefined && !failed

  return (
    <div className="text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex items-center gap-1.5 w-full rounded px-1 -mx-1 py-0.5 text-left hover:bg-surface-hover transition-colors"
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-text-faint" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-text-faint" />
        )}
        {failed ? (
          <AlertTriangle size={12} className="shrink-0 text-error" />
        ) : (
          <Icon size={12} className={`shrink-0 ${pending ? 'text-accent' : 'text-text-faint'}`} />
        )}
        <span className={`shrink-0 ${failed ? 'text-error' : 'text-text-muted'}`}>{verb}</span>
        {subject && <span className="font-mono text-[11px] text-text-faint truncate">{subject}</span>}
        {pending && <span className="shrink-0 text-accent ml-1">working</span>}
      </button>

      {open && <div className="ml-[18px] border-l border-border pl-2.5">{<ToolDetail entry={entry} />}</div>}
    </div>
  )
}

/** A consecutive run of tool calls, folded into one line. */
function ToolGroup({ entries }: { entries: ToolEntry[] }) {
  const [open, setOpen] = useState(false)
  const failures = entries.filter((e) => e.isError).length
  const running = entries.some((e) => e.output === undefined && !e.isError)
  const time = clockTime(entries[0]?.at)

  // A single call is its own row: "1 tool call" that has to be opened to see
  // what it was would be a step backwards from just naming it.
  if (entries.length === 1) return <ToolRow entry={entries[0]} />

  return (
    <div className="text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full rounded px-1 -mx-1 py-0.5 text-left hover:bg-surface-hover transition-colors"
      >
        {open ? (
          <ChevronDown size={11} className="shrink-0 text-text-faint" />
        ) : (
          <ChevronRight size={11} className="shrink-0 text-text-faint" />
        )}
        <Wrench size={12} className={`shrink-0 ${running ? 'text-accent' : 'text-text-faint'}`} />
        <span className="text-text-muted shrink-0 tnum">{entries.length} tool calls</span>
        {time && <span className="text-text-faint shrink-0">· {time}</span>}
        {failures > 0 && (
          <span className="text-error shrink-0 tnum">
            · {failures} refused
          </span>
        )}
        {running && <span className="text-accent shrink-0">· working</span>}
      </button>

      {open && (
        <div className="ml-[18px] border-l border-border pl-2.5 mt-1 space-y-0.5">
          {entries.map((e, i) => (
            <ToolRow key={e.callId || i} entry={e} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Consecutive tool entries become one group; everything else passes through. */
type Block = { kind: 'tools'; tools: ToolEntry[] } | { kind: 'entry'; entry: TimelineEntry }

function group(entries: TimelineEntry[]): Block[] {
  const blocks: Block[] = []
  for (const entry of entries) {
    if (entry.type === 'tool') {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'tools') last.tools.push(entry as ToolEntry)
      else blocks.push({ kind: 'tools', tools: [entry as ToolEntry] })
    } else {
      blocks.push({ kind: 'entry', entry })
    }
  }
  return blocks
}

export function Transcript({ entries, agentLabel }: { entries: TimelineEntry[]; agentLabel: string }) {
  const blocks = useMemo(() => group(entries), [entries])

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        if (block.kind === 'tools') return <ToolGroup key={i} entries={block.tools} />

        const entry = block.entry

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

          return <CopyableMarkdown key={i} text={text} label={agentLabel} />
        }

        if (entry.type === 'thinking') {
          return (
            <div key={i} className="flex items-center gap-1.5 text-[12px] text-text-faint">
              <Brain size={12} />
              <span>Thinking…</span>
            </div>
          )
        }

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
