/* devpipe · design-system: design.md */
import { type ReactNode, useEffect, useState } from 'react'
import { Monitor, PanelLeft, PanelLeftClose, PanelRight, X } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { TabStrip } from '@/components/TabStrip'
import { useTier } from '@/lib/breakpoint'

// IDE shell: sidebar / topbar + tab strip / main / optional right panel /
// optional status bar. Every region renders real app state; nothing is drawn
// as decoration.
//
// The shell reshapes by width (design.md §6) rather than assuming a desktop
// window: the right panel becomes an overlay under 1280, the sidebar becomes a
// drawer under 1024, and under 768 it stops pretending three panes fit and
// says so.
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
  const tier = useTier()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')
  const [navOpen, setNavOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const navIsDrawer = tier === 'drawerNav'
  const panelIsOverlay = tier === 'overlayPanel' || tier === 'drawerNav'

  // Any overlay closes on Escape, and stops being "open" once the layout grows
  // back into a tier that shows it inline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setNavOpen(false)
      setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!navIsDrawer) setNavOpen(false)
    if (!panelIsOverlay) setPanelOpen(false)
  }, [navIsDrawer, panelIsOverlay])

  if (tier === 'tooNarrow') {
    return (
      <div className="h-full grid place-items-center bg-background text-text p-6">
        <div className="max-w-[320px] text-center">
          <Monitor size={22} className="mx-auto text-text-faint mb-3" />
          <h1 className="font-medium">devpipe needs a wider window</h1>
          <p className="text-text-muted mt-1.5">
            It runs several agents side by side against a repository, so it needs at least 768px to show a session and
            its changes at once.
          </p>
        </div>
      </div>
    )
  }

  function toggleNav() {
    if (navIsDrawer) {
      setNavOpen((o) => !o)
      return
    }
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  const navHidden = navIsDrawer ? true : collapsed
  const cols = panelIsOverlay || !rightPanel ? 'grid-cols-[auto_1fr]' : 'grid-cols-[auto_1fr_minmax(260px,300px)]'

  return (
    <div className="h-full grid grid-rows-[1fr_auto] bg-background text-text overflow-x-clip">
      <div className={`grid min-h-0 min-w-0 ${cols}`}>
        {/* Inline sidebar. In drawer mode it renders as an overlay instead —
            and must not also render here, or Sidebar mounts twice, fetching
            twice and keeping two divergent expand states. */}
        <aside
          className={`chrome border-r border-border flex flex-col transition-[width] duration-200 ${
            navHidden ? 'w-0 overflow-hidden' : 'w-[240px]'
          }`}
          style={{ transitionTimingFunction: 'var(--ease-out)' }}
        >
          {!navIsDrawer && <Sidebar />}
        </aside>

        {/* min-h-0 / min-w-0: without them this track takes its content's
            natural size (long transcripts, wide diffs) and pushes the page
            past the viewport instead of clipping at main. */}
        <div className="grid grid-rows-[36px_auto_1fr] min-w-0 min-h-0">
          <div className="chrome flex items-center justify-between gap-2 border-b border-border px-3">
            <button
              type="button"
              onClick={toggleNav}
              className="text-text-muted hover:text-text active:translate-y-px transition-colors"
              aria-label={navHidden ? 'Show projects' : 'Hide projects'}
              aria-expanded={!navHidden}
            >
              {navHidden ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {topBarRight}
              {rightPanel && panelIsOverlay && (
                <button
                  type="button"
                  onClick={() => setPanelOpen((o) => !o)}
                  className="text-text-muted hover:text-text active:translate-y-px transition-colors"
                  aria-label={panelOpen ? 'Hide changes panel' : 'Show changes panel'}
                  aria-expanded={panelOpen}
                >
                  <PanelRight size={15} />
                </button>
              )}
            </div>
          </div>
          <TabStrip />
          {/* Pages own their scrolling: each renders its own bounded
              overflow region, so main only clips to its track. */}
          <main className="min-w-0 min-h-0 overflow-hidden">{children}</main>
        </div>

        {rightPanel && !panelIsOverlay && (
          <aside className="chrome border-l border-border overflow-y-auto min-w-0">{rightPanel}</aside>
        )}
      </div>

      {statusBar && (
        <div className="chrome h-[26px] border-t border-border flex items-center px-3 text-[11px] min-w-0">
          {statusBar}
        </div>
      )}

      {navIsDrawer && navOpen && (
        <Overlay label="Projects" side="left" onClose={() => setNavOpen(false)}>
          <Sidebar />
        </Overlay>
      )}

      {rightPanel && panelIsOverlay && panelOpen && (
        <Overlay label="Changes" side="right" onClose={() => setPanelOpen(false)}>
          {rightPanel}
        </Overlay>
      )}
    </div>
  )
}

/** Slide-over used for the sidebar and right panel at narrow widths. */
function Overlay({
  label,
  side,
  onClose,
  children,
}: {
  label: string
  side: 'left' | 'right'
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div
        className={`absolute inset-y-0 ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'} w-[280px] max-w-[85vw] bg-surface border-border flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 h-9 flex items-center justify-between px-3 border-b border-border">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-faint">{label}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label}`}
            className="text-text-faint hover:text-text active:translate-y-px transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
