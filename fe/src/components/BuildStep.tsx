import { useEffect, useRef, useState } from 'react'
import { Circle, CircleDot, CheckCircle2, ChevronDown, ChevronRight, Eye, RefreshCw, Terminal, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import StageActionBar from '@/components/StageActionBar'
import { api } from '@/lib/api'
import type { Run, StreamEvent, Task } from '@/lib/types'

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return 'in progress'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type DiffFile = { file: string; diff: string }

const WORKING_PHRASES = [
  'Setting up the worktree…',
  'Reading the task…',
  'Writing code…',
  'Still working on it…',
  'Almost there…',
]

function TaskIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle2 className="size-4 text-primary shrink-0" />
  if (status === 'running') return <CircleDot className="size-4 text-primary shrink-0" />
  if (status === 'failed') return <XCircle className="size-4 text-destructive shrink-0" />
  return <Circle className="size-4 text-muted-foreground/40 shrink-0" />
}

function WorkingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce" />
    </span>
  )
}

function dedupeByFile(artifacts: { file: string; diff: string }[]): DiffFile[] {
  const byFile = new Map<string, string>()
  for (const a of artifacts) byFile.set(a.file, a.diff)
  return [...byFile.entries()].map(([file, diff]) => ({ file, diff }))
}

function diffStat(diff: string) {
  let add = 0
  let del = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) add++
    else if (line.startsWith('-') && !line.startsWith('---')) del++
  }
  return { add, del }
}

export default function BuildStep({
  cardId,
  stage,
  stageLabel,
  planId,
  onAdvance,
}: {
  cardId: string
  stage: string
  stageLabel: string
  planId?: string | null
  onAdvance: () => void
}) {
  const [logText, setLogText] = useState('')
  const [diffs, setDiffs] = useState<DiffFile[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const isBuilding = stage === 'building'

  const loadHistory = async () => {
    const { runs, artifacts } = await api.getRuns(cardId, stage)
    setLogText(runs.map((r) => r.stdout).join(''))
    setRuns(runs)
    // Default to the latest attempt so re-opening this stage shows the most
    // recent run instead of nothing selected.
    setSelectedRunId(runs.length > 0 ? runs[runs.length - 1].id : null)
    setDiffs(dedupeByFile(artifacts.map((a) => ({ file: a.filePath, diff: a.diff }))))
    if (isBuilding && planId) {
      try {
        const plan = await api.getPlan(cardId, planId)
        setTasks(plan.tasks)
      } catch {
        setTasks(null)
      }
    }
  }

  useEffect(() => {
    loadHistory()
  }, [cardId, stage, planId])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== stage) return
      if (ev.type === 'log_delta' && ev.line != null) {
        setLogText((prev) => prev + ev.line)
      } else if (ev.type === 'log' && ev.line) {
        setLogText((prev) => (prev ? prev + '\n' + ev.line : ev.line!))
      } else if (ev.type === 'task' && ev.data) {
        const t = JSON.parse(ev.data) as { taskId: string; title: string; status: string }
        setTasks((prev) =>
          prev ? prev.map((task) => (task.id === t.taskId ? { ...task, status: t.status as Task['status'] } : task)) : prev,
        )
      } else if (ev.type === 'diff' && ev.file) {
        setDiffs((prev) => [...prev.filter((d) => d.file !== ev.file), { file: ev.file as string, diff: ev.diff ?? '' }])
      } else if (ev.type === 'error') {
        setError(ev.data ?? 'failed')
        setRunning(false)
      } else if (ev.type === 'done') {
        setRunning(false)
        loadHistory()
        onAdvance()
      }
    }
    return () => es.close()
  }, [cardId, stage, onAdvance])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logText, selectedRunId, running])

  useEffect(() => {
    if (!running) {
      setPhraseIdx(0)
      return
    }
    const id = setInterval(() => setPhraseIdx((i) => Math.min(i + 1, WORKING_PHRASES.length - 1)), 4000)
    return () => clearInterval(id)
  }, [running])

  const start = async () => {
    setError(null)
    setRunning(true)
    setLogText('')
    setDiffs([])
    setSelectedRunId(null) // fall back to the live stream until the new run lands in history
    await api.runBuild(cardId)
  }

  const doneCount = tasks?.filter((t) => t.status === 'success').length ?? 0
  const currentTask = tasks?.find((t) => t.status === 'running')
  const hasPartialProgress = isBuilding && !!tasks && doneCount > 0 && doneCount < tasks.length
  // A task shows "running" server-side but we didn't start it this session —
  // it's leftover from an interrupted run, not something actually in progress.
  const looksInterrupted = !running && !!currentTask

  // Non-task stages (simulate/test/docs) have one run per attempt rather
  // than per-task — while running, always show the live stream; otherwise
  // show whichever attempt is selected (defaults to the latest).
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null
  const outputText = running ? logText : (selectedRun?.stdout ?? logText)

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <StageActionBar
          turn={running ? 'agent' : 'you'}
          label={running ? 'Running…' : hasPartialProgress ? 'Continue Build' : `Run ${stageLabel}`}
          onClick={start}
          disabled={running}
          icon={RefreshCw}
          spinning={running}
        />

        <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              disabled={diffs.length === 0}
              className="btn-interactive focus-ring px-4 py-2 border border-border text-muted-foreground hover:text-foreground hover:border-ring disabled:opacity-40 text-xs font-bold rounded flex items-center gap-2"
            >
              <Eye className="size-3.5" />
              View changes {diffs.length > 0 ? `(${diffs.length})` : ''}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Changed files — {stageLabel}</DialogTitle>
            </DialogHeader>
            <div className="border border-border rounded-md divide-y divide-border">
              {diffs.map((d) => {
                const stat = diffStat(d.diff)
                return (
                <div key={d.file}>
                  <button
                    className="w-full flex items-center justify-between text-left px-3 py-2 text-sm font-mono hover:bg-muted/50"
                    onClick={() => setExpanded(expanded === d.file ? null : d.file)}
                  >
                    <span>{d.file}</span>
                    <span className="text-xs shrink-0 ml-2">
                      <span className="text-green-600">+{stat.add}</span>{' '}
                      <span className="text-red-600">−{stat.del}</span>
                    </span>
                  </button>
                  {expanded === d.file && (
                    <pre className="text-xs p-3 overflow-x-auto bg-muted">
                      {d.diff.split('\n').map((l, i) => (
                        <div
                          key={i}
                          className={l.startsWith('+') ? 'text-green-600' : l.startsWith('-') ? 'text-red-600' : ''}
                        >
                          {l}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {looksInterrupted && (
        <p className="text-sm text-amber-600">
          Interrupted before finishing "{currentTask!.title}" — click Continue Build to resume.
        </p>
      )}

      {isBuilding && tasks && tasks.length > 0 && (
        <div className="bg-card border border-border rounded p-4 space-y-3">
          {currentTask && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                  Working on:
                </span>
                <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  {doneCount} / {tasks.length}
                </span>
              </div>
              <h3 className="text-sm font-medium">{currentTask.title}</h3>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-[width] duration-1000 ease-(--ease-out)"
                  style={{ width: `${(doneCount / tasks.length) * 100}%` }}
                />
              </div>
            </>
          )}
          <div className="space-y-2 max-h-56 overflow-y-auto pt-1">
            {tasks.map((t) => {
              const taskRuns = runs.filter((r) => r.taskId === t.id)
              const isExpanded = expandedTaskId === t.id
              const canExpand = taskRuns.length > 0
              return (
                <div key={t.id}>
                  <button
                    type="button"
                    className={`w-full text-left text-sm flex items-start gap-3 ${
                      canExpand ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      t.status === 'running'
                        ? 'font-bold'
                        : t.status === 'failed'
                          ? 'text-destructive'
                          : t.status === 'success'
                            ? 'text-muted-foreground line-through'
                            : 'text-muted-foreground'
                    }`}
                    onClick={() => canExpand && setExpandedTaskId(isExpanded ? null : t.id)}
                  >
                    <TaskIcon status={t.status} />
                    <span className="flex-1">{t.title}</span>
                    {canExpand &&
                      (isExpanded ? (
                        <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                      ))}
                  </button>
                  {isExpanded && (
                    <div className="ml-7 mt-2 space-y-1.5">
                      {[...taskRuns].reverse().map((r, i) => (
                        <div key={r.id} className="bg-popover border border-border rounded-md overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/40 border-b border-border">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {taskRuns.length > 1 ? `Attempt ${taskRuns.length - i} · ` : ''}
                              {r.exitCode === 0 ? 'succeeded' : r.exitCode == null ? 'in progress' : `exit ${r.exitCode}`}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {formatDuration(r.startedAt, r.finishedAt)}
                            </span>
                          </div>
                          <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto text-foreground/80">
                            {r.stdout || '(no output)'}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!isBuilding && runs.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Attempts:</span>
          {runs.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRunId(r.id)}
              disabled={running}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors disabled:opacity-40 ${
                !running && selectedRunId === r.id
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:border-ring'
              }`}
            >
              #{i + 1}
              {r.exitCode === 0 ? '' : r.exitCode == null ? ' ⋯' : ' ✕'}
            </button>
          ))}
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden flex flex-col h-48">
        <div className="bg-secondary/60 px-4 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Output
              {!running && selectedRun && runs.length > 1 ? ` — Attempt ${runs.indexOf(selectedRun) + 1}` : ''}
            </span>
          </div>
          {running && (
            <span className="flex items-center gap-1.5 text-[10px] text-primary">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              live
            </span>
          )}
        </div>
        <div ref={logRef} className="terminal-panel flex-1 p-3 font-mono text-xs overflow-y-auto whitespace-pre-wrap">
          {outputText.length === 0 && !running && <p className="text-muted-foreground">No output yet.</p>}
          {outputText}
          {running && outputText.length === 0 && (
            <div className="text-muted-foreground">
              {WORKING_PHRASES[phraseIdx]}
              <WorkingDots />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
