import { type RefObject } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { CommandMenu } from '@/components/CommandMenu'
import type { Repository } from '@/lib/types'

// One bordered container with the toolbar inline along its bottom edge,
// matching the reference, rather than a bare textarea with a detached
// button underneath.
export function Composer({
  value,
  onChange,
  onSubmit,
  textareaRef,
  agents,
  agentId,
  onAgentChange,
  repository,
  busy,
  replying,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  agents: Record<string, boolean>
  agentId: string
  onAgentChange: (v: string) => void
  repository: Repository | null
  busy: boolean
  replying: boolean
  error: string | null
}) {
  const canSend = Boolean(value.trim()) && !busy

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
          placeholder={replying ? 'Answer the agent...' : 'Describe the task, or type / for a command'}
          className="w-full bg-transparent px-3 pt-2.5 pb-1 text-[13px] resize-none outline-none placeholder:text-text-faint disabled:opacity-50"
        />

        <div className="flex items-center gap-2 px-2 pb-2">
          {!replying && (
            <select
              value={agentId}
              onChange={(e) => onAgentChange(e.target.value)}
              aria-label="Agent"
              className="bg-surface-elevated border border-border rounded-md px-1.5 py-0.5 text-[12px] text-text-muted outline-none focus:border-accent"
            >
              {Object.entries(agents).map(([id, available]) => (
                <option key={id} value={id} disabled={!available}>
                  {id}
                  {available ? '' : ' (not detected)'}
                </option>
              ))}
            </select>
          )}
          <span className="text-[11px] text-text-faint ml-auto hidden sm:inline">⌘↵</span>
          <button
            type="submit"
            disabled={!canSend}
            aria-label={replying ? 'Send reply' : 'Launch session'}
            className="size-7 grid place-items-center rounded-full bg-action-strong text-white transition-transform active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </div>
    </form>
  )
}
