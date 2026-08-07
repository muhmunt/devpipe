import { CheckCircle2, CircleAlert, CirclePause, MinusCircle, RefreshCw } from 'lucide-react'
import type { RunStatus } from '@/lib/types'

// Single source of truth for card/run status colors. One decision per
// status (what green/amber/red means here), reused everywhere instead of
// each consuming file hand-rolling a slightly different shade.
export const STATUS_META: Record<
  RunStatus,
  { icon: typeof CheckCircle2; badge: string; bar: string; label: string }
> = {
  idle: { icon: CirclePause, badge: 'border border-ring text-muted-foreground', bar: 'bg-ring', label: 'idle' },
  running: {
    icon: RefreshCw,
    badge: 'bg-primary text-primary-foreground animate-pulse',
    bar: 'bg-primary',
    label: 'running',
  },
  success: {
    icon: CheckCircle2,
    badge: 'bg-green-950 text-green-400 border border-green-400/30',
    bar: 'bg-green-500',
    label: 'success',
  },
  failed: { icon: CircleAlert, badge: 'bg-destructive text-white', bar: 'bg-destructive', label: 'failed' },
  blocked: { icon: MinusCircle, badge: 'bg-amber-500 text-black', bar: 'bg-amber-500', label: 'blocked' },
}

// Softer pill treatment (border + bg/10 + text) for spots that show status
// inline rather than as a solid badge — same color decisions as STATUS_META.
export const STATUS_PILL: Record<RunStatus, string> = {
  idle: 'bg-secondary border-border text-muted-foreground',
  running: 'bg-primary/10 border-primary/30 text-primary',
  success: 'bg-green-950 border-green-400/30 text-green-400',
  failed: 'bg-destructive/10 border-destructive/30 text-destructive',
  blocked: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
}
