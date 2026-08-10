export type ThemePreference = 'dark' | 'light' | 'system'

const KEY = 'theme-preference'

export function getThemePreference(): ThemePreference {
  return (localStorage.getItem(KEY) as ThemePreference) ?? 'dark'
}

function systemPrefersLight(): boolean {
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

export function applyTheme(pref: ThemePreference) {
  const isLight = pref === 'light' || (pref === 'system' && systemPrefersLight())
  document.documentElement.classList.toggle('light', isLight)
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
