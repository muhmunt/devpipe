// Open-tabs registry (spec §21 tab strip) — localStorage-backed so tabs
// survive a reload. Sidebar adds a tab when a worktree is opened; the tab
// strip reads/removes. Deliberately minimal (no context/store dependency)
// since only two places touch it.

export type OpenTab = { id: string; branch: string }

const KEY = 'open-worktree-tabs'

export function getTabs(): OpenTab[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function persist(tabs: OpenTab[]) {
  localStorage.setItem(KEY, JSON.stringify(tabs))
  window.dispatchEvent(new Event('tabs-changed'))
}

export function addTab(tab: OpenTab) {
  const tabs = getTabs()
  if (tabs.some((t) => t.id === tab.id)) return
  persist([...tabs, tab])
}

export function removeTab(id: string) {
  persist(getTabs().filter((t) => t.id !== id))
}
