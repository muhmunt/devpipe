/* devpipe · design-system: design.md */
import { useState } from 'react'
import { Play } from 'lucide-react'
import { api } from '@/lib/api'
import type { Repository, ScriptOutput } from '@/lib/types'

const KINDS = [
  { key: 'setup', field: 'setupScript' },
  { key: 'run', field: 'runScript' },
  { key: 'test', field: 'testScript' },
  { key: 'teardown', field: 'teardownScript' },
] as const

// spec §26 workspace scripts — stored on the repository, run against a
// specific worktree's cwd. No sandboxing: consistent with the app's
// existing no-auth trust model (documented in scripts.rs).
export function RepoScriptsPanel({
  repository,
  worktreeId,
  onRepositoryChange,
}: {
  repository: Repository
  worktreeId: string
  onRepositoryChange: (r: Repository) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({
    setup: repository.setupScript ?? '',
    run: repository.runScript ?? '',
    test: repository.testScript ?? '',
    teardown: repository.teardownScript ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, ScriptOutput>>({})
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateRepositoryScripts(repository.id, {
        setupScript: drafts.setup || null,
        runScript: drafts.run || null,
        testScript: drafts.test || null,
        teardownScript: drafts.teardown || null,
      })
      onRepositoryChange(updated)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function run(kind: 'setup' | 'run' | 'test' | 'teardown') {
    setRunning(kind)
    setError(null)
    try {
      const output = await api.runScript(worktreeId, kind)
      setOutputs((prev) => ({ ...prev, [kind]: output }))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-error text-sm">{error}</p>}
      {KINDS.map(({ key, field }) => (
        <div key={key} className="border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono uppercase text-text-muted w-20">{key}</span>
            <input
              value={drafts[key]}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={`${key} command (e.g. "npm install")`}
              className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-sm font-mono outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => run(key)}
              disabled={!repository[field] || running === key}
              className="flex items-center gap-1 text-xs bg-surface-elevated border border-border rounded-md px-2 py-1 hover:border-accent disabled:opacity-40"
            >
              <Play size={11} /> Run
            </button>
          </div>
          {outputs[key] && (
            <pre className="text-xs font-mono bg-surface-elevated rounded-md p-2 whitespace-pre-wrap max-h-[160px] overflow-y-auto">
              {outputs[key].stdout}
              {outputs[key].stderr && <span className="text-error">{outputs[key].stderr}</span>}
              {'\n'}exit {outputs[key].exitCode}
            </pre>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="bg-action-strong text-white px-3 py-1.5 rounded-md text-sm disabled:opacity-50"
      >
        Save scripts
      </button>
    </div>
  )
}
