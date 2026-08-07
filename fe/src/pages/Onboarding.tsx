import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CircleAlert, Cpu, Rocket, Terminal } from 'lucide-react'
import { api } from '@/lib/api'
import { settings } from '@/lib/settings'
import type { AgentAvailability } from '@/lib/types'

const AGENT_META = {
  claude: { icon: Cpu, name: 'Claude Code', subtitle: 'Anthropic CLI' },
  cursor: { icon: Rocket, name: 'Cursor', subtitle: 'Agentic code editor' },
} as const

export default function Onboarding() {
  const navigate = useNavigate()
  const [availability, setAvailability] = useState<AgentAvailability | null>(null)
  const [selected, setSelected] = useState<'claude' | 'cursor'>(settings.getDefaultAgent())

  useEffect(() => {
    api.detectAgents().then((a) => {
      setAvailability(a)
      if (a.claude) setSelected('claude')
      else if (a.cursor) setSelected('cursor')
    })
  }, [])

  const finish = () => {
    if (!availability || noneAvailable) return
    settings.setDefaultAgent(selected)
    settings.setOnboarded()
    navigate('/')
  }

  const noneAvailable = availability !== null && !availability.claude && !availability.cursor

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finish()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[480px]">
        <div className="bg-card border border-border rounded-lg p-8 shadow-2xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Terminal className="size-5 text-primary" />
              <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Setup Phase 01
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Welcome to devpipe</h1>
            <p className="text-sm text-muted-foreground mt-2 font-medium">
              Detecting coding agents installed on this machine.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Local agents</h2>
            <div className="border border-border rounded bg-muted overflow-hidden">
              {(['claude', 'cursor'] as const).map((a, i) => {
                const { icon: Icon, name, subtitle } = AGENT_META[a]
                const available = availability ? availability[a] : false
                const isSelected = selected === a && available
                return (
                  <button
                    key={a}
                    type="button"
                    disabled={!availability || !available}
                    onClick={() => setSelected(a)}
                    className={`relative w-full p-4 flex items-center justify-between text-left transition-colors ${
                      i === 0 ? 'border-b border-border' : ''
                    } ${
                      isSelected
                        ? 'bg-primary/10'
                        : !availability || !available
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-secondary/50 cursor-pointer'
                    }`}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded flex items-center justify-center bg-secondary border ${
                          available ? 'border-primary/30' : 'border-border'
                        }`}
                      >
                        <Icon className={`size-4 ${available ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className={`text-sm font-bold ${available ? '' : 'text-muted-foreground'}`}>{name}</div>
                        <div
                          className={`text-[11px] font-mono uppercase ${
                            available ? 'text-primary/80' : 'text-muted-foreground italic'
                          }`}
                        >
                          {available ? subtitle : 'Binary missing from $PATH'}
                        </div>
                      </div>
                    </div>
                    {availability && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 ${
                          available ? 'bg-primary text-primary-foreground' : 'border border-ring text-muted-foreground'
                        }`}
                      >
                        {available ? <CheckCircle2 className="size-3" /> : <CircleAlert className="size-3" />}
                        {available ? 'detected' : 'not found'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {!availability && (
              <>
                <div className="relative h-1 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="absolute inset-0 animate-pulse bg-primary/30" />
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground uppercase">
                  <span>Scanning $PATH...</span>
                </div>
              </>
            )}

            {noneAvailable && (
              <p className="text-sm text-amber-500">
                No agent CLI found on PATH. Install `claude` or `cursor-agent` to run builds.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={finish}
            disabled={!availability || noneAvailable}
            className="btn-interactive focus-ring w-full h-12 bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 rounded"
          >
            Continue
            <ArrowRight className="size-4" />
          </button>

          <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-between">
            <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${availability ? 'bg-primary/40 animate-pulse' : 'bg-muted-foreground/40'}`} />
              {availability ? 'LOCAL_ENGINE: READY' : 'LOCAL_ENGINE: SCANNING'}
            </div>
          </div>
        </div>

        <p className="text-center mt-6 text-[11px] text-muted-foreground/60 font-mono">
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary text-foreground">Enter</kbd> to
          continue.
        </p>
      </div>
    </main>
  )
}
