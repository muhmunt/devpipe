import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, RefreshCw, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { ChatMessage, PlanWithTasks, StreamEvent, Task } from '@/lib/types'

const THINKING_PHRASES = ['Reading the plan…', 'Thinking this through…', 'Revising…', 'Still working on it…']

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce" />
    </span>
  )
}

function tasksToNumberedList(tasks: Task[]) {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .map((t, i) => `${i + 1}. ${t.title}`)
    .join('\n')
}

export default function PlanStep({
  cardId,
  prdId,
  planId,
  onAdvance,
}: {
  cardId: string
  prdId: string
  planId: string | null
  onAdvance: () => void
}) {
  const [data, setData] = useState<PlanWithTasks | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapText, setBootstrapText] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!planId) {
      setData(null)
      return
    }
    const d = await api.getPlan(cardId, planId)
    setData(d)
    const history = await api.listChat(cardId, 'plan', planId)
    setMessages(history)
  }

  useEffect(() => {
    load()
  }, [cardId, planId])

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
      } else if (ev.type === 'chat_delta' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + ev.line))
      } else if (ev.type === 'chat' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + '\n' + ev.line))
      } else if (ev.type === 'chat_done') {
        setStreaming(null)
        load()
      } else if (ev.type === 'error') {
        setBootstrapping(false)
        setStreaming(null)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages, streaming])

  useEffect(() => {
    if (streaming == null) {
      setPhraseIdx(0)
      return
    }
    const id = setInterval(() => setPhraseIdx((i) => Math.min(i + 1, THINKING_PHRASES.length - 1)), 4000)
    return () => clearInterval(id)
  }, [streaming === null])

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

  const send = async () => {
    if (!input.trim() || !data || !planId) return
    setError(null)
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, cardId, stage: 'plan', docId: planId, role: 'user', content: input, createdAt: '' },
    ])
    setStreaming('')
    const message = input
    setInput('')
    await api.sendChat(cardId, 'plan', message, tasksToNumberedList(data.tasks), planId)
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
  const loading = streaming !== null

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div ref={transcriptRef} className="bg-card border border-border rounded-lg p-4 min-h-[120px] max-h-56 overflow-y-auto space-y-2">
          <p className="text-xs text-muted-foreground italic mb-2">Comment here to revise the plan</p>
          {messages.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              e.g. "combine steps 2 and 3" or "add a step for tests".
            </p>
          )}
          <div className="flex flex-col gap-2">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="self-end max-w-[90%] bg-secondary border border-border px-3 py-2 rounded-lg text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="max-w-[90%] bg-primary/10 border border-primary/10 p-3 rounded-lg text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              ),
            )}
            {loading && (
              <div className="max-w-[90%] bg-primary/10 border border-primary/10 p-3 rounded-lg text-sm text-muted-foreground">
                {streaming || (
                  <>
                    {THINKING_PHRASES[phraseIdx]}
                    <ThinkingDots />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <input
            className="flex-1 bg-secondary border border-border rounded-md px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors duration-(--dur-short) ease-(--ease-out)"
            placeholder="Comment to revise the plan…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && send()}
            disabled={loading}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-primary text-primary-foreground p-2.5 rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>

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

      <div className="flex items-center gap-3 pt-4 border-t border-border/30">
        <button
          type="button"
          onClick={bootstrap}
          disabled={bootstrapping || loading}
          className="flex-1 px-4 py-2.5 border border-border text-foreground text-sm font-medium rounded hover:bg-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <RefreshCw className="size-3.5" />
          {bootstrapping ? 'Regenerating…' : 'Regenerate from PRD'}
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={tasks.length === 0}
          className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Check className="size-3.5" />
          Approve Plan
        </button>
      </div>
    </div>
  )
}
