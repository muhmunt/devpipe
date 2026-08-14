export type ThemePreference = 'dark' | 'light' | 'system'

const KEY = 'theme-preference'

export type AccentId = 'blue' | 'teal' | 'violet' | 'sage'

type AccentPair = { accent: string; accentSoft: string }

/** Curated, not a free color picker — every pair below is chosen for
    contrast in its own mode (soft = a low-opacity-feeling tint of accent
    that accent itself still reads clearly against), matching the bar every
    other color in index.css is held to. */
export const ACCENT_PRESETS: { id: AccentId; label: string; swatch: string; dark: AccentPair; light: AccentPair }[] = [
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#6ba1f8',
    dark: { accent: '#6ba1f8', accentSoft: '#16233a' },
    light: { accent: '#1b63d8', accentSoft: '#e6eeff' },
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#5eb3ac',
    dark: { accent: '#5eb3ac', accentSoft: '#14302e' },
    light: { accent: '#12786e', accentSoft: '#e3f4f1' },
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: '#a78bfa',
    dark: { accent: '#a78bfa', accentSoft: '#241f3d' },
    light: { accent: '#6d47d9', accentSoft: '#ede8fd' },
  },
  {
    id: 'sage',
    label: 'Sage',
    swatch: '#8fbf8a',
    dark: { accent: '#8fbf8a', accentSoft: '#1f2e1e' },
    light: { accent: '#3f7a3a', accentSoft: '#e7f3e5' },
  },
]

const ACCENT_KEY = 'accent-preference'

export function getAccentPreference(): AccentId {
  const stored = localStorage.getItem(ACCENT_KEY)
  return ACCENT_PRESETS.some((p) => p.id === stored) ? (stored as AccentId) : 'blue'
}

/** Inline styles on <html> win over the @theme/.light CSS-var declarations
    (equal specificity, but inline always wins) without editing index.css or
    needing a per-accent class for every combination of theme x accent. */
export function applyAccent(id: AccentId) {
  const preset = ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0]
  const isLight = document.documentElement.classList.contains('light')
  const pair = isLight ? preset.light : preset.dark
  document.documentElement.style.setProperty('--color-accent', pair.accent)
  document.documentElement.style.setProperty('--color-accent-soft', pair.accentSoft)
}

export function setAccentPreference(id: AccentId) {
  localStorage.setItem(ACCENT_KEY, id)
  applyAccent(id)
}

export function getThemePreference(): ThemePreference {
  return (localStorage.getItem(KEY) as ThemePreference) ?? 'dark'
}

function systemPrefersLight(): boolean {
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

export function applyTheme(pref: ThemePreference) {
  const isLight = pref === 'light' || (pref === 'system' && systemPrefersLight())
  document.documentElement.classList.toggle('light', isLight)
  // Which half of an accent pair is correct depends on light-vs-dark, so a
  // theme switch has to re-resolve the accent, not just the base tokens.
  applyAccent(getAccentPreference())
}

export function setThemePreference(pref: ThemePreference) {
  localStorage.setItem(KEY, pref)
  applyTheme(pref)
}

export function initTheme() {
  applyTheme(getThemePreference())
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system')
  })
}
