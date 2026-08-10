import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CommandPalette } from '@/components/CommandPalette'
import WorkspaceHome from '@/pages/WorkspaceHome'
import RepositoryPage from '@/pages/RepositoryPage'
import WorktreePage from '@/pages/WorktreePage'
import ObservabilityPage from '@/pages/ObservabilityPage'

export default function App() {
  return (
    <BrowserRouter>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<WorkspaceHome />} />
        <Route path="/workspaces/:workspaceId" element={<RepositoryPage />} />
        <Route path="/workspaces/:workspaceId/observability" element={<ObservabilityPage />} />
        <Route path="/worktrees/:id" element={<WorktreePage />} />
      </Routes>
    </BrowserRouter>
  )
}
