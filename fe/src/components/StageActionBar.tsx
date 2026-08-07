import type { LucideIcon } from 'lucide-react'

export type StageTurn = 'you' | 'agent' | 'done'

const TURN_LABEL: Record<StageTurn, string> = {
  you: 'Waiting on you',
  agent: 'Agent is working',
  done: 'Done',
}

const TURN_DOT: Record<StageTurn, string> = {
  you: 'bg-primary',
  agent: 'bg-primary animate-pulse',
  done: 'bg-green-500',
}

// One consistent slot for "what do I do now" — turn indicator + the
// stage's single primary action. Every stage panel uses this instead of
// hand-rolling its own button block. Give it its own full-width row;
// any secondary action (Regenerate, View changes) goes in an adjacent
// row, never sharing width with this bar.
export default function StageActionBar({
  turn,
  label,
  onClick,
  disabled,
  icon: Icon,
  spinning,
}: {
  turn: StageTurn
  label: string
  onClick: () => void
  disabled?: boolean
  icon: LucideIcon
  spinning?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className={`size-1.5 rounded-full ${TURN_DOT[turn]}`} />
        {TURN_LABEL[turn]}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="btn-interactive focus-ring flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded font-bold text-sm tracking-tight hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon className={`size-4 ${spinning ? 'animate-spin' : ''}`} />
        {label}
      </button>
    </div>
  )
}
