import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, ChevronRight, Lock, MessageSquare, Zap } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import AppShell from '@/components/AppShell'
import ChatStep from '@/components/ChatStep'
import PlanStep from '@/components/PlanStep'
import DraftSwitcher from '@/components/DraftSwitcher'
import BuildStep from '@/components/BuildStep'
import BriefChat from '@/components/BriefChat'
import AcceptStep from '@/components/AcceptStep'
import CardChatSidebar from '@/components/CardChatSidebar'
import StageActionBar from '@/components/StageActionBar'
import { api } from '@/lib/api'
import { STATUS_PILL } from '@/lib/statusMeta'
import { STAGES, type Card, type RunStatus } from '@/lib/types'

const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  prd: 'PRD',
  plan: 'Plan',
  approved: 'Approved',
  building: 'Build',
  simulating: 'Simulate',
  testing: 'Test',
  docs: 'Docs',
  deployed: 'Deploy',
}

const STAGE_DESCRIPTION: Record<(typeof STAGES)[number], string> = {
  prd: 'Define what to build and why.',
  plan: "Break the PRD into a concrete, ordered task list.",
  approved: 'Plan locked in — kick off the build when ready.',
  building: "Agent implements the plan's tasks, streaming logs and diffs live.",
  simulating: 'Dry-run the change end-to-end against a real scenario.',
  testing: 'Automated test pass against the worktree.',
  docs: 'Agent writes or updates documentation for whatever changed.',
  deployed: 'Merge into the real repo — nothing touches main until here.',
}

function StatusPill({ status }: { status: string }) {
  return (
    <div
      className={`flex items-center gap-2 border px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase ${
        STATUS_PILL[status as RunStatus] ?? STATUS_PILL.idle
      }`}
    >
      {status === 'running' && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      )}
      {status}
    </div>
  )
}

function StepRow({
  idx,
  label,
  description,
  state,
}: {
  idx: number
  label: string
  description: string
  state: 'done' | 'active' | 'locked'
}) {
  const number = String(idx + 1).padStart(2, '0')
  return (
    <span className="flex items-center gap-4 p-4 flex-1">
      <span
        className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
          state === 'done'
            ? 'bg-primary/10 border border-primary/40 text-primary'
            : state === 'active'
              ? 'border border-primary bg-primary shadow-[var(--shadow-glow-primary)]'
              : 'border border-border text-muted-foreground'
        }`}
      >
        {state === 'done' && <Check className="size-3.5" />}
        {state === 'active' && <span className="w-2 h-2 rounded-full bg-primary-foreground" />}
        {state === 'locked' && <Lock className="size-3" />}
      </span>
      <span className="flex-1 flex items-center justify-between gap-4 min-w-0">
        <span className="min-w-0">
          <span
            className={`block text-sm ${
              state === 'active' ? 'font-bold text-primary' : state === 'done' ? 'font-medium' : 'font-medium text-muted-foreground'
            }`}
          >
            {number} {label}
          </span>
          {state === 'active' && <span className="block text-xs text-muted-foreground mt-0.5 truncate">{description}</span>}
        </span>
        {state === 'done' && (
          <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider shrink-0">Done</span>
        )}
        {state === 'active' && (
          <span className="text-[10px] uppercase text-primary font-bold tracking-widest shrink-0">Active</span>
        )}
        {state === 'locked' && <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
      </span>
    </span>
  )
}

export default function CardDetail() {
  const { id } = useParams<{ id: string }>()
  const [card, setCard] = useState<Card | null>(null)
  const [openStage, setOpenStage] = useState<string>('')
  const [chatOpen, setChatOpen] = useState(false)

  const load = () => {
    if (!id) return
    api.getCard(id).then((c) => {
      setCard(c)
      setOpenStage(c.stage)
    })
  }

  // Refreshes card data only — doesn't jump the accordion to the new stage.
  // Used when a stage finishes on its own (e.g. a build completing), so the
  // user can still see what just happened (logs/diff) instead of getting
  // yanked into the next panel before they can look.
  const refreshCard = () => {
    if (!id) return
    api.getCard(id).then(setCard)
  }

  useEffect(load, [id])

  if (!card)
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    )

  const currentIdx = STAGES.indexOf(card.stage as (typeof STAGES)[number])

  const advance = async (stage: (typeof STAGES)[number]) => {
    if (!id) return
    await api.updateStage(id, stage, 'idle')
    load()
  }

  return (
    <AppShell>
      <div className="flex flex-col lg:flex-row h-full lg:overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto w-full px-4 py-8">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors text-xs uppercase tracking-widest mb-4"
            >
              <ArrowLeft className="size-3.5" />
              Back to Board
            </Link>
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">{card.title}</h1>
                <p className="text-sm font-mono text-muted-foreground">
                  {card.repoPath} · {card.branch} · agent: {card.agent}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-2">
                  {currentIdx + 1} / {STAGES.length} stages complete
                </p>
              </div>
              <StatusPill status={card.status} />
            </div>

            <Accordion
              type="single"
              collapsible
              value={openStage}
              onValueChange={setOpenStage}
              className="space-y-px border border-border rounded-lg overflow-hidden bg-muted"
            >
              {STAGES.map((stage, idx) => {
                const done = idx < currentIdx
                const active = idx === currentIdx
                const locked = idx > currentIdx
                const isOpen = openStage === stage
                const state = done ? 'done' : active ? 'active' : 'locked'

                return (
                  <AccordionItem
                    key={stage}
                    value={stage}
                    disabled={locked}
                    className={`border-b border-border last:border-b-0 ${active ? 'bg-card' : ''}`}
                  >
                    <AccordionTrigger className="p-0 hover:no-underline [&>svg]:!hidden">
                      <StepRow idx={idx} label={STAGE_LABEL[stage]} description={STAGE_DESCRIPTION[stage]} state={state} />
                    </AccordionTrigger>
                    <AccordionContent className="pl-14 pr-4 pb-6">
                      {isOpen && stage === 'prd' && (
                        <>
                          <DraftSwitcher
                            cardId={card.id}
                            docType="prd"
                            activeId={card.activePrdId}
                            onChanged={refreshCard}
                          />
                          <ChatStep
                            cardId={card.id}
                            prdId={card.activePrdId}
                            stage="prd"
                            nextStage="plan"
                            continueLabel="Save & Continue to Plan"
                            onAdvance={load}
                          />
                        </>
                      )}
                      {isOpen && stage === 'plan' && (
                        <>
                          <DraftSwitcher
                            cardId={card.id}
                            docType="plan"
                            activeId={card.activePlanId}
                            prdIdForGenerate={card.activePrdId}
                            onChanged={refreshCard}
                          />
                          <PlanStep
                            cardId={card.id}
                            prdId={card.activePrdId}
                            planId={card.activePlanId}
                            onAdvance={load}
                          />
                        </>
                      )}
                      {isOpen && stage === 'simulating' && (
                        <div className="space-y-4">
                          <BriefChat
                            cardId={card.id}
                            stage="simulating"
                            placeholder="Describe the simulation — actor/login, endpoints, expected results…"
                            emptyHint='Chat first to describe the scenario — e.g. "log in as the seeded test user, then GET /api/orders with that token, expect a 200 with a non-empty array." Run Simulate below uses whatever you land on here.'
                          />
                          <BuildStep
                            cardId={card.id}
                            stage={stage}
                            stageLabel={STAGE_LABEL[stage]}
                            planId={card.activePlanId}
                            onAdvance={refreshCard}
                          />
                        </div>
                      )}
                      {isOpen && ['building', 'testing', 'docs'].includes(stage) && (
                        <BuildStep
                          cardId={card.id}
                          stage={stage}
                          stageLabel={STAGE_LABEL[stage]}
                          planId={card.activePlanId}
                          onAdvance={refreshCard}
                        />
                      )}
                      {isOpen && stage === 'approved' && (
                        <div className="space-y-4">
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            Plan approved. Ready to build. The technical specifications and agent constraints have been
                            verified. No pending blockers detected.
                          </p>
                          <StageActionBar turn="you" label="Start Build" onClick={() => advance('building')} icon={Zap} />
                        </div>
                      )}
                      {isOpen && stage === 'deployed' && (
                        <AcceptStep cardId={card.id} title={card.title} status={card.status} onAccepted={load} />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>
        </div>

        <div className="hidden lg:flex lg:w-[360px] lg:min-w-0 lg:shrink-0 lg:border-l lg:border-border lg:h-full">
          <CardChatSidebar cardId={card.id} cardTitle={card.title} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="focus-ring lg:hidden fixed bottom-6 right-6 z-30 flex items-center justify-center size-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:brightness-110 transition-[filter] duration-(--dur-short) ease-(--ease-out)"
      >
        <MessageSquare className="size-5" />
      </button>

      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="p-0 !w-full sm:!max-w-sm">
          <SheetTitle className="sr-only">Chat — {card.title}</SheetTitle>
          <CardChatSidebar cardId={card.id} cardTitle={card.title} />
        </SheetContent>
      </Sheet>
    </AppShell>
  )
}
