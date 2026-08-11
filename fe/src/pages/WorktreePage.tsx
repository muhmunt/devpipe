import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Composer } from '@/components/Composer'
import { FilesPanel } from '@/components/FilesPanel'
import { Markdown } from '@/components/Markdown'
import { RightPanel } from '@/components/RightPanel'
import { SessionTabs, type MainView } from '@/components/SessionTabs'
import { SkeletonRows } from '@/components/Skeleton'
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

const RUNNING = new Set(['starting', 'running'])

export default function WorktreePage() {
  const { id } = useParams<{ id: string }>()
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [repository, setRepository] = useState<Repository | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [view, setView] = useState<MainView>({ kind: 'new' })
  const [session, setSession] = useState<AgentSession | null>(null)
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [agentId, setAgentId] = useState('claude')
  const [prompt, setPrompt] = useState('')
  const [agents, setAgents] = useState<Record<string, boolean>>({})
  const [composerError, setComposerError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const applyEvents = useCallback((events: AgentEvent[]) => {
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
  }, [])

  const connectStream = useCallback(
    (sessionId: string) => {
      esRef.current?.close()
      const es = new EventSource(api.eventsUrl(sessionId))
      for (const name of SSE_EVENT_NAMES) {
        es.addEventListener(name, (e) => {
          const raw = JSON.parse((e as MessageEvent).data)
          applyEvents(name === 'message_delta_batch' ? raw : [raw])
        })
      }
      esRef.current = es
    },
    [applyEvents],
  )

  // Load the worktree, its repository, and every chat that has run against it.
  useEffect(() => {
    if (!id) return
    setLoadError(null)
    setWorktree(null)
    setSession(null)
    setEntries([])
    setView({ kind: 'new' })

    api
      .getWorktree(id)
      .then((wt) => {
        setWorktree(wt)
        addTab({ id: wt.id, branch: wt.branch })
        return api.getRepository(wt.repositoryId).then(setRepository)
      })
      .catch((e) => setLoadError(String((e as Error).message ?? e)))

    api
      .listWorktreeSessions(id)
      .then((list) => {
        setSessions(list)
        if (list.length) setView({ kind: 'session', id: list[0].id })
      })
      .catch(() => setSessions([]))

    api.detectAgents().then(setAgents).catch(() => setAgents({}))
    return () => esRef.current?.close()
  }, [id])

  // Switching to an existing session replays its transcript, and reattaches
  // the live stream when that session is still running.
  useEffect(() => {
    if (view.kind !== 'session') {
      esRef.current?.close()
      return
    }
    const target = sessions.find((s) => s.id === view.id)
    if (!target) return
    setSession(target)
    setEntries([])
    setLoadingTimeline(true)
    api
      .getTimeline(view.id)
      .then((t) => setEntries(t))
      .catch(() => setEntries([]))
      .finally(() => setLoadingTimeline(false))

    if (RUNNING.has(target.status)) connectStream(target.id)
    else esRef.current?.close()
  }, [view, sessions, connectStream])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries])

  async function submitComposer(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || !id) return
    setComposerError(null)
    try {
      if (session?.status === 'needs_input' && view.kind === 'session') {
        const text = prompt.trim()
        setPrompt('')
        await api.reply(session.id, text)
        setSession((s) => (s ? { ...s, status: 'running' } : s))
        return
      }
      // Starting a chat adds to this worktree's list rather than replacing
      // whatever was open.
      const created = await api.createSession(id, { agentDefinitionId: agentId, prompt: prompt.trim() })
      setPrompt('')
      setSessions((prev) => [created, ...prev])
      setEntries([])
      setSession(created)
      setView({ kind: 'session', id: created.id })
      connectStream(created.id)
    } catch (err) {
      setComposerError(String((err as Error).message ?? err))
    }
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="p-6 max-w-[520px]">
          <p className="text-error">Couldn't load this worktree: {loadError}</p>
          <p className="text-text-muted text-[12px] mt-2">
            It may have been deleted. Close the tab and pick another worktree from the sidebar.
          </p>
        </div>
      </AppShell>
    )
  }

  if (!worktree) return null

  const composerBusy = view.kind === 'session' && session ? RUNNING.has(session.status) : false

  return (
    <AppShell
      rightPanel={<RightPanel worktreeId={worktree.id} repository={repository} onRepositoryChange={setRepository} />}
      statusBar={<StatusBar worktree={worktree} onChange={setWorktree} />}
    >
      <div className="h-full flex flex-col min-h-0">
        <div className="shrink-0">
          <SessionTabs sessions={sessions} view={view} onSelect={setView} />
        </div>

        {view.kind === 'files' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[760px] px-6 py-4">
              <FilesPanel worktreeId={worktree.id} />
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
              <div className="mx-auto w-full max-w-[760px] px-6 py-6 space-y-5">
                {loadingTimeline && <SkeletonRows rows={5} />}

                {!loadingTimeline && entries.length === 0 && (
                  <p className="text-text-faint text-center py-16">
                    {view.kind === 'new' ? 'Describe a task below to start a new chat.' : 'No messages in this chat.'}
                  </p>
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
                    const toolLabel = String((entry as { tool?: string }).tool ?? entry.type)
                    const output = String((entry as { output?: string }).output ?? '')
                    return (
                      <div key={i} className="border border-border rounded-lg overflow-hidden">
                        <p className="px-3 py-1 bg-surface-elevated text-[11px] font-mono text-text-muted">{toolLabel}</p>
                        {output && (
                          <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap text-text-muted">{output}</pre>
                        )}
                      </div>
                    )
                  }

                  return (
                    <p key={i} className="text-[11px] font-mono text-text-faint">
                      {entry.type}
                    </p>
                  )
                })}
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
                  busy={composerBusy}
                  replying={view.kind === 'session' && session?.status === 'needs_input'}
                  error={composerError}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
