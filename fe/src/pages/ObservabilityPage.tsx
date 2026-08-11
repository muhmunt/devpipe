import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { StatusDot } from '@/components/StatusDot'
import { api } from '@/lib/api'
import type { AgentSession } from '@/lib/types'

function elapsed(session: AgentSession): string {
  if (!session.startedAt) return '-'
  const end = session.endedAt ? new Date(session.endedAt) : new Date()
  const ms = end.getTime() - new Date(session.startedAt).getTime()
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.round(sec / 60)}m`
}

// spec §43 observability dashboard — real fields only (agent/status/
// elapsed/exit code). No tokens/cost/files-changed/tests columns since
// nothing in the backend currently reports that data (see sessions.rs's
// list_sessions doc comment) — showing them would be fabricated.
export default function ObservabilityPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<AgentSession[]>([])

  useEffect(() => {
    if (!workspaceId) return
    api.listSessionsObservability(workspaceId).then(setSessions)
  }, [workspaceId])

  return (
    <AppShell>
      <div className="h-full flex flex-col min-h-0">
        <header className="shrink-0 px-6 h-11 flex items-center gap-2 border-b border-border">
          <button type="button" onClick={() => navigate(-1)} className="text-text-muted hover:text-text">
            Back
          </button>
          <h1 className="font-medium">Observability</h1>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="border border-border rounded-lg overflow-hidden max-w-[820px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-xs text-text-muted">
                <th className="text-left px-3 py-2 font-normal">Agent</th>
                <th className="text-left px-3 py-2 font-normal">Status</th>
                <th className="text-left px-3 py-2 font-normal">Elapsed</th>
                <th className="text-left px-3 py-2 font-normal">Exit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-mono">{s.agentDefinitionId}</td>
                  <td className="px-3 py-2">
                    <StatusDot status={s.status} showLabel />
                  </td>
                  <td className="px-3 py-2 text-text-muted">{elapsed(s)}</td>
                  <td className="px-3 py-2 text-text-muted">{s.exitCode ?? '-'}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-text-muted">
                    No sessions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </AppShell>
  )
}
