import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { getTabs, removeTab, type OpenTab } from '@/lib/tabs'

// spec §21 tab strip — real open worktree tabs (added by Sidebar when a
// worktree is opened), not decoration. Closable; closing the active tab
// navigates to the next remaining one, or home if none left.
export function TabStrip() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState<OpenTab[]>(getTabs())

  useEffect(() => {
    const sync = () => setTabs(getTabs())
    window.addEventListener('tabs-changed', sync)
    return () => window.removeEventListener('tabs-changed', sync)
  }, [])

  function close(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    const wasActive = location.pathname === `/worktrees/${id}`
    removeTab(id)
    const remaining = getTabs()
    if (wasActive) {
      navigate(remaining.length > 0 ? `/worktrees/${remaining[remaining.length - 1].id}` : '/')
    }
  }

  if (tabs.length === 0) {
    return <div className="border-b border-border h-[32px]" />
  }

  return (
    <div className="flex items-center border-b border-border overflow-x-auto">
      {tabs.map((tab) => {
        const active = location.pathname === `/worktrees/${tab.id}`
        return (
          <Link
            key={tab.id}
            to={`/worktrees/${tab.id}`}
            className={`group flex items-center gap-2 h-[32px] px-3 border-r border-border text-xs font-mono whitespace-nowrap ${
              active ? 'bg-background text-text' : 'text-text-muted hover:text-text hover:bg-surface-elevated'
            }`}
          >
            <span className="truncate max-w-[140px]">{tab.branch}</span>
            <button
              type="button"
              onClick={(e) => close(e, tab.id)}
              className="opacity-0 group-hover:opacity-100 hover:text-error"
              aria-label={`Close ${tab.branch}`}
            >
              <X size={11} />
            </button>
          </Link>
        )
      })}
    </div>
  )
}
