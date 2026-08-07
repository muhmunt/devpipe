import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StageActionBar from '@/components/StageActionBar'
import { api } from '@/lib/api'
import type { PlanWithTasks, StreamEvent, Task } from '@/lib/types'

export default function PlanStep({
  cardId,
  prdId,
  planId,
  revisionTick,
  onAdvance,
}: {
  cardId: string
  prdId: string
  planId: string | null
  revisionTick: number
  onAdvance: () => void
}) {
  const [data, setData] = useState<PlanWithTasks | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapText, setBootstrapText] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!planId) {
      setData(null)
      return
    }
    const d = await api.getPlan(cardId, planId)
    setData(d)
  }

  // revisionTick bumps whenever the sidebar chat completes a plan
  // revision — this re-fetches the (now server-side-revised) task list.
  useEffect(() => {
    load()
  }, [cardId, planId, revisionTick])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== 'plan') return
      if (ev.type === 'log_delta' && ev.line != null) {
        setBootstrapText((prev) => prev + ev.line)
      } else if (ev.type === 'log' && ev.line != null) {
        setBootstrapText((prev) => (prev ? prev + '\n' + ev.line : ev.line!))
      } else if (ev.type === 'done') {
        setBootstrapping(false)
        load()
      } else if (ev.type === 'error') {
        setBootstrapping(false)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId])

  const bootstrap = async () => {
    setError(null)
    setBootstrapping(true)
    setBootstrapText('')
    try {
      const d = await api.generatePlan(cardId, prdId)
      setData(d)
      onAdvance() // re-syncs CardDetail's planId — first-ever plan auto-activates server-side
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBootstrapping(false)
    }
  }

  const renameTask = async (task: Task, title: string) => {
    if (!planId) return
    await api.updateTask(cardId, planId, task.id, { title })
    load()
  }

  const moveTask = async (tasks: Task[], index: number, dir: -1 | 1) => {
    if (!planId) return
    const other = tasks[index + dir]
    if (!other) return
    const a = tasks[index]
    await Promise.all([
      api.updateTask(cardId, planId, a.id, { order: other.order }),
      api.updateTask(cardId, planId, other.id, { order: a.order }),
    ])
    load()
  }

  const deleteTask = async (task: Task) => {
    if (!planId) return
    await api.deleteTask(cardId, planId, task.id)
    load()
  }

  const addTask = async () => {
    if (!newTitle.trim() || !planId) return
    await api.addTask(cardId, planId, newTitle)
    setNewTitle('')
    load()
  }

  const approve = async () => {
    if (!planId) return
    await api.approvePlan(cardId, planId)
    onAdvance()
  }

  if (!planId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No plan yet — generate one from the PRD.</p>
        <Button size="sm" onClick={bootstrap} disabled={bootstrapping}>
          {bootstrapping ? 'Generating…' : 'Generate Plan'}
        </Button>
        {(bootstrapping || bootstrapText.length > 0) && (
          <div className="terminal-panel font-mono text-xs rounded-md p-3 h-40 overflow-y-auto whitespace-pre-wrap">
            {bootstrapText || <span className="text-muted-foreground">Starting…</span>}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const tasks = [...data.tasks].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">Tasks — Editable</h3>
          <span className="text-[10px] text-muted-foreground/60">{tasks.length} items</span>
        </div>
        <div className="space-y-1">
          {tasks.map((task, i) => (
            <div
              key={task.id}
              className="group flex items-center gap-3 p-3 bg-card border border-border/50 rounded hover:border-ring transition-colors"
            >
              <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
              <input
                className="focus-ring flex-1 border-none bg-transparent p-0 text-sm"
                defaultValue={task.title}
                onBlur={(e) => e.target.value !== task.title && renameTask(task, e.target.value)}
              />
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1 hover:bg-secondary rounded text-muted-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveTask(tasks, i, -1)}
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  className="p-1 hover:bg-secondary rounded text-muted-foreground disabled:opacity-30"
                  disabled={i === tasks.length - 1}
                  onClick={() => moveTask(tasks, i, 1)}
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  className="p-1 hover:bg-destructive/20 hover:text-destructive rounded text-muted-foreground"
                  onClick={() => deleteTask(task)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 p-3 bg-muted border border-dashed border-border rounded">
            <Plus className="size-4 text-muted-foreground/50" />
            <input
              className="focus-ring bg-transparent border-none p-0 text-sm w-full"
              placeholder="Add task…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-border/30">
        <StageActionBar turn="you" label="Approve Plan" onClick={approve} disabled={tasks.length === 0} icon={Check} />
        <button
          type="button"
          onClick={bootstrap}
          disabled={bootstrapping}
          className="w-full px-4 py-2.5 border border-border text-foreground text-sm font-medium rounded hover:bg-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <RefreshCw className="size-3.5" />
          {bootstrapping ? 'Regenerating…' : 'Regenerate from PRD'}
        </button>
      </div>
    </div>
  )
}
