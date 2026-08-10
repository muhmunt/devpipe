import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { api } from '@/lib/api'
import type { Workspace } from '@/lib/types'

// spec §86 "Workspace Home" — list workspaces, create/open.
export default function WorkspaceHome() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    api
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api.createWorkspace({ name: name.trim() })
    setName('')
    load()
  }

  return (
    <AppShell>
      <div className="p-6 max-w-[720px]">
        <h1 className="text-lg font-medium mb-4">Workspaces</h1>

        <form onSubmit={createWorkspace} className="flex gap-2 mb-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New workspace name"
            className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 bg-accent text-white px-3 py-2 rounded-md text-sm"
          >
            <Plus size={14} /> Create
          </button>
        </form>

        {error && <p className="text-error text-sm mb-4">{error}</p>}
        {loading && <p className="text-text-muted text-sm">Loading...</p>}

        <div className="border border-border rounded-lg divide-y divide-border">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              to={`/workspaces/${ws.id}`}
              className="block px-4 py-3 hover:bg-surface text-sm"
            >
              <span className="font-medium">{ws.name}</span>
              <span className="text-text-muted font-mono text-xs ml-2">{ws.id.slice(0, 8)}</span>
            </Link>
          ))}
          {!loading && workspaces.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">No workspaces yet</div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
