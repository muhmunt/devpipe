import type { SessionStatus } from '@/lib/types'

// Glyph + color per spec §20. `thinking` is a UI-only extension (no backend
// enum value yet) reserved for a future streaming-in-progress indicator.
type Status = SessionStatus | 'thinking' | 'idle'

const META: Record<Status, { glyph: string; className: string; label: string; pulse?: boolean }> = {
  created: { glyph: '○', className: 'text-text-muted', label: 'created' },
  starting: { glyph: '●', className: 'text-accent', label: 'starting', pulse: true },
  running: { glyph: '●', className: 'text-accent', label: 'running', pulse: true },
  thinking: { glyph: '◐', className: 'text-accent', label: 'thinking', pulse: true },
  needs_input: { glyph: '!', className: 'text-warning', label: 'needs input' },
  waiting: { glyph: '◐', className: 'text-text-muted', label: 'waiting' },
  completed: { glyph: '✓', className: 'text-success', label: 'completed' },
  failed: { glyph: '×', className: 'text-error', label: 'failed' },
  stopped: { glyph: '○', className: 'text-text-muted', label: 'stopped' },
  idle: { glyph: '○', className: 'text-text-muted', label: 'idle' },
}

export function StatusDot({ status, showLabel = false }: { status: Status; showLabel?: boolean }) {
  const meta = META[status] ?? META.idle
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={`${meta.className} ${meta.pulse ? 'animate-pulse' : ''}`} aria-hidden>
        {meta.glyph}
      </span>
      {showLabel && <span className="text-text-muted">{meta.label}</span>}
    </span>
  )
}
