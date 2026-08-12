/* devpipe · design-system: design.md */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FolderX, Loader2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Composer } from '@/components/Composer'
import { FilesPanel } from '@/components/FilesPanel'
import { FileView } from '@/components/FileView'
import { NewTabChooser } from '@/components/NewTabChooser'
import { RightPanel } from '@/components/RightPanel'
import { SessionHistory } from '@/components/SessionHistory'
import { SessionTabs } from '@/components/SessionTabs'
import { SkeletonRows } from '@/components/Skeleton'
import { StatusBar } from '@/components/StatusBar'
import { TerminalPanel } from '@/components/TerminalPanel'
import { Transcript } from '@/components/Transcript'
import { api } from '@/lib/api'
import { addTab } from '@/lib/tabs'
import {
  getTabState,
  nextTabId,
  setTabState,
  subscribeTabs,
  type WorktreeTab,
} from '@/lib/worktreeTabs'
import type {
  AgentCatalogEntry,
  AgentEvent,
  AgentSession,
  Repository,
  TimelineEntry,
  ToolEntry,
  Worktree,
} from '@/lib/types'

const SSE_EVENT_NAMES = [
  'session_started',
  'message_delta',
  'message_delta_batch',
  'thinking',
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
  const worktreeId = id ?? ''

  // Tabs live outside React so they survive leaving this worktree and coming
  // back. Held in component state they were thrown away on every unmount,
  // which is what made navigation feel like a page reload.
  const tabState = useSyncExternalStore(
    subscribeTabs,
    useCallback(() => getTabState(worktreeId), [worktreeId]),
  )
  const { tabs, activeId } = tabState
  const activeTab = tabs.find((t) => t.id === activeId) ?? null

  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [repository, setRepository] = useState<Repository | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [session, setSession] = useState<AgentSession | null>(null)
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  // Which agent an as-yet-unsent draft tab is aimed at, per tab, so two open
  // drafts can be pointed at different agents.
  const [draftAgents, setDraftAgents] = useState<Record<string, string>>({})
  // Composer text per tab: switching tabs must not eat what you were typing.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  // Claude's own default refuses every edit and command in a headless run,
  // which reads as a broken agent rather than as a safety setting. This is
  // the weakest mode that lets a chat actually do the work it was opened
  // for; the isolated worktree is what makes it safe, and it can be dialled
  // up or down per chat.
  const [permissionMode, setPermissionMode] = useState('acceptEdits')
  const [attachments, setAttachments] = useState<string[]>([])
  const [catalog, setCatalog] = useState<AgentCatalogEntry[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [composerError, setComposerError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const setTabs = useCallback(
    (next: WorktreeTab[], nextActive?: string | null) => {
      setTabState(worktreeId, { tabs: next, activeId: nextActive === undefined ? activeId : nextActive })
    },
    [worktreeId, activeId],
  )

  const openTab = useCallback(
    (tab: Omit<WorktreeTab, 'id'>) => {
      const created = { ...tab, id: nextTabId() } as WorktreeTab
      setTabState(worktreeId, { tabs: [...getTabState(worktreeId).tabs, created], activeId: created.id })
      return created
    },
    [worktreeId],
  )

  const applyEvents = useCallback((events: AgentEvent[]) => {
    setEntries((prev) => {
      const next = [...prev]
      for (const ev of events) {
        // "Thinking…" is a state, not a record: it stands until the agent
        // produces something, then it's replaced by what it produced. Left
        // in place it would litter the history with one line per reasoning
        // block, which is noise nobody can act on.
        if ((ev.type === 'message_delta' || ev.type === 'tool_started') && next[next.length - 1]?.type === 'thinking') {
          next.pop()
        }

        if (ev.type === 'thinking') {
          if (next[next.length - 1]?.type !== 'thinking') next.push({ type: 'thinking', at: ev.at })
          continue
        }

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
        } else if (ev.type === 'tool_started') {
          next.push({ type: 'tool', callId: ev.call_id, tool: ev.tool, input: ev.input, at: ev.at })
        } else if (ev.type === 'tool_output') {
          // A tool's result arrives long after it was announced. Folding the
          // two into one row by the agent's own call id is what makes a run
          // read as "Read note.txt ✓" rather than as the same call listed
          // twice. Sessions recorded before call ids existed have none, so
          // they fall back to a standalone row instead of merging into an
          // unrelated call.
          const at = ev.call_id
            ? next.findIndex((e) => e.type === 'tool' && (e as ToolEntry).callId === ev.call_id)
            : -1
          if (at >= 0) {
            next[at] = { ...(next[at] as ToolEntry), output: ev.output, isError: ev.is_error }
          } else {
            next.push({ type: 'tool', callId: ev.call_id, tool: ev.tool, output: ev.output, isError: ev.is_error })
          }
        } else if (ev.type === 'needs_input') {
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

  const reload = useCallback(() => {
    if (!worktreeId) return
    setLoadError(null)
    api
      .getWorktree(worktreeId)
      .then((wt) => {
        setWorktree(wt)
        addTab({ id: wt.id, branch: wt.branch })
        return api.getRepository(wt.repositoryId).then(setRepository)
      })
      .catch((e) => setLoadError(String((e as Error).message ?? e)))

    api.listWorktreeSessions(worktreeId).then(setSessions).catch(() => setSessions([]))
    // The attach menu offers this branch's tracked files, so it can only
    // suggest paths that exist for the agent to read. A worktree whose folder
    // is gone has none, and that's reported by the banner rather than here.
    api.listFiles(worktreeId).then(setFiles).catch(() => setFiles([]))
  }, [worktreeId])

  useEffect(() => {
    reload()
    api.agentCatalog().then(setCatalog).catch(() => setCatalog([]))
    return () => esRef.current?.close()
  }, [reload])

  // A worktree opened for the first time gets one empty tab, so there is
  // always somewhere to start. Revisiting one keeps whatever was open.
  useEffect(() => {
    if (!worktreeId) return
    const current = getTabState(worktreeId)
    if (current.tabs.length === 0) {
      const first: WorktreeTab = { id: nextTabId(), kind: 'draft' }
      setTabState(worktreeId, { tabs: [first], activeId: first.id })
    } else if (!current.activeId) {
      setTabState(worktreeId, { ...current, activeId: current.tabs[0].id })
    }
  }, [worktreeId])

  // One session, one connection, one source of truth.
  //
  // The events endpoint replays everything already persisted for a session
  // and then tails it live, so the stream alone can render the whole
  // transcript. Fetching the timeline in parallel used to race it — the
  // response landed after live deltas and overwrote them.
  const activeSessionId = activeTab?.kind === 'session' ? activeTab.sessionId : null

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
    // that first frame.
    const t = setTimeout(() => setLoadingTimeline(false), 150)
    return () => clearTimeout(t)
  }, [activeSessionId, connectStream])

  // Default to whichever agent is actually installed. Claude is the first
  // choice because it's the only adapter that can hold a conversation, but
  // defaulting to it on a machine without it would offer a chat that can't
  // start.
  const defaultAgentId = catalog.find((a) => a.available)?.id ?? 'claude'

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

  const activeAgentId =
    activeTab?.kind === 'session'
      ? session?.agentDefinitionId ?? defaultAgentId
      : activeTab
        ? draftAgents[activeTab.id] ?? defaultAgentId
        : defaultAgentId

  const prompt = activeTab ? drafts[activeTab.id] ?? '' : ''
  const setPrompt = (value: string) => {
    if (activeTab) setDrafts((prev) => ({ ...prev, [activeTab.id]: value }))
  }

  async function submitComposer(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || !worktreeId || !activeTab) return
    setComposerError(null)
    const text = prompt.trim()
    try {
      // A chat that's mid-conversation keeps replying in the same tab
      // instead of spinning up a new one. A chat whose process is gone
      // (after a restart) still replies here — the server reattaches to the
      // agent's own stored conversation.
      const continuing = activeTab.kind === 'session' && session
      if (continuing && session) {
        const attached = attachments
        setPrompt('')
        setAttachments([])
        await api.reply(session.id, text, attached)
        setSession((s) => (s ? { ...s, status: 'running' } : s))
        return
      }

      const created = await api.createSession(worktreeId, {
        agentDefinitionId: activeAgentId,
        model: model || undefined,
        reasoningLevel: effort || undefined,
        permissionMode: permissionMode || undefined,
        prompt: text,
        attachments,
      })
      setPrompt('')
      setAttachments([])
      setSessions((prev) => [created, ...prev])
      setSession(created)
      // The draft tab becomes the chat it just started, in place — opening a
      // second tab for it would leave an empty draft behind.
      setTabs(
        tabs.map((t) => (t.id === activeTab.id ? { id: t.id, kind: 'session', sessionId: created.id } : t)),
        activeTab.id,
      )
    } catch (err) {
      setComposerError(String((err as Error).message ?? err))
    }
  }

  // Re-clicking an already-open file switches to its tab instead of
  // duplicating it.
  function openFile(path: string) {
    const existing = tabs.find((t) => t.kind === 'file' && t.path === path)
    if (existing) {
      setTabs(tabs, existing.id)
      return
    }
    openTab({ kind: 'file', path })
  }

  // Closing a chat tab doesn't delete the session (there's no such endpoint,
  // nor should there be) — it drops into the History menu, reopenable there.
  function closeTab(tabId: string) {
    const remaining = tabs.filter((t) => t.id !== tabId)
    const nextActive =
      activeId === tabId ? (remaining[remaining.length - 1]?.id ?? null) : activeId
    if (remaining.length === 0) {
      const fresh: WorktreeTab = { id: nextTabId(), kind: 'draft' }
      setTabState(worktreeId, { tabs: [fresh], activeId: fresh.id })
      return
    }
    setTabState(worktreeId, { tabs: remaining, activeId: nextActive })
  }

  function reopenSession(sessionId: string) {
    const existing = tabs.find((t) => t.kind === 'session' && t.sessionId === sessionId)
    if (existing) {
      setTabs(tabs, existing.id)
      return
    }
    openTab({ kind: 'session', sessionId })
  }

  /** A draft becomes what you picked, in the tab you picked it in. */
  function chooseDraft(tabId: string, choice: WorktreeTab['kind'], agentId?: string) {
    if (choice === 'draft') return
    if (agentId) setDraftAgents((prev) => ({ ...prev, [tabId]: agentId }))
    if (choice === 'terminal' || choice === 'files') {
      setTabs(
        tabs.map((t) => (t.id === tabId ? ({ id: tabId, kind: choice } as WorktreeTab) : t)),
        tabId,
      )
    }
    // A chat stays a draft until its first message: there is no session to
    // point at until then.
  }

  async function restore() {
    if (!worktree) return
    setRestoring(true)
    setLoadError(null)
    try {
      setWorktree(await api.restoreWorktree(worktree.id))
      reload()
    } catch (e) {
      setLoadError(String((e as Error).message ?? e))
    } finally {
      setRestoring(false)
    }
  }

  if (loadError && !worktree) {
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

  const composerBusy = activeTab?.kind === 'session' && session ? RUNNING.has(session.status) : false
  const lastEntry = entries[entries.length - 1]
  // Something is already visibly happening when text is streaming in or a
  // tool is mid-run — both say "working" better than a spinner would, so the
  // spinner is only for the genuinely silent gap before either starts.
  const agentIsStreaming =
    lastEntry?.type === 'message' && 'role' in lastEntry && (lastEntry as { role: string }).role === 'agent'
  const toolIsRunning = lastEntry?.type === 'tool' && (lastEntry as ToolEntry).output === undefined
  const awaitingReply = composerBusy && !agentIsStreaming && !toolIsRunning
  const agentName = catalog.find((a) => a.id === activeAgentId)?.name ?? activeAgentId
  // The open chat's own status is fresher than its row in `sessions`, which
  // is only refetched when the worktree changes — without this the header
  // would keep saying "running" after a chat went idle.
  const runningCount = sessions.filter((s) => RUNNING.has(s.id === session?.id ? session.status : s.status)).length
  const openSessionIds = new Set(tabs.flatMap((t) => (t.kind === 'session' ? [t.sessionId] : [])))
  const closedSessions = sessions.filter((s) => !openSessionIds.has(s.id))
  // A chat is "replying" once it exists at all; the server reattaches to a
  // conversation whose process is gone rather than refusing it.
  const replying = activeTab?.kind === 'session' && Boolean(session)

  return (
    <AppShell
      topBarLeft={
        // Counted from the session rows, not from a hopeful local flag — if
        // it says one is running, one process is running.
        runningCount > 0 ? (
          <span className="flex items-center gap-1.5 text-[12px] text-text-muted min-w-0">
            <span className="size-1.5 rounded-full bg-accent shrink-0 animate-pulse" aria-hidden />
            <span className="truncate">
              {runningCount} agent{runningCount === 1 ? '' : 's'} running
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-text-faint truncate">No agents running</span>
        )
      }
      rightPanel={
        <RightPanel
          worktreeId={worktree.id}
          worktree={worktree}
          repository={repository}
          onWorktreeChange={setWorktree}
          onRepositoryChange={setRepository}
          onOpenFile={openFile}
        />
      }
      statusBar={<StatusBar worktree={worktree} onChange={setWorktree} />}
    >
      <div className="h-full flex flex-col min-h-0 min-w-0">
        <div className="shrink-0 min-w-0">
          <SessionTabs
            tabs={tabs}
            activeId={activeId}
            sessions={sessions}
            catalog={catalog}
            closedSessions={closedSessions}
            onSelect={(tabId) => setTabs(tabs, tabId)}
            onClose={closeTab}
            onNewTab={() => openTab({ kind: 'draft' })}
            onReopenSession={reopenSession}
          />
        </div>

        {/* The directory can disappear without devpipe involved. Saying so
            once, at the top, beats every panel failing separately with the
            same underlying reason. */}
        {worktree.missing && (
          <div className="shrink-0 flex items-start gap-2 border-b border-error/30 bg-error/[0.07] px-4 py-2.5">
            <FolderX size={14} className="text-error shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-error">This worktree's folder is missing.</p>
              <p className="text-[11px] text-text-muted font-mono truncate" title={worktree.path}>
                {worktree.path}
              </p>
              {loadError && <p className="text-[11px] text-error mt-1">{loadError}</p>}
            </div>
            <button
              type="button"
              onClick={restore}
              disabled={restoring}
              className="shrink-0 bg-action-strong text-white px-2.5 py-1 rounded-md text-[12px] disabled:opacity-50"
            >
              {restoring ? 'Restoring…' : 'Restore it'}
            </button>
          </div>
        )}

        {activeTab?.kind === 'terminal' ? (
          <div className="flex-1 min-h-0 min-w-0">
            <TerminalPanel worktreeId={worktree.id} branch={worktree.branch} />
          </div>
        ) : activeTab?.kind === 'files' ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[760px] px-6 py-4">
              <FilesPanel worktreeId={worktree.id} onOpenFile={openFile} />
            </div>
          </div>
        ) : activeTab?.kind === 'file' ? (
          <div className="flex-1 min-h-0 min-w-0">
            <FileView worktreeId={worktree.id} path={activeTab.path} />
          </div>
        ) : activeTab?.kind === 'draft' && !draftAgents[activeTab.id] ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
            <NewTabChooser
              catalog={catalog}
              branch={worktree.branch}
              onChat={(agent) => chooseDraft(activeTab.id, 'session', agent)}
              onTerminal={() => chooseDraft(activeTab.id, 'terminal')}
              onFiles={() => chooseDraft(activeTab.id, 'files')}
            />
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
                  <div>
                    {activeTab?.kind === 'draft' ? (
                      <>
                        <div className="text-center py-12">
                          <p className="text-text-muted">Chat with {agentName}</p>
                          <p className="text-text-faint text-[12px] mt-1">
                            It works in <span className="font-mono">{worktree.branch}</span> only — nothing it does here
                            touches your other branches.
                          </p>
                        </div>
                        <SessionHistory sessions={sessions} catalog={catalog} onOpen={reopenSession} />
                      </>
                    ) : (
                      <p className="text-text-faint text-center py-16">Nothing was said in this chat.</p>
                    )}
                  </div>
                )}

                {!loadingTimeline && entries.length > 0 && <Transcript entries={entries} agentLabel={agentName} />}

                {/* The agent is silent for several seconds before its first
                    token. Without this the app looks like it swallowed the
                    message. */}
                {awaitingReply && (
                  <div className="flex items-center gap-2 text-text-faint">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-[12px]">{agentName} is thinking</span>
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
                  catalog={catalog}
                  agentId={activeAgentId}
                  onAgentChange={(next) => {
                    if (activeTab) setDraftAgents((prev) => ({ ...prev, [activeTab.id]: next }))
                  }}
                  model={model}
                  onModelChange={setModel}
                  effort={effort}
                  onEffortChange={setEffort}
                  permissionMode={permissionMode}
                  onPermissionModeChange={setPermissionMode}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  files={files}
                  repository={repository}
                  busy={composerBusy}
                  replying={replying}
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
