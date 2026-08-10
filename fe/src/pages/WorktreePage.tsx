import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Composer } from '@/components/Composer'
import { Markdown } from '@/components/Markdown'
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
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-6 py-6 space-y-5">
            {entries.length === 0 && (
              <p className="text-text-faint text-center py-16">No session yet. Describe a task below to start one.</p>
            )}

            {entries.map((entry, i) => {
              if (entry.type === 'message' && 'role' in entry) {
                const role = String(entry.role)
                const text = String((entry as { text: string }).text)
                if (role === 'user') {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-xl bg-surface-elevated px-3.5 py-2 whitespace-pre-wrap">{text}</div>
                    </div>
                  )
                }
                return (
                  <div key={i}>
                    <p className="text-[11px] text-text-faint mb-1.5">{session?.agentDefinitionId ?? role}</p>
                    <Markdown text={text} />
                  </div>
                )
              }

              if (entry.type === 'needs_input') {
                return (
                  <div key={i} className="border border-warning/40 bg-warning/10 rounded-lg px-3 py-2 text-warning">
                    <span className="font-medium">Needs input: </span>
                    {String((entry as { question?: string }).question ?? '')}
                  </div>
                )
              }

              if (entry.type === 'tool_output' || entry.type === 'tool_started') {
                const label = String((entry as { tool?: string }).tool ?? entry.type)
                const output = String((entry as { output?: string }).output ?? '')
                return (
                  <div key={i} className="border border-border rounded-lg overflow-hidden">
                    <p className="px-3 py-1 bg-surface-elevated text-[11px] font-mono text-text-muted">{label}</p>
                    {output && <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap text-text-muted">{output}</pre>}
                  </div>
                )
              }

              return (
                <p key={i} className="text-[11px] font-mono text-text-faint">
                  {entry.type}
                </p>
              )
            })}

            {session?.status === 'failed' && (
              <div className="flex items-center gap-2 border border-error/40 bg-error/10 rounded-lg px-3 py-2">
                <span className="text-error flex-1">
                  Session failed{session.exitCode !== null ? ` (exit ${session.exitCode})` : ''}.
                </span>
                <button
                  type="button"
                  onClick={restart}
                  disabled={!lastLaunchRef.current}
                  className="text-[12px] bg-surface-elevated border border-border rounded-md px-2 py-1 hover:border-accent disabled:opacity-40 transition-colors"
                >
                  Restart
                </button>
                <button
                  type="button"
                  onClick={deleteWorktree}
                  disabled={deleting}
                  className="text-[12px] bg-surface-elevated border border-border rounded-md px-2 py-1 hover:border-error disabled:opacity-40 transition-colors"
                >
                  Delete worktree
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-3">
          <div className="mx-auto w-full max-w-[760px]">
            <Composer
              value={prompt}
              onChange={setPrompt}
              onSubmit={submitComposer}
              textareaRef={composerRef}
              agents={agents}
              agentId={agentId}
              onAgentChange={setAgentId}
              repository={repository}
              busy={session?.status === 'running' || session?.status === 'starting'}
              replying={session?.status === 'needs_input'}
              error={composerError}
            />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
