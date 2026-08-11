/* devpipe · design-system: design.md */
import { Check, CircleDashed, CircleDot, Loader2, Minus, TriangleAlert, X } from 'lucide-react'
import type { SessionStatus } from '@/lib/types'

// Agent-session status. `thinking` is a UI-only extension reserved for a
// streaming indicator; it has no backend enum value.
type Status = SessionStatus | 'thinking' | 'idle'

// Icons rather than hand-typed glyphs (design.md §8): lucide is already the
// project's icon family, and drawn symbols don't inherit its stroke weight or
// optical sizing.
const META: Record<Status, { icon: typeof Check; className: string; label: string; spin?: boolean }> = {
  created: { icon: CircleDashed, className: 'text-text-faint', label: 'created' },
  starting: { icon: Loader2, className: 'text-accent', label: 'starting', spin: true },
  running: { icon: Loader2, className: 'text-accent', label: 'running', spin: true },
  thinking: { icon: Loader2, className: 'text-accent', label: 'thinking', spin: true },
  needs_input: { icon: TriangleAlert, className: 'text-warning', label: 'needs input' },
  waiting: { icon: CircleDot, className: 'text-text-muted', label: 'waiting' },
  completed: { icon: Check, className: 'text-success', label: 'completed' },
  failed: { icon: X, className: 'text-error', label: 'failed' },
  stopped: { icon: Minus, className: 'text-text-faint', label: 'stopped' },
  idle: { icon: CircleDashed, className: 'text-text-faint', label: 'idle' },
}

export function StatusDot({ status, showLabel = false }: { status: Status; showLabel?: boolean }) {
  const meta = META[status] ?? META.idle
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon
        size={12}
        className={`shrink-0 ${meta.className} ${meta.spin ? 'animate-spin' : ''}`}
        aria-hidden
      />
      {showLabel ? (
        <span className="text-text-muted text-[12px]">{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  )
}
