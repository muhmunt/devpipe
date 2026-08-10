import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Command, CommandScope } from '@/lib/types'

// spec §27 custom commands — composer `/` menu. Typing `/` filters this
// repository's real commands (global + workspace + repository scope);
// selecting one replaces the composer text with the command's stored
// prompt. Includes inline creation since there's no separate commands
// management screen yet.
export function CommandMenu({
  query,
  workspaceId,
  repositoryId,
  onSelect,
}: {
  query: string
  workspaceId: string
  repositoryId: string
  onSelect: (prompt: string) => void
}) {
  const [commands, setCommands] = useState<Command[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newScope, setNewScope] = useState<CommandScope>('repository')

  function load() {
    api.listCommands({ workspaceId, repositoryId }).then(setCommands)
  }

  useEffect(load, [workspaceId, repositoryId])

  const filtered = commands.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

  async function createCommand(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newPrompt.trim()) return
    const scopeId = newScope === 'global' ? undefined : newScope === 'workspace' ? workspaceId : repositoryId
    await api.createCommand({ scope: newScope, scopeId, name: newName.trim(), prompt: newPrompt.trim() })
    setNewName('')
    setNewPrompt('')
    setCreating(false)
    load()
  }

  return (
    <div className="absolute bottom-full mb-1 left-0 right-0 bg-surface-elevated border border-border rounded-lg shadow-2xl max-h-[240px] overflow-y-auto z-10">
      {filtered.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.prompt)}
          className="w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center justify-between"
        >
          <span className="font-mono">/{c.name}</span>
          <span className="text-xs text-text-muted">{c.scope}</span>
        </button>
      ))}
      {filtered.length === 0 && !creating && <div className="px-3 py-2 text-xs text-text-muted">No matching commands</div>}

      {!creating ? (
        <button
          type="button"
          onClick={() => {
            setNewName(query)
            setCreating(true)
          }}
          className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-xs text-accent border-t border-border"
        >
          <Plus size={12} /> New command
        </button>
      ) : (
        <form onSubmit={createCommand} className="p-2 border-t border-border space-y-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="name"
            className="w-full bg-surface border border-border rounded-md px-2 py-1 text-xs font-mono outline-none focus:border-accent"
          />
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="prompt template"
            rows={2}
            className="w-full bg-surface border border-border rounded-md px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as CommandScope)}
              className="bg-surface border border-border rounded-md px-1.5 py-1 text-xs"
            >
              <option value="repository">repository</option>
              <option value="workspace">workspace</option>
              <option value="global">global</option>
            </select>
            <button type="submit" className="text-xs bg-action-strong text-white px-2 py-1 rounded-md ml-auto">
              Create
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
