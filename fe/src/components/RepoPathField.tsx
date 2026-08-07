import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// Never hard-errors on a bad path — just offers closest real directories
// found by walking up from what was typed, so a typo doesn't block the form.
export default function RepoPathField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      api
        .suggestRepoPath(value)
        .then((r) => setSuggestions(r.valid ? [] : (r.suggestions ?? [])))
        .catch(() => setSuggestions([]))
    }, 350)
    return () => clearTimeout(t)
  }, [value])

  return (
    <div className="space-y-1.5">
      <input
        className="w-full border border-border bg-input rounded-md px-3 py-2 text-sm"
        placeholder="~/code/project-name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {suggestions.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Did you mean</p>
          <div className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s)
                  setSuggestions([])
                }}
                className="focus-ring text-left text-xs font-mono px-2 py-1 rounded bg-secondary/60 hover:bg-secondary text-foreground transition-colors truncate"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
