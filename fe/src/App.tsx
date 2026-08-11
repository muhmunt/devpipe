import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CommandPalette } from '@/components/CommandPalette'
import WorkspaceHome from '@/pages/WorkspaceHome'
import RepositoryPage from '@/pages/RepositoryPage'
import WorktreePage from '@/pages/WorktreePage'
import ObservabilityPage from '@/pages/ObservabilityPage'
import SettingsPage from '@/pages/SettingsPage'
import RepositorySettingsPage from '@/pages/RepositorySettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<WorkspaceHome />} />
        <Route path="/workspaces/:workspaceId" element={<RepositoryPage />} />
        <Route path="/workspaces/:workspaceId/observability" element={<ObservabilityPage />} />
        <Route path="/worktrees/:id" element={<WorktreePage />} />
        <Route path="/repositories/:repositoryId/settings" element={<RepositorySettingsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  )
}
