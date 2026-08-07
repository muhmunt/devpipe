const THEME_KEY = 'devpipe_theme'

export type Theme = 'light' | 'dark'

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export const theme = {
  get: (): Theme => (localStorage.getItem(THEME_KEY) as Theme | null) ?? (systemPrefersDark() ? 'dark' : 'light'),
  set: (t: Theme) => {
    localStorage.setItem(THEME_KEY, t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  },
  apply: () => {
    document.documentElement.classList.toggle('dark', theme.get() === 'dark')
  },
}
