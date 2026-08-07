import { useState } from 'react'
import { Check, Copy, GitMerge, Terminal } from 'lucide-react'
import { api } from '@/lib/api'
import { STATUS_PILL } from '@/lib/statusMeta'
import StageActionBar from '@/components/StageActionBar'

function suggestBranch(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `feat/${slug}` : ''
}

export default function AcceptStep({
  cardId,
  title,
  status,
  onAccepted,
}: {
  cardId: string
  title: string
  status: string
  onAccepted: () => void
}) {
  const [branch, setBranch] = useState(suggestBranch(title))
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mergeOutput, setMergeOutput] = useState<string | null>(null)

  if (status === 'success') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${STATUS_PILL.success}`}>
        <Check className="size-4" />
        Merged into the real repo.
      </span>
    )
  }

  const accept = async () => {
    setMerging(true)
    setError(null)
    try {
      const res = await api.accept(cardId, branch)
      setMergeOutput(res.mergeOutput)
      onAccepted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Merges the card's branch from the isolated worktree into the real repo. Nothing has touched the real repo
        until this step.
      </p>
      <div>
        <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em] mb-2">
          Branch Name
        </label>
        <div className="relative">
          <input
            className="w-full bg-background border border-border font-mono text-sm px-4 py-3 rounded focus:outline-none focus:border-primary transition-colors"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="feat/checkout-v2"
          />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(branch)}
            className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      </div>
      <StageActionBar
        turn={merging ? 'agent' : 'you'}
        label={merging ? 'Merging…' : 'Accept and Merge'}
        onClick={accept}
        disabled={merging || !branch.trim()}
        icon={GitMerge}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive whitespace-pre-wrap">
          {error}
        </div>
      )}

      {mergeOutput && (
        <div className="space-y-2">
          <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
            Deployment Log
          </label>
          <div className="border border-border rounded-lg overflow-hidden flex flex-col">
            <div className="bg-secondary/60 px-4 py-2 border-b border-border flex items-center gap-2">
              <Terminal className="size-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Output</span>
            </div>
            <pre className="terminal-panel text-xs font-mono p-4 whitespace-pre-wrap leading-6">{mergeOutput}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
