/* devpipe · design-system: design.md */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowUp, Loader2, Paperclip, X } from 'lucide-react'
import { CommandMenu } from '@/components/CommandMenu'
import type { AgentCatalogEntry, Repository } from '@/lib/types'

// One bordered container with the toolbar inline along its bottom edge:
// what you're talking to, how hard it should think, and what it should look
// at, all attached to the message they apply to rather than parked in a
// settings screen.
//
// Every control here is driven by the agent catalog, which reports what the
// installed CLI actually accepts. An agent with no model choice or no
// thinking setting shows neither, instead of a picker whose options would
// fail at launch.

/** Model aliases and effort levels are lowercase flag values; capitalising
    them for display keeps the flag honest and the label readable. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// A headless agent can't be asked "may I?", so anything it isn't allowed up
// front comes back refused. Each label says what that mode was measured to
// actually permit when run through this server — not what its flag name
// implies.
const PERMISSION_LABELS: Record<string, string> = {
  manual: 'Read only',
  plan: 'Plan only, no changes',
  acceptEdits: 'Can edit files',
  bypassPermissions: 'Can edit and run commands',
}

const pill =
  'bg-surface-elevated border border-border rounded-md px-1.5 py-0.5 text-[11px] text-text-muted outline-none focus-visible:border-accent hover:text-text transition-colors'

function AttachMenu({
  files,
  attached,
  onAttach,
}: {
  files: string[]
  attached: string[]
  onAttach: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A repository has thousands of files; the list is capped so the menu
  // stays usable, and says so rather than silently showing a slice.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = files.filter((f) => !attached.includes(f))
    return q ? pool.filter((f) => f.toLowerCase().includes(q)) : pool
  }, [files, attached, query])
  const shown = matches.slice(0, 50)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Attach a file from this branch"
        title="Attach a file from this branch"
        className="p-1 rounded-md text-text-faint hover:text-text hover:bg-surface-hover active:translate-y-px transition-colors"
      >
        <Paperclip size={14} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-30 w-[320px] max-w-[80vw] bg-surface-elevated border border-border rounded-md shadow-lg overflow-hidden">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a file"
            aria-label="Find a file to attach"
            className="w-full bg-transparent border-b border-border px-2.5 py-1.5 text-[12px] outline-none placeholder:text-text-faint"
          />
          <div className="max-h-[240px] overflow-y-auto py-1">
            {shown.length === 0 ? (
              <p className="px-2.5 py-2 text-[12px] text-text-faint">
                {files.length === 0 ? 'No files in this branch yet.' : 'Nothing matches that.'}
              </p>
            ) : (
              shown.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => {
                    onAttach(path)
                    setQuery('')
                    setOpen(false)
                  }}
                  className="w-full text-left px-2.5 py-1 font-mono text-[11px] truncate hover:bg-surface-hover transition-colors"
                  title={path}
                >
                  {path}
                </button>
              ))
            )}
            {matches.length > shown.length && (
              <p className="px-2.5 pt-1 text-[11px] text-text-faint">
                {matches.length - shown.length} more — keep typing to narrow it down
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Composer({
  value,
  onChange,
  onSubmit,
  textareaRef,
  catalog,
  agentId,
  onAgentChange,
  model,
  onModelChange,
  effort,
  onEffortChange,
  permissionMode,
  onPermissionModeChange,
  attachments,
  onAttachmentsChange,
  files,
  repository,
  busy,
  replying,
  showAgentSelect = true,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  catalog: AgentCatalogEntry[]
  agentId: string
  onAgentChange: (v: string) => void
  model: string
  onModelChange: (v: string) => void
  effort: string
  onEffortChange: (v: string) => void
  permissionMode: string
  onPermissionModeChange: (v: string) => void
  attachments: string[]
  onAttachmentsChange: (next: string[]) => void
  files: string[]
  repository: Repository | null
  busy: boolean
  replying: boolean
  /** The tab strip already carries the agent choice when starting a chat —
      the composer's copy would be a second control setting the same value. */
  showAgentSelect?: boolean
  error: string | null
}) {
  const agent = catalog.find((a) => a.id === agentId)
  const agentName = agent?.name ?? agentId
  const canSend = Boolean(value.trim() || attachments.length) && !busy

  return (
    <form onSubmit={onSubmit} className="relative">
      {error && (
        <p role="alert" className="mb-2 text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-1.5">
          {error}
        </p>
      )}

      {value.startsWith('/') && repository && (
        <CommandMenu
          query={value.slice(1)}
          workspaceId={repository.workspaceId}
          repositoryId={repository.id}
          onSelect={(text) => {
            onChange(text)
            textareaRef.current?.focus()
          }}
        />
      )}

      <div className="border border-border rounded-lg bg-surface focus-within:border-border-strong transition-colors">
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
            {attachments.map((path) => (
              <li
                key={path}
                className="flex items-center gap-1 bg-surface-elevated border border-border rounded-md pl-2 pr-1 py-0.5 max-w-full"
              >
                <span className="font-mono text-[11px] truncate" title={path}>
                  {path.split('/').pop()}
                </span>
                <button
                  type="button"
                  onClick={() => onAttachmentsChange(attachments.filter((p) => p !== path))}
                  aria-label={`Remove ${path}`}
                  className="text-text-faint hover:text-text active:translate-y-px rounded p-0.5"
                >
                  <X size={10} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          rows={3}
          disabled={busy}
          placeholder={replying ? `Reply to ${agentName}…` : `Ask ${agentName} to change something on this branch`}
          className="w-full bg-transparent px-3 pt-2.5 pb-1 text-[13px] resize-none outline-none placeholder:text-text-faint disabled:opacity-50"
        />

        <div className="flex items-center gap-1.5 px-2 pb-2">
          {agent?.supportsAttachments && (
            <AttachMenu
              files={files}
              attached={attachments}
              onAttach={(path) => onAttachmentsChange([...attachments, path])}
            />
          )}

          {!replying && showAgentSelect && (
            <select
              value={agentId}
              onChange={(e) => onAgentChange(e.target.value)}
              aria-label="Which agent to use"
              className={pill}
            >
              {catalog.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.available}>
                  {a.name}
                  {a.available ? '' : ' — not installed'}
                </option>
              ))}
            </select>
          )}

          {/* An empty list means the CLI exposes no such choice, so the
              control is absent rather than disabled-and-mysterious. Both are
              also hidden mid-conversation: a chat that's already running was
              launched with a model and a thinking level, and offering to
              change them on the next turn would suggest a switch the resumed
              conversation doesn't actually make. */}
          {!replying && (agent?.models.length ?? 0) > 0 && (
            <select value={model} onChange={(e) => onModelChange(e.target.value)} aria-label="Model" className={pill}>
              <option value="">Default model</option>
              {agent?.models.map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
            </select>
          )}

          {!replying && (agent?.efforts.length ?? 0) > 0 && (
            <select
              value={effort}
              onChange={(e) => onEffortChange(e.target.value)}
              aria-label="How long it should think before answering"
              title="How long it should think before answering"
              className={pill}
            >
              <option value="">Default thinking</option>
              {agent?.efforts.map((e) => (
                <option key={e} value={e}>
                  {titleCase(e)} thinking
                </option>
              ))}
            </select>
          )}

          {/* What the agent is allowed to do to this branch. Set once, when
              the chat starts, because it's baked into how the conversation
              was launched and can't change under it mid-way. */}
          {!replying && (agent?.permissionModes.length ?? 0) > 0 && (
            <select
              value={permissionMode}
              onChange={(e) => onPermissionModeChange(e.target.value)}
              aria-label="What the agent is allowed to do"
              title="What the agent is allowed to do on this branch"
              className={pill}
            >
              {agent?.permissionModes.map((m) => (
                <option key={m} value={m}>
                  {PERMISSION_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          )}

          <span className="text-[11px] text-text-faint ml-auto hidden sm:inline">⌘↵</span>
          <button
            type="submit"
            disabled={!canSend}
            aria-label={replying ? 'Send reply' : 'Send'}
            className="size-7 grid place-items-center rounded-full bg-action-strong text-white transition-transform active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </div>
    </form>
  )
}
