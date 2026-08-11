import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { RepoScriptsPanel } from '@/components/RepoScriptsPanel'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import type { Repository, Worktree } from '@/lib/types'

export default function RepositorySettingsPage() {
  const { repositoryId } = useParams<{ repositoryId: string }>()
  const navigate = useNavigate()
  const [repo, setRepo] = useState<Repository | null>(null)
  const [primary, setPrimary] = useState<Worktree | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repositoryId) return
    api
      .getRepository(repositoryId)
      .then((r) => {
        setRepo(r)
        setName(r.name)
      })
      .catch((e) => setError(String((e as Error).message ?? e)))
    // Scripts run against a worktree, so use the repository's own checkout.
    api
      .listWorktrees(repositoryId)
      .then((wts) => setPrimary(wts.find((w) => w.kind === 'primary') ?? wts[0] ?? null))
      .catch(() => setPrimary(null))
  }, [repositoryId])

  async function saveName() {
    if (!repo || !name.trim() || name.trim() === repo.name) return
    try {
      setRepo(await api.renameRepository(repo.id, name.trim()))
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  return (
    <AppShell>
      <div className="h-full flex flex-col min-h-0">
        <header className="shrink-0 px-6 h-11 flex items-center gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <h1 className="font-medium truncate">{repo?.name ?? 'Project settings'}</h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[620px] px-6 py-6 space-y-8">
            {error && (
              <p role="alert" className="text-[12px] text-error bg-error/10 border border-error/30 rounded-md px-2.5 py-2">
                {error}
              </p>
            )}

            {!repo ? (
              <SkeletonRows rows={5} />
            ) : (
              <>
                <section className="space-y-3">
                  <h2 className="text-[12px] text-text-muted">Project</h2>
                  <div className="space-y-1">
                    <label htmlFor="repo-name" className="block text-[12px] text-text-muted">
                      Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="repo-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="flex-1 bg-background border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-accent transition-colors"
                      />
                      <button
                        type="button"
                        onClick={saveName}
                        disabled={!name.trim() || name.trim() === repo.name}
                        className="bg-action-strong text-white px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <dl className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                    {[
                      ['Path', repo.localPath],
                      ['Default branch', repo.defaultBranch],
                      ['Remote', repo.remoteUrl ?? 'none'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                        <dt className="text-text-muted shrink-0">{k}</dt>
                        <dd className="font-mono text-[12px] truncate" title={v}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="space-y-2">
                  <h2 className="text-[12px] text-text-muted">Scripts</h2>
                  {primary ? (
                    <RepoScriptsPanel repository={repo} worktreeId={primary.id} onRepositoryChange={setRepo} />
                  ) : (
                    <p className="text-[12px] text-text-faint">
                      Scripts run inside a worktree. This project has none yet.
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
