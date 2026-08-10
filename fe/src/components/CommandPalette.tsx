import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setThemePreference, getThemePreference } from '@/lib/theme'

// ⌘K command palette (spec §29). Every entry has a real handler — no
// placeholder commands for features that don't exist yet.
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function run(fn: () => void) {
    fn()
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <Command
        className="w-full max-w-[560px] bg-surface-elevated border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          placeholder="Type a command..."
          className="w-full px-4 py-3 bg-transparent border-b border-border outline-none text-sm placeholder:text-text-muted"
        />
        <Command.List className="max-h-[320px] overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">No matching command</Command.Empty>
          <Command.Item
            onSelect={() => run(() => navigate('/'))}
            className="px-3 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-surface"
          >
            Go to Workspaces
          </Command.Item>
          <Command.Item
            onSelect={() => run(() => setThemePreference(getThemePreference() === 'dark' ? 'light' : 'dark'))}
            className="px-3 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-surface"
          >
            Toggle theme
          </Command.Item>
        </Command.List>
      </Command>
    </div>
  )
}
