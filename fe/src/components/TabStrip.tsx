/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { GitBranch, X } from 'lucide-react'
import { getTabs, removeTab, type OpenTab } from '@/lib/tabs'

// Open worktree tabs. Active tab carries an accent underline, matching the
// reference. Closing the active tab moves to the next remaining one.
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
    if (wasActive) navigate(remaining.length ? `/worktrees/${remaining[remaining.length - 1].id}` : '/')
  }

  if (tabs.length === 0) return <div className="h-9 border-b border-border" />

  return (
    <div className="flex items-stretch h-9 border-b border-border overflow-x-auto" role="tablist">
      {tabs.map((tab) => {
        const active = location.pathname === `/worktrees/${tab.id}`
        return (
          <Link
            key={tab.id}
            to={`/worktrees/${tab.id}`}
            role="tab"
            aria-selected={active}
            className={`group relative flex items-center gap-1.5 px-3 whitespace-nowrap transition-colors ${
              active ? 'text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            <GitBranch size={12} className={active ? 'text-accent' : 'text-text-faint'} />
            <span className="font-mono text-[12px] truncate max-w-[150px]">{tab.branch}</span>
            <button
              type="button"
              onClick={(e) => close(e, tab.id)}
              aria-label={`Close ${tab.branch}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-error transition-opacity"
            >
              <X size={11} />
            </button>
            {active && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent" aria-hidden />}
          </Link>
        )
      })}
    </div>
  )
}
