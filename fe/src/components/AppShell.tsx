import { type ReactNode, useState } from 'react'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { TabStrip } from '@/components/TabStrip'

// IDE-shell layout per the super.engineering reference: sidebar (left) /
// topbar + tab strip (top) / main content (center) / optional right panel /
// optional bottom status bar. No fake chrome — every region renders real
// app state, nothing is drawn purely for decoration.
export function AppShell({
  topBarRight,
  rightPanel,
  statusBar,
  children,
}: {
  topBarRight?: ReactNode
  rightPanel?: ReactNode
  statusBar?: ReactNode
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
    <div className="h-full grid grid-rows-[1fr_auto] bg-background text-text">
      <div className={`grid min-h-0 ${rightPanel ? 'grid-cols-[auto_1fr_280px]' : 'grid-cols-[auto_1fr]'}`}>
        <aside
          className={`border-r border-border bg-surface flex flex-col transition-[width] ${
            collapsed ? 'w-0 overflow-hidden' : 'w-[240px]'
          }`}
        >
          <Sidebar />
        </aside>
        <div className="grid grid-rows-[36px_32px_1fr] min-w-0">
          <div className="flex items-center justify-between border-b border-border px-3">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="text-text-muted hover:text-text"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
            </button>
            <div className="flex items-center gap-2">{topBarRight}</div>
          </div>
          <TabStrip />
          <main className="min-w-0 min-h-0 overflow-auto">{children}</main>
        </div>
        {rightPanel && <aside className="border-l border-border bg-surface overflow-y-auto">{rightPanel}</aside>}
      </div>
      {statusBar && <div className="h-[28px] border-t border-border bg-surface flex items-center px-3 text-xs">{statusBar}</div>}
    </div>
  )
}
