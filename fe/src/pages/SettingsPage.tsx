/* devpipe · design-system: design.md */
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import {
  ACCENT_PRESETS,
  getAccentPreference,
  getThemePreference,
  setAccentPreference,
  setThemePreference,
  type AccentId,
  type ThemePreference,
} from '@/lib/theme'
import type { EditorAvailability } from '@/lib/types'

const THEMES: ThemePreference[] = ['dark', 'light', 'system']

/** Every row reflects real detected state; nothing is listed that isn't checked. */
export default function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference())
  const [accent, setAccent] = useState<AccentId>(getAccentPreference())
  const [agents, setAgents] = useState<Record<string, boolean> | null>(null)
  const [editors, setEditors] = useState<EditorAvailability | null>(null)

  useEffect(() => {
    api.detectAgents().then(setAgents).catch(() => setAgents({}))
    api.detectEditors().then(setEditors).catch(() => setEditors(null))
  }, [])

  function pickTheme(t: ThemePreference) {
    setTheme(t)
    setThemePreference(t)
  }

  function pickAccent(id: AccentId) {
    setAccent(id)
    setAccentPreference(id)
  }

  return (
    <AppShell>
      <div className="h-full flex flex-col min-h-0">
        <header className="shrink-0 px-6 h-11 flex items-center border-b border-border">
          <h1 className="font-medium">Settings</h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[560px] px-6 py-6 space-y-8">
            <section>
              <h2 className="text-[12px] text-text-muted mb-2">Appearance</h2>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => pickTheme(t)}
                    aria-pressed={theme === t}
                    className={`px-3 py-1.5 capitalize transition-colors ${
                      theme === t ? 'bg-accent-soft text-accent' : 'text-text-muted hover:text-text hover:bg-surface-hover'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-[12px] text-text-muted mb-2">Accent color</h2>
              <div className="flex items-center gap-3">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickAccent(p.id)}
                    aria-pressed={accent === p.id}
                    aria-label={p.label}
                    title={p.label}
                    className={`size-7 rounded-full transition-shadow focus-visible:outline-none ${
                      accent === p.id ? 'ring-2 ring-offset-2 ring-offset-background ring-accent' : 'hover:opacity-80'
                    }`}
                    style={{ backgroundColor: p.swatch }}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-[12px] text-text-muted mb-2">Agents detected on this machine</h2>
              {!agents ? (
                <SkeletonRows rows={2} />
              ) : Object.keys(agents).length === 0 ? (
                <p className="text-[12px] text-text-faint">No agent definitions configured.</p>
              ) : (
                <ul className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {Object.entries(agents).map(([id, available]) => (
                    <li key={id} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono text-[12px]">{id}</span>
                      <span className={available ? 'text-success' : 'text-text-faint'}>
                        {available ? 'available' : 'not found'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-[12px] text-text-muted mb-2">Editors detected</h2>
              {!editors ? (
                <SkeletonRows rows={3} />
              ) : (
                <ul className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {Object.entries(editors).map(([name, available]) => (
                    <li key={name} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono text-[12px]">{name}</span>
                      <span className={available ? 'text-success' : 'text-text-faint'}>
                        {available ? 'available' : 'not found'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] text-text-faint mt-2">
                Editor handoff is not wired up yet, so this list is informational.
              </p>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
