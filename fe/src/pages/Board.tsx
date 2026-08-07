// Hallmark · macrostructure: Bento Grid (adapted, app-scope) · theme: existing devpipe tokens (preserved)
// Running cards earn a 2-col span — size variation driven by real status, not decoration.
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pencil, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AppShell from '@/components/AppShell'
import RepoPathField from '@/components/RepoPathField'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { settings } from '@/lib/settings'
import { STATUS_META } from '@/lib/statusMeta'
import { STAGES, type AgentAvailability, type Card as CardType } from '@/lib/types'

function stageProgress(card: CardType) {
  const idx = STAGES.indexOf(card.stage as (typeof STAGES)[number])
  return idx < 0 ? 0 : Math.round(((idx + 1) / STAGES.length) * 100)
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

export default function Board() {
  const navigate = useNavigate()
  const [cards, setCards] = useState<CardType[]>([])
  const [availability, setAvailability] = useState<AgentAvailability | null>(null)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState({ title: '', repoPath: '', agent: settings.getDefaultAgent() })
  const [editCard, setEditCard] = useState<CardType | null>(null)
  const [editForm, setEditForm] = useState({ title: '', repoPath: '', agent: 'claude' as 'claude' | 'cursor' })

  const load = () => api.listCards().then(setCards)

  useEffect(() => {
    if (!settings.isOnboarded()) {
      navigate('/onboarding')
      return
    }
    load()
    api.detectAgents().then(setAvailability)
  }, [navigate])

  const submit = async () => {
    await api.createCard(form)
    setForm({ title: '', repoPath: '', agent: settings.getDefaultAgent() })
    setOpen(false)
    load()
  }

  const openEdit = (e: MouseEvent, card: CardType) => {
    e.preventDefault()
    e.stopPropagation()
    setEditForm({ title: card.title, repoPath: card.repoPath, agent: card.agent })
    setEditCard(card)
  }

  const submitEdit = async () => {
    if (!editCard) return
    await api.updateCard(editCard.id, editForm)
    setEditCard(null)
    load()
  }

  const visibleCards = useMemo(
    () => cards.filter((c) => c.title.toLowerCase().includes(filter.toLowerCase())),
    [cards, filter],
  )
  const runningCount = cards.filter((c) => c.status === 'running').length

  return (
    <AppShell>
      <div className="px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-border">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {cards.length === 0
              ? 'No cards yet.'
              : `${cards.length} card${cards.length === 1 ? '' : 's'} · ${runningCount} running now.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center bg-secondary px-3 py-2 sm:py-1.5 rounded border border-border transition-colors duration-(--dur-short) ease-(--ease-out) focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 w-full sm:w-56">
            <Search className="size-3.5 text-muted-foreground mr-2 shrink-0" />
            <input
              className="bg-transparent border-none outline-none text-xs w-full"
              placeholder="Filter cards…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="normal-case tracking-normal shrink-0 whitespace-nowrap">
                + New Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Card</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Field label="Title">
                  <input
                    className="w-full border border-border bg-input rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. Checkout redesign"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label="Repo path">
                  <RepoPathField value={form.repoPath} onChange={(v) => setForm({ ...form, repoPath: v })} />
                </Field>
                <Field label="Agent">
                  <Select
                    value={form.agent}
                    onValueChange={(v) => setForm({ ...form, agent: v as 'claude' | 'cursor' })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude" disabled={availability ? !availability.claude : false}>
                        Claude Code {availability && !availability.claude ? '(not found)' : ''}
                      </SelectItem>
                      <SelectItem value="cursor" disabled={availability ? !availability.cursor : false}>
                        Cursor {availability && !availability.cursor ? '(not found)' : ''}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={!form.title || !form.repoPath}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={!!editCard} onOpenChange={(v) => !v && setEditCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Title">
              <input
                className="w-full border border-border bg-input rounded-md px-3 py-2 text-sm"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </Field>
            <Field label="Repo path">
              <RepoPathField value={editForm.repoPath} onChange={(v) => setEditForm({ ...editForm, repoPath: v })} />
            </Field>
            <Field label="Agent">
              <Select
                value={editForm.agent}
                onValueChange={(v) => setEditForm({ ...editForm, agent: v as 'claude' | 'cursor' })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude" disabled={availability ? !availability.claude : false}>
                    Claude Code {availability && !availability.claude ? '(not found)' : ''}
                  </SelectItem>
                  <SelectItem value="cursor" disabled={availability ? !availability.cursor : false}>
                    Cursor {availability && !availability.cursor ? '(not found)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button onClick={submitEdit} disabled={!editForm.title || !editForm.repoPath}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-6">
        {visibleCards.length === 0 ? (
          <div className="border border-dashed border-border rounded p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {cards.length === 0 ? 'No cards yet — create one to start the pipeline.' : `No cards match “${filter}”.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {visibleCards.map((card, i) => {
              const meta = STATUS_META[card.status] ?? STATUS_META.idle
              const Icon = meta.icon
              const progress = stageProgress(card)
              // Bento rhythm: a card actively running earns twice the width —
              // it's the one thing on the board that needs watching right now.
              const featured = card.status === 'running'
              return (
                <Link
                  key={card.id}
                  to={`/cards/${card.id}`}
                  className={`focus-ring reveal min-w-0 rounded ${featured ? 'sm:col-span-2 lg:col-span-2' : ''}`}
                  style={{ '--i': Math.min(i, 10) } as CSSProperties}
                >
                  <div className="card-interactive h-full bg-muted border border-border hover:border-ring p-4 rounded flex flex-col gap-4 relative min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1 pr-16 min-w-0">
                        <h3
                          className={`leading-snug break-words ${
                            featured ? 'text-base font-bold' : 'text-sm font-semibold'
                          }`}
                        >
                          {card.title}
                        </h3>
                        <p className="text-[10px] font-mono text-muted-foreground truncate tracking-tight">
                          {card.repoPath} · {card.branch}
                        </p>
                      </div>
                      <span
                        className={`absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 uppercase ${meta.badge}`}
                      >
                        <Icon className="size-2.5" />
                        {meta.label}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                        <span>Stage: {card.stage}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className={`w-full bg-secondary rounded-full overflow-hidden ${featured ? 'h-1.5' : 'h-1'}`}>
                        <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/60">
                      <span className="text-[10px] font-mono text-muted-foreground italic">agent: {card.agent}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{relativeTime(card.updatedAt)}</span>
                        <button
                          type="button"
                          onClick={(e) => openEdit(e, card)}
                          className="focus-ring text-muted-foreground hover:text-foreground rounded-sm transition-colors duration-(--dur-short)"
                        >
                          <Pencil className="size-3" />
                        </button>
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
