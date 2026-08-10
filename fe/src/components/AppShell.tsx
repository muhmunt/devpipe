import { type ReactNode, useState } from 'react'
import { PanelLeftClose, PanelLeft } from 'lucide-react'

// 3-region grid per spec §18/§87: sidebar (220-280px) / topbar (36-44px) +
// tabstrip (32-36px) / content. Sidebar collapse persisted to localStorage.
export function AppShell({
  sidebar,
  topBarRight,
  tabStrip,
  children,
}: {
  sidebar: ReactNode
  topBarRight?: ReactNode
  tabStrip?: ReactNode
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  return (
    <div className="h-full grid grid-cols-[auto_1fr] bg-background text-text">
      <aside
        className={`border-r border-border bg-surface flex flex-col transition-[width] ${
          collapsed ? 'w-0 overflow-hidden' : 'w-[240px]'
        }`}
      >
        {sidebar}
      </aside>
      <div className="grid grid-rows-[40px_auto_1fr] min-w-0">
        <div className="flex items-center justify-between border-b border-border px-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="text-text-muted hover:text-text"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="flex items-center gap-2">{topBarRight}</div>
        </div>
        {tabStrip && <div className="h-[34px] border-b border-border flex items-center overflow-x-auto">{tabStrip}</div>}
        <main className="min-w-0 min-h-0 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
