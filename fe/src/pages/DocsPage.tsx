import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { api } from '@/lib/api'
import { STAGES, type Artifact, type Card } from '@/lib/types'

const STAGE = 'docs'

function reachedStage(card: Card) {
  const idx = STAGES.indexOf(card.stage as (typeof STAGES)[number])
  return idx >= STAGES.indexOf(STAGE)
}

export default function DocsPage() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [artifactsByCard, setArtifactsByCard] = useState<Record<string, Artifact[]>>({})

  useEffect(() => {
    api.listCards().then(async (all) => {
      const relevant = all.filter(reachedStage)
      setCards(relevant)
      const entries = await Promise.all(
        relevant.map(async (c) => [c.id, (await api.getRuns(c.id, STAGE)).artifacts] as const),
      )
      setArtifactsByCard(Object.fromEntries(entries))
    })
  }, [])

  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto w-full px-4 py-8">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
          Generated documentation
        </p>
        <h1 className="text-2xl font-bold tracking-tight mb-8">Docs</h1>

        {cards === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {cards !== null && cards.length === 0 && (
          <p className="text-sm text-muted-foreground">No cards have reached the Docs stage yet.</p>
        )}

        <div className="space-y-3">
          {cards?.map((c) => {
            const artifacts = artifactsByCard[c.id] ?? []
            return (
              <Link
                key={c.id}
                to={`/cards/${c.id}`}
                className="block border border-border rounded-lg bg-card p-4 hover:border-ring transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-primary shrink-0" />
                      <h3 className="text-sm font-semibold truncate">{c.title}</h3>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      {artifacts.length} file{artifacts.length === 1 ? '' : 's'} written · agent: {c.agent}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">{c.stage}</span>
                </div>
                {artifacts.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {artifacts.map((a) => (
                      <li key={a.id} className="text-xs font-mono text-muted-foreground truncate">
                        {a.filePath}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
