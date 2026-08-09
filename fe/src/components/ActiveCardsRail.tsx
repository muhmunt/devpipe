import { Link } from 'react-router-dom'
import { STATUS_META } from '@/lib/statusMeta'
import type { Card } from '@/lib/types'

const MAX_ROWS = 6

// Compact, always-visible list of the app's cards in the persistent
// sidebar — running cards first, then most-recently-updated. Capped so a
// long-lived install with dozens of old cards doesn't fill the rail
// forever; the rest are one click away on Board.
export default function ActiveCardsRail({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null

  const sorted = [...cards].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  const visible = sorted.slice(0, MAX_ROWS)
  const remaining = sorted.length - visible.length

  return (
    <div className="px-3 mt-6 space-y-1">
      <div className="flex items-center gap-2 px-3 mb-2">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Active</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {visible.map((card) => {
        const meta = STATUS_META[card.status] ?? STATUS_META.idle
        const Icon = meta.icon
        return (
          <Link
            key={card.id}
            to={`/cards/${card.id}`}
            className="focus-ring flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors min-w-0"
          >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{card.title}</span>
          </Link>
        )
      })}
      {remaining > 0 && (
        <Link
          to="/"
          className="focus-ring block px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          {remaining} more on Board →
        </Link>
      )}
    </div>
  )
}
