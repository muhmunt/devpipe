import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { StatusDot } from '@/components/StatusDot'
import { CommandMenu } from '@/components/CommandMenu'
import { RightPanel } from '@/components/RightPanel'
import { StatusBar } from '@/components/StatusBar'
import { api } from '@/lib/api'
import { addTab } from '@/lib/tabs'
import type { AgentEvent, AgentSession, Repository, TimelineEntry, Worktree } from '@/lib/types'

const SSE_EVENT_NAMES = [
  'session_started',
  'message_delta',
  'message_delta_batch',
  'tool_started',
  'tool_output',
  'file_changed',
  'needs_input',
  'usage_updated',
  'session_idle',
  'session_completed',
  'session_error',
]

// spec §86 Worktree screen — main content is the session timeline/composer;
// Files/Diff/Commits/Scripts live in the persistent right panel (AppShell),
// branch + git action in the bottom status bar. Editor handoff still pending.
export default function WorktreePage() {
  const { id } = useParams<{ id: string }>()
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [repository, setRepository] = useState<Repository | null>(null)
  const [session, setSession] = useState<AgentSession | null>(null)
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [agentId, setAgentId] = useState('claude')
  const [prompt, setPrompt] = useState('')
  const [agents, setAgents] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lastLaunchRef = useRef<{ agentId: string; prompt: string } | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!id) return
    setSession(null)
    setEntries([])
    setLoadError(null)
    setWorktree(null)
    api
      .getWorktree(id)
      .then((wt) => {
        setWorktree(wt)
        addTab({ id: wt.id, branch: wt.branch })
        return api.getRepository(wt.repositoryId).then(setRepository)
      })
      .catch((e) => setLoadError(String((e as Error).message ?? e)))
    api.detectAgents().then(setAgents)
    return () => esRef.current?.close()
  }, [id])

  function connectStream(sessionId: string) {
    esRef.current?.close()
    const es = new EventSource(api.eventsUrl(sessionId))
    for (const name of SSE_EVENT_NAMES) {
      es.addEventListener(name, (e) => {
        const raw = JSON.parse((e as MessageEvent).data)
        applyEvents(name === 'message_delta_batch' ? raw : [raw])
      })
    }
    esRef.current = es
  }

  function applyEvents(events: AgentEvent[]) {
    setEntries((prev) => {
      const next = [...prev]
      for (const ev of events) {
        if (ev.type === 'message_delta') {
          const last = next[next.length - 1]
          if (last?.type === 'message' && 'role' in last && last.role === ev.role) {
            next[next.length - 1] = { ...last, text: `${last.text}\n${ev.text}` }
            continue
          }
          next.push({ type: 'message', role: ev.role, text: ev.text })
        } else {
          next.push({ ...ev } as TimelineEntry)
        }
        if (ev.type === 'session_completed' || ev.type === 'session_error') {
          setSession((s) => (s ? { ...s, status: ev.type === 'session_completed' ? 'completed' : 'failed' } : s))
        }
        if (ev.type === 'needs_input') {
          setSession((s) => (s ? { ...s, status: 'needs_input' } : s))
          setTimeout(() => composerRef.current?.focus(), 0)
        }
      }
      return next
    })
  }

  async function launchNew(agentId: string, prompt: string) {
    if (!id || !prompt.trim()) return
    lastLaunchRef.current = { agentId, prompt }
    setEntries([])
    const created = await api.createSession(id, { agentDefinitionId: agentId, prompt: prompt.trim() })
    setSession(created)
    connectStream(created.id)
  }

  async function submitComposer(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) return
    setComposerError(null)
    try {
      if (session?.status === 'needs_input') {
        const text = prompt.trim()
        setPrompt('')
        await api.reply(session.id, text)
        setSession((s) => (s ? { ...s, status: 'running' } : s))
        return
      }
      await launchNew(agentId, prompt)
      setPrompt('')
    } catch (err) {
      setComposerError(String((err as Error).message ?? err))
    }
  }

  async function restart() {
    if (!lastLaunchRef.current) return
    await launchNew(lastLaunchRef.current.agentId, lastLaunchRef.current.prompt)
  }

  async function deleteWorktree() {
    if (!worktree) return
    setDeleting(true)
    try {
      await api.deleteWorktree(worktree.id)
    } finally {
      setDeleting(false)
    }
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="p-6 max-w-[520px]">
          <p className="text-error text-sm">Couldn't load this worktree: {loadError}</p>
          <p className="text-text-muted text-xs mt-2">
            It may have been deleted. Close this tab and pick another worktree from the sidebar.
          </p>
        </div>
      </AppShell>
    )
  }

  if (!worktree) return null

  return (
    <AppShell
      rightPanel={<RightPanel worktreeId={worktree.id} repository={repository} onRepositoryChange={setRepository} />}
      statusBar={<StatusBar worktree={worktree} onChange={setWorktree} />}
    >
      <div className="p-6 max-w-[820px] mx-auto">
        <div className="flex items-center gap-2 mb-6">
          {session && <StatusDot status={session.status} showLabel />}
          <h1 className="text-lg font-medium font-mono">{worktree.branch}</h1>
        </div>

        <div className="border border-border rounded-lg mb-4 p-4 space-y-3 bg-surface font-mono text-sm min-h-[300px] max-h-[520px] overflow-y-auto">
          {entries.length === 0 && <p className="text-text-muted">No session yet. Launch one below.</p>}
          {entries.map((entry, i) =>
            entry.type === 'message' && 'role' in entry ? (
              <div key={i} className="whitespace-pre-wrap">
                <span className="text-accent">{String(entry.role)}: </span>
                {String((entry as { text: string }).text)}
              </div>
            ) : entry.type === 'needs_input' ? (
              <div key={i} className="border border-warning/40 bg-warning/10 rounded-md px-3 py-2 text-warning">
                <span className="font-medium">Needs input: </span>
                {String((entry as { question?: string }).question ?? '')}
              </div>
            ) : (
              <div key={i} className="whitespace-pre-wrap text-text-muted">
                [{entry.type}] {JSON.stringify(entry)}
              </div>
            ),
          )}
        </div>

        {session?.status === 'failed' && (
          <div className="flex items-center gap-2 mb-4 border border-error/40 bg-error/10 rounded-md px-3 py-2">
            <span className="text-error text-sm flex-1">
              Session failed{session.exitCode !== null ? ` (exit ${session.exitCode})` : ''}.
            </span>
            <button
              type="button"
              onClick={restart}
              disabled={!lastLaunchRef.current}
              className="text-xs bg-surface-elevated border border-border rounded-md px-2 py-1 hover:border-accent disabled:opacity-40"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={deleteWorktree}
              disabled={deleting}
              className="text-xs bg-surface-elevated border border-border rounded-md px-2 py-1 hover:border-error disabled:opacity-40"
            >
              Delete worktree
            </button>
          </div>
        )}

        <form onSubmit={submitComposer} className="space-y-2">
          {session?.status !== 'needs_input' && (
            <div className="flex gap-2">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="bg-surface border border-border rounded-md px-2 py-2 text-sm outline-none"
              >
                {Object.entries(agents).map(([id, available]) => (
                  <option key={id} value={id} disabled={!available}>
                    {id} {available ? '' : '(not detected)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          {composerError && <p className="text-error text-xs">{composerError}</p>}
          <div className="relative">
            {prompt.startsWith('/') && repository && (
              <CommandMenu
                query={prompt.slice(1)}
                workspaceId={repository.workspaceId}
                repositoryId={repository.id}
                onSelect={(text) => {
                  setPrompt(text)
                  composerRef.current?.focus()
                }}
              />
            )}
            <textarea
              ref={composerRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // ⌘Enter / Ctrl+Enter (spec §29) — submit without leaving the textarea.
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={session?.status === 'needs_input' ? 'Answer the agent...' : 'Describe the task... (try "/")'}
              rows={3}
              disabled={session?.status === 'running' || session?.status === 'starting'}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={session?.status === 'running' || session?.status === 'starting'}
            className="bg-accent-strong text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {session?.status === 'needs_input' ? 'Reply' : 'Launch session'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
