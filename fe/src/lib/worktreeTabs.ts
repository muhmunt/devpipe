/* devpipe · design-system: design.md */

// Tabs open inside one worktree, kept outside React so they survive
// navigation. Previously this lived in WorktreePage's own state, which meant
// switching to another worktree and back unmounted the page and threw every
// open tab away — the app looked like it had reloaded, because as far as the
// user could tell it had.
//
// Keyed by worktree id, so each worktree keeps its own set.

export type WorktreeTab =
  /** Opened but not yet decided — the body offers the choice. */
  | { id: string; kind: 'draft' }
  | { id: string; kind: 'session'; sessionId: string }
  | { id: string; kind: 'file'; path: string }
  | { id: string; kind: 'terminal' }
  | { id: string; kind: 'files' }

export type TabState = { tabs: WorktreeTab[]; activeId: string | null }

const byWorktree = new Map<string, TabState>()
const listeners = new Set<() => void>()

let counter = 0
export function nextTabId(): string {
  counter += 1
  return `t${counter}`
}

export function getTabState(worktreeId: string): TabState {
  return byWorktree.get(worktreeId) ?? { tabs: [], activeId: null }
}

export function setTabState(worktreeId: string, next: TabState) {
  byWorktree.set(worktreeId, next)
  for (const listener of listeners) listener()
}

export function subscribeTabs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Drops a worktree's tabs — used when the worktree itself goes away. */
export function forgetWorktree(worktreeId: string) {
  byWorktree.delete(worktreeId)
  for (const listener of listeners) listener()
}

export function tabTitle(tab: WorktreeTab): string {
  switch (tab.kind) {
    case 'draft':
      return 'New tab'
    case 'terminal':
      return 'Terminal'
    case 'files':
      return 'Files'
    case 'file':
      return tab.path.split('/').pop() || tab.path
    case 'session':
      return 'Chat'
  }
}
