import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleAlert, Cpu, Rocket } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { api } from '@/lib/api'
import type { AgentAvailability, Card } from '@/lib/types'

const AGENT_META = {
  claude: { icon: Cpu, name: 'Claude Code', subtitle: 'Anthropic CLI' },
  cursor: { icon: Rocket, name: 'Cursor', subtitle: 'Agentic code editor' },
} as const

export default function AgentsPage() {
  const [availability, setAvailability] = useState<AgentAvailability | null>(null)
  const [cards, setCards] = useState<Card[]>([])

  useEffect(() => {
    api.detectAgents().then(setAvailability)
    api.listCards().then(setCards)
  }, [])

  return (
    <AppShell>
      <div className="max-w-[720px] mx-auto w-full px-4 py-8">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">Local agents</p>
        <h1 className="text-2xl font-bold tracking-tight mb-8">Agents</h1>

        <div className="space-y-4">
          {(['claude', 'cursor'] as const).map((a) => {
            const { icon: Icon, name, subtitle } = AGENT_META[a]
            const available = availability ? availability[a] : null
            const agentCards = cards.filter((c) => c.agent === a)
            const running = agentCards.filter((c) => c.status === 'running').length

            return (
              <div key={a} className="border border-border rounded-lg bg-card overflow-hidden">
                <div className="p-4 flex items-center justify-between border-b border-border">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded flex items-center justify-center bg-secondary border ${
                        available ? 'border-primary/30' : 'border-border'
                      }`}
                    >
                      <Icon className={`size-4 ${available ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{name}</div>
                      <div className="text-[11px] font-mono uppercase text-muted-foreground">{subtitle}</div>
                    </div>
                  </div>
                  {availability && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 ${
                        available ? 'bg-primary text-primary-foreground' : 'border border-ring text-muted-foreground'
                      }`}
                    >
                      {available ? <CheckCircle2 className="size-3" /> : <CircleAlert className="size-3" />}
                      {available ? 'detected' : 'not found'}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3 flex items-center gap-4 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  <span>{agentCards.length} cards</span>
                  <span className={running > 0 ? 'text-primary' : ''}>{running} running</span>
                </div>
                {agentCards.length > 0 ? (
                  <div className="divide-y divide-border border-t border-border">
                    {agentCards.map((c) => (
                      <Link
                        key={c.id}
                        to={`/cards/${c.id}`}
                        className="focus-ring flex items-center justify-between px-4 py-2.5 text-sm hover:bg-secondary/40 transition-colors"
                      >
                        <span className="truncate pr-4">{c.title}</span>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">
                          {c.stage} · {c.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
                    No cards using this agent yet.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
