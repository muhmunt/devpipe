import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { api } from '@/lib/api'
import { STAGES, type Card, type Run } from '@/lib/types'

const STAGE = 'simulating'

function reachedStage(card: Card) {
  const idx = STAGES.indexOf(card.stage as (typeof STAGES)[number])
  return idx >= STAGES.indexOf(STAGE)
}

export default function SimulatePage() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [runsByCard, setRunsByCard] = useState<Record<string, Run[]>>({})

  useEffect(() => {
    api.listCards().then(async (all) => {
      const relevant = all.filter(reachedStage)
      setCards(relevant)
      const entries = await Promise.all(
        relevant.map(async (c) => [c.id, (await api.getRuns(c.id, STAGE)).runs] as const),
      )
      setRunsByCard(Object.fromEntries(entries))
    })
  }, [])

  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto w-full px-4 py-8">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
          End-to-end scenarios
        </p>
        <h1 className="text-2xl font-bold tracking-tight mb-8">Simulate</h1>

        {cards === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {cards !== null && cards.length === 0 && (
          <p className="text-sm text-muted-foreground">No cards have reached the Simulate stage yet.</p>
        )}

        <div className="space-y-3">
          {cards?.map((c) => {
            const runs = runsByCard[c.id] ?? []
            const last = runs[runs.length - 1]
            return (
              <Link
                key={c.id}
                to={`/cards/${c.id}`}
                className="block border border-border rounded-lg bg-card p-4 hover:border-ring transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="size-4 text-primary shrink-0" />
                      <h3 className="text-sm font-semibold truncate">{c.title}</h3>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      {runs.length} run{runs.length === 1 ? '' : 's'} · agent: {c.agent}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">{c.stage}</span>
                </div>
                {last && (
                  <pre className="terminal-panel mt-3 font-mono text-xs p-3 rounded max-h-24 overflow-hidden whitespace-pre-wrap">
                    {last.stdout || '(no output)'}
                  </pre>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
