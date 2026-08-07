import { useEffect, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Card, PRDSummary, PlanSummary } from '@/lib/types'

type Draft = PRDSummary | PlanSummary

function draftId(docType: 'prd' | 'plan', d: Draft) {
  return docType === 'prd' ? d.id : (d as PlanSummary).rootId
}

// Draft picker + "New"/"Import…" actions, shown above ChatStep (PRD) and
// PlanStep (Plan) in CardDetail. Plans have no blank-draft concept — they're
// always agent-generated from a specific PRD — so "New" for docType="plan"
// regenerates from whichever PRD is passed as prdIdForGenerate.
export default function DraftSwitcher({
  cardId,
  docType,
  activeId,
  prdIdForGenerate,
  onChanged,
}: {
  cardId: string
  docType: 'prd' | 'plan'
  activeId: string | null
  prdIdForGenerate?: string
  onChanged: () => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const [allCards, setAllCards] = useState<Card[]>([])
  const [cardFilter, setCardFilter] = useState('')
  const [sourceCardId, setSourceCardId] = useState('')
  const [sourceDrafts, setSourceDrafts] = useState<Draft[]>([])
  const [sourceDraftId, setSourceDraftId] = useState('')

  const reload = () => {
    if (docType === 'prd') api.listPRDs(cardId).then(setDrafts)
    else api.listPlans(cardId).then(setDrafts)
  }

  useEffect(reload, [cardId, docType])

  const activate = async (id: string) => {
    if (docType === 'prd') await api.activatePRD(cardId, id)
    else await api.activatePlan(cardId, id)
    onChanged()
  }

  const openNew = () => {
    setNewTitle('')
    setError(null)
    setDialog('new')
  }

  const openImport = () => {
    setError(null)
    setSourceCardId('')
    setSourceDrafts([])
    setSourceDraftId('')
    api.listCards().then(setAllCards)
    setDialog('import')
  }

  const submitNew = async () => {
    setBusy(true)
    setError(null)
    try {
      if (docType === 'prd') {
        await api.createPRD(cardId, newTitle || undefined)
      } else {
        if (!prdIdForGenerate) throw new Error('no active PRD to generate from')
        await api.generatePlan(cardId, prdIdForGenerate, newTitle || undefined)
      }
      reload()
      onChanged()
      setDialog(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pickSourceCard = async (id: string) => {
    setSourceCardId(id)
    setSourceDraftId('')
    if (docType === 'prd') setSourceDrafts(await api.listPRDs(id))
    else setSourceDrafts(await api.listPlans(id))
  }

  const submitImport = async () => {
    if (!sourceCardId || !sourceDraftId) return
    setBusy(true)
    setError(null)
    try {
      if (docType === 'prd') {
        await api.importPRD(cardId, { sourceCardId, sourcePrdId: sourceDraftId })
      } else {
        await api.importPlan(cardId, { sourceCardId, sourcePlanId: sourceDraftId })
      }
      reload()
      onChanged()
      setDialog(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const visibleCards = allCards
    .filter((c) => c.id !== cardId)
    .filter((c) => c.title.toLowerCase().includes(cardFilter.toLowerCase()))

  return (
    <div className="flex items-center gap-2 mb-3">
      <Select value={activeId ?? undefined} onValueChange={activate}>
        <SelectTrigger className="w-full text-xs">
          <SelectValue placeholder={docType === 'prd' ? 'Select PRD draft' : 'Select plan draft'} />
        </SelectTrigger>
        <SelectContent>
          {drafts.map((d) => (
            <SelectItem key={draftId(docType, d)} value={draftId(docType, d)}>
              {d.title || 'Untitled'} · v{d.version}
              {d.sourceCardId ? ' · imported' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={openNew} className="shrink-0">
        <Plus className="size-3.5" />
        New
      </Button>
      <Button size="sm" variant="outline" onClick={openImport} className="shrink-0">
        <Upload className="size-3.5" />
        Import
      </Button>

      <Dialog open={dialog === 'new'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{docType === 'prd' ? 'New PRD draft' : 'Generate new plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Title</label>
            <input
              className="w-full border border-border bg-input rounded-md px-3 py-2 text-sm"
              placeholder={docType === 'prd' ? 'e.g. Alternate approach' : 'e.g. Plan B'}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button onClick={submitNew} disabled={busy}>
              {busy ? 'Working…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'import'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import {docType === 'prd' ? 'PRD' : 'plan'} from another card</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Source card
              </label>
              <input
                className="w-full border border-border bg-input rounded-md px-3 py-2 text-sm"
                placeholder="Filter cards…"
                value={cardFilter}
                onChange={(e) => setCardFilter(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border">
                {visibleCards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickSourceCard(c.id)}
                    className={`focus-ring w-full text-left px-3 py-2 text-sm truncate hover:bg-secondary/50 ${
                      sourceCardId === c.id ? 'bg-secondary' : ''
                    }`}
                  >
                    {c.title}
                  </button>
                ))}
                {visibleCards.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {cardFilter ? `No cards match "${cardFilter}".` : 'No other cards to import from.'}
                  </p>
                )}
              </div>
            </div>
            {sourceCardId && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Draft
                </label>
                <Select value={sourceDraftId} onValueChange={setSourceDraftId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select draft" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceDrafts.map((d) => (
                      <SelectItem key={draftId(docType, d)} value={draftId(docType, d)}>
                        {d.title || 'Untitled'} · v{d.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button onClick={submitImport} disabled={busy || !sourceDraftId}>
              {busy ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
