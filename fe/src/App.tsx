import { Routes, Route } from 'react-router-dom'
import Board from './pages/Board'
import CardDetail from './pages/CardDetail'
import Onboarding from './pages/Onboarding'
import AgentsPage from './pages/AgentsPage'
import LogsPage from './pages/LogsPage'
import SimulatePage from './pages/SimulatePage'
import DocsPage from './pages/DocsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Board />} />
      <Route path="/cards/:id" element={<CardDetail />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/agents" element={<AgentsPage />} />
      <Route path="/logs" element={<LogsPage />} />
      <Route path="/simulate" element={<SimulatePage />} />
      <Route path="/docs" element={<DocsPage />} />
    </Routes>
  )
}

export default App
