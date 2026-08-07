import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cpu, FileText, FlaskConical, Terminal, Workflow } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

const NAV_ITEMS = [
  { label: 'Pipeline', icon: Workflow, to: '/' },
  { label: 'Agents', icon: Cpu, to: '/agents' },
  { label: 'Logs', icon: Terminal, to: '/logs' },
  { label: 'Simulate', icon: FlaskConical, to: '/simulate' },
  { label: 'Docs', icon: FileText, to: '/docs' },
] as const

// Shared sidebar + top bar chrome, matching fe/stitch-html/01-board.html.
export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="hidden md:flex flex-col h-full py-4 w-64 shrink-0 bg-card border-r border-border">
        <div className="px-6 mb-8 flex items-center gap-3">
          <Terminal className="size-5 text-primary" />
          <span className="text-lg font-headline font-bold">DEVPIPE_ROOT</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ label, icon: Icon, to }) => {
            const active = to === location.pathname
            return (
              <Link key={label} to={to} className="focus-ring block rounded-sm">
                <span
                  className={`flex items-center gap-3 px-3 py-2.5 text-[10px] font-mono uppercase tracking-wide rounded-sm transition-colors duration-(--dur-short) ease-(--ease-out) ${
                    active
                      ? 'bg-secondary text-secondary-foreground border-l-4 border-primary'
                      : 'text-muted-foreground hover:bg-secondary/50 cursor-pointer'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex justify-between items-center w-full px-6 h-14 bg-background border-b border-border sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <Terminal className="size-5 text-primary" />
            <h1 className="text-xl font-headline font-black tracking-tighter">devpipe</h1>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
