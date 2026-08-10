import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { StatusDot } from '@/components/StatusDot'
import { DiffView } from '@/components/DiffView'
import { api } from '@/lib/api'
import type { AgentEvent, AgentSession, TimelineEntry, Worktree } from '@/lib/types'

const WORKTREE_STATUS_COLOR: Record<Worktree['status'], string> = {
  clean: 'text-success',
  modified: 'text-warning',
  conflicted: 'text-error',
  ahead: 'text-accent',
  behind: 'text-text-muted',
}

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

// spec §86 Worktree screen — Timeline / Diff / Files / Git tabs. Timeline
// tab only implemented so far (Rung 5's real backend surface); other tabs
// land once their backend endpoints exist.
export default function WorktreePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [worktree, setWorktree] = useState<Worktree | null>(null)
  const [session, setSession] = useState<AgentSession | null>(null)
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [agentId, setAgentId] = useState('claude')
  const [prompt, setPrompt] = useState('')
  const [agents, setAgents] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<'timeline' | 'diff'>('timeline')
  const [refreshingStatus, setRefreshingStatus] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!id) return
    api.getWorktree(id).then(setWorktree)
    api.detectAgents().then(setAgents)
    return () => esRef.current?.close()
  }, [id])

  async function refreshStatus() {
    if (!id) return
    setRefreshingStatus(true)
    try {
      setWorktree(await api.getWorktree(id))
    } finally {
      setRefreshingStatus(false)
    }
  }

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
      }
      return next
    })
  }

  async function launch(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !prompt.trim()) return
    setEntries([])
    const created = await api.createSession(id, { agentDefinitionId: agentId, prompt: prompt.trim() })
    setSession(created)
    setPrompt('')
    connectStream(created.id)
  }

  if (!worktree) return null

  return (
    <AppShell sidebar={<div className="p-3 text-sm text-text-muted font-mono">devpipe</div>}>
      <div className="p-6 max-w-[820px]">
        <button type="button" onClick={() => navigate(-1)} className="text-xs text-text-muted hover:text-text">
          ← Back
        </button>
        <div className="flex items-center gap-2 mt-2 mb-1">
          {session && <StatusDot status={session.status} showLabel />}
          <h1 className="text-lg font-medium font-mono">{worktree.branch}</h1>
        </div>
        <div className="flex items-center gap-2 mb-6">
          <span className={`text-xs font-mono ${WORKTREE_STATUS_COLOR[worktree.status]}`}>{worktree.status}</span>
          <button
            type="button"
            onClick={refreshStatus}
            className="text-text-muted hover:text-text"
            aria-label="Refresh worktree status"
          >
            <RefreshCw size={12} className={refreshingStatus ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex gap-4 border-b border-border mb-4 text-sm">
          <button
            type="button"
            onClick={() => setTab('timeline')}
            className={`pb-2 -mb-px border-b-2 ${tab === 'timeline' ? 'border-accent text-text' : 'border-transparent text-text-muted'}`}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setTab('diff')}
            className={`pb-2 -mb-px border-b-2 ${tab === 'diff' ? 'border-accent text-text' : 'border-transparent text-text-muted'}`}
          >
            Diff
          </button>
        </div>

        {tab === 'diff' && <DiffView worktreeId={worktree.id} />}

        {tab === 'timeline' && (
          <>
        <div className="border border-border rounded-lg mb-4 p-4 space-y-3 bg-surface font-mono text-sm min-h-[200px] max-h-[420px] overflow-y-auto">
          {entries.length === 0 && <p className="text-text-muted">No session yet — launch one below.</p>}
          {entries.map((entry, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {entry.type === 'message' && 'role' in entry ? (
                <>
                  <span className="text-accent">{String(entry.role)}: </span>
                  {String((entry as { text: string }).text)}
                </>
              ) : (
                <span className="text-text-muted">[{entry.type}] {JSON.stringify(entry)}</span>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={launch} className="space-y-2">
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
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the task..."
            rows={3}
            disabled={session?.status === 'running' || session?.status === 'starting'}
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={session?.status === 'running' || session?.status === 'starting'}
            className="bg-accent text-white px-3 py-2 rounded-md text-sm disabled:opacity-50"
          >
            Launch session
          </button>
        </form>
          </>
        )}
      </div>
    </AppShell>
  )
}
