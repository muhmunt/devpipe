/* devpipe · design-system: design.md */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Composer } from '@/components/Composer'
import { FilesPanel } from '@/components/FilesPanel'
import { FileView } from '@/components/FileView'
import { RightPanel } from '@/components/RightPanel'
import { SessionTabs, type MainView } from '@/components/SessionTabs'
import { SkeletonRows } from '@/components/Skeleton'
import { StatusBar } from '@/components/StatusBar'
import { Transcript } from '@/components/Transcript'
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

// Only these belong in the conversation. Lifecycle events are status, not
// content — see applyEvents.
const VISIBLE_IN_TRANSCRIPT = new Set(['needs_input', 'tool_started', 'tool_output'])

export default function WorktreePage() {
  const { id } = useParams<{ id: string }>()
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [repository, setRepository] = useState<Repository | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [view, setView] = useState<MainView>({ kind: 'new' })
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [closedSessionIds, setClosedSessionIds] = useState<Set<string>>(new Set())
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
  const atBottomRef = useRef(true)

  const applyEvents = useCallback((events: AgentEvent[]) => {
    setEntries((prev) => {
      const next = [...prev]
      for (const ev of events) {
        if (ev.type === 'message_delta') {
          // Deltas are exact substrings of the final text (Claude streams
          // token-by-token, embedded newlines and all) — concatenate
          // directly, don't inject a separator between chunks.
          const last = next[next.length - 1]
          if (last?.type === 'message' && 'role' in last && last.role === ev.role) {
            next[next.length - 1] = { ...last, text: `${last.text}${ev.text}` }
            continue
          }
          next.push({ type: 'message', role: ev.role, text: ev.text })
        } else if (VISIBLE_IN_TRANSCRIPT.has(ev.type)) {
          next.push({ ...ev } as TimelineEntry)
        }
        // Everything else (session_started/idle/completed/error,
        // usage_updated, file_changed) is lifecycle signalling. It drives
        // status below; rendering it would put bare event names in the
        // middle of the conversation.
        if (ev.type === 'session_completed' || ev.type === 'session_error') {
          setSession((s) => (s ? { ...s, status: ev.type === 'session_completed' ? 'completed' : 'failed' } : s))
        }
        if (ev.type === 'session_idle') {
          setSession((s) => (s ? { ...s, status: 'waiting' } : s))
          setTimeout(() => composerRef.current?.focus(), 0)
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
    setOpenFiles([])
    setClosedSessionIds(new Set())

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

  // One session, one connection, one source of truth.
  //
  // The events endpoint replays everything already persisted for a session
  // and then tails it live, so the stream alone can render the whole
  // transcript. The previous version also fetched the timeline in parallel
  // and opened a second EventSource, which raced: the timeline response
  // landed after live deltas and overwrote them, and the second connection
  // closed the first, dropping whatever arrived in between. That is why
  // messages went missing mid-chat.
  //
  // Keyed on the session id alone. Keying on the whole `sessions` array
  // meant starting any new chat wiped and refetched the chat you were
  // reading.
  const activeSessionId = view.kind === 'session' ? view.id : null

  useEffect(() => {
    if (!activeSessionId) {
      esRef.current?.close()
      esRef.current = null
      setEntries([])
      setLoadingTimeline(false)
      return
    }
    setEntries([])
    setLoadingTimeline(true)
    connectStream(activeSessionId)
    // Replay arrives immediately after connect; the skeleton is only for
    // that first frame, so clear it once the connection is established
    // rather than waiting on a request that no longer exists.
    const t = setTimeout(() => setLoadingTimeline(false), 150)
    return () => clearTimeout(t)
  }, [activeSessionId, connectStream])

  // Keep the session record (status, agent) in sync without touching the
  // transcript — status changes must never re-run the stream effect.
  useEffect(() => {
    if (!activeSessionId) {
      setSession(null)
      return
    }
    setSession((prev) => (prev?.id === activeSessionId ? prev : sessions.find((s) => s.id === activeSessionId) ?? null))
  }, [activeSessionId, sessions])

  // Follow the tail only when the reader is already at the bottom. Yanking
  // someone back down while they scroll up to re-read is the single most
  // irritating thing a chat can do.
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTo({ top: el.scrollHeight })
  }, [entries])

  async function submitComposer(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || !id) return
    setComposerError(null)
    try {
      // A session that's mid-conversation (waiting for the next turn, or
      // blocked on a question) keeps replying in the same tab instead of
      // spinning up a new chat.
      const continuing = view.kind === 'session' && (session?.status === 'needs_input' || session?.status === 'waiting')
      if (continuing && session) {
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
      setSession(created)
      // Switching the view is enough: the stream effect connects, and the
      // replay carries the prompt back. Connecting here as well is what
      // produced the duplicate-connection race.
      setView({ kind: 'session', id: created.id })
    } catch (err) {
      setComposerError(String((err as Error).message ?? err))
    }
  }

  // The tab strip isn't chat-only — a file clicked from either FilesPanel
  // mount opens here too. Re-clicking an already-open file just switches to
  // its existing tab instead of duplicating it.
  function openFile(path: string) {
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setView({ kind: 'file', path })
  }

  function closeFile(path: string) {
    setOpenFiles((prev) => prev.filter((p) => p !== path))
    setView((v) => (v.kind === 'file' && v.path === path ? { kind: 'new' } : v))
  }

  // Closing a chat tab doesn't delete the session (there's no such
  // endpoint, nor should there be) — it drops out of the open-tabs row into
  // the History menu, reopenable from there. Closing the active tab falls
  // back to another still-open session, or 'new' if none are left.
  function closeSession(sessionId: string) {
    setClosedSessionIds((prev) => new Set(prev).add(sessionId))
    setView((v) => {
      if (!(v.kind === 'session' && v.id === sessionId)) return v
      const next = sessions.find((s) => s.id !== sessionId && !closedSessionIds.has(s.id))
      return next ? { kind: 'session', id: next.id } : { kind: 'new' }
    })
  }

  function reopenSession(sessionId: string) {
    setClosedSessionIds((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
    setView({ kind: 'session', id: sessionId })
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
  const lastEntry = entries[entries.length - 1]
  const agentIsStreaming =
    lastEntry?.type === 'message' && 'role' in lastEntry && (lastEntry as { role: string }).role === 'agent'
  const awaitingReply = composerBusy && !agentIsStreaming

  return (
    <AppShell
      rightPanel={
        <RightPanel worktreeId={worktree.id} repository={repository} onRepositoryChange={setRepository} onOpenFile={openFile} />
      }
      statusBar={<StatusBar worktree={worktree} onChange={setWorktree} />}
    >
      <div className="h-full flex flex-col min-h-0 min-w-0">
        {/* min-w-0: this is a flex-col item with no overflow of its own —
            without it, SessionTabs' natural content width (many session +
            file tabs) forces this wrapper wider instead of letting
            SessionTabs' own overflow-x-auto scroll the tab row in place. */}
        <div className="shrink-0 min-w-0">
          <SessionTabs
            sessions={sessions}
            closedSessionIds={closedSessionIds}
            view={view}
            onSelect={setView}
            agents={agents}
            onAgentChange={setAgentId}
            openFiles={openFiles}
            onCloseFile={closeFile}
            onCloseSession={closeSession}
            onReopenSession={reopenSession}
          />
        </div>

        {view.kind === 'files' ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[760px] px-6 py-4">
              <FilesPanel worktreeId={worktree.id} onOpenFile={openFile} />
            </div>
          </div>
        ) : view.kind === 'file' ? (
          <div className="flex-1 min-h-0 min-w-0">
            <FileView worktreeId={worktree.id} path={view.path} />
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget
                atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
              }}
              className="flex-1 min-h-0 min-w-0 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-[760px] px-6 py-6 space-y-5">
                {loadingTimeline && <SkeletonRows rows={5} />}

                {!loadingTimeline && entries.length === 0 && (
                  <p className="text-text-faint text-center py-16">
                    {view.kind === 'new' ? 'Describe a task below to start a new chat.' : 'No messages in this chat.'}
                  </p>
                )}

                {!loadingTimeline && entries.length > 0 && (
                  <Transcript entries={entries} agentLabel={(session?.agentDefinitionId ?? agentId).toUpperCase()} />
                )}

                {/* The agent is silent for several seconds before its first
                    token. Without this the app looks like it swallowed the
                    message. Hidden once text starts arriving, because the
                    text itself is then the feedback. */}
                {awaitingReply && (
                  <div className="flex items-center gap-2 text-text-faint">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-[12px]">{(session?.agentDefinitionId ?? agentId)} is working</span>
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
                  busy={composerBusy}
                  replying={view.kind === 'session' && (session?.status === 'needs_input' || session?.status === 'waiting')}
                  showAgentSelect={view.kind !== 'new'}
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
