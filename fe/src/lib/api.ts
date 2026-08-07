import type {
  AgentAvailability,
  Card,
  ChatMessage,
  PRD,
  PRDSummary,
  PlanSummary,
  PlanWithTasks,
  RepoSuggestion,
  RunsWithArtifacts,
  RunWithCard,
  Task,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8081/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  if (res.status === 204 || res.status === 202) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  detectAgents: () => request<AgentAvailability>('/agents/detect'),
  listCards: () => request<Card[]>('/cards'),
  getCard: (id: string) => request<Card>(`/cards/${id}`),
  createCard: (input: { title: string; repoPath: string; agent: string }) =>
    request<Card>('/cards', { method: 'POST', body: JSON.stringify(input) }),
  updateStage: (id: string, stage: string, status: string) =>
    request<Card>(`/cards/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, status }) }),
  updateCard: (id: string, input: { title?: string; repoPath?: string; agent?: string }) =>
    request<Card>(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  suggestRepoPath: (path: string) =>
    request<RepoSuggestion>(`/repo-suggest?path=${encodeURIComponent(path)}`),

  listPRDs: (cardId: string) => request<PRDSummary[]>(`/cards/${cardId}/prds`),
  createPRD: (cardId: string, title?: string) =>
    request<PRD>(`/cards/${cardId}/prds`, { method: 'POST', body: JSON.stringify({ title }) }),
  getPRD: (cardId: string, prdId: string) => request<PRD>(`/cards/${cardId}/prds/${prdId}`),
  updatePRD: (cardId: string, prdId: string, input: { title?: string; content?: string }) =>
    request<PRD>(`/cards/${cardId}/prds/${prdId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deletePRD: (cardId: string, prdId: string) =>
    request<void>(`/cards/${cardId}/prds/${prdId}`, { method: 'DELETE' }),
  activatePRD: (cardId: string, prdId: string) =>
    request<Card>(`/cards/${cardId}/prds/${prdId}/activate`, { method: 'POST' }),
  importPRD: (cardId: string, input: { sourceCardId: string; sourcePrdId: string; title?: string }) =>
    request<PRD>(`/cards/${cardId}/prds/import`, { method: 'POST', body: JSON.stringify(input) }),
  generateDiagram: (cardId: string, prdId: string) =>
    request<PRD>(`/cards/${cardId}/prds/${prdId}/diagram`, { method: 'POST' }),

  listPlans: (cardId: string) => request<PlanSummary[]>(`/cards/${cardId}/plans`),
  generatePlan: (cardId: string, prdId: string, title?: string) =>
    request<PlanWithTasks>(`/cards/${cardId}/plans/generate`, {
      method: 'POST',
      body: JSON.stringify({ prdId, title }),
    }),
  getPlan: (cardId: string, planId: string) => request<PlanWithTasks>(`/cards/${cardId}/plans/${planId}`),
  renamePlan: (cardId: string, planId: string, title: string) =>
    request<{ id: string; title: string }>(`/cards/${cardId}/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deletePlan: (cardId: string, planId: string) =>
    request<void>(`/cards/${cardId}/plans/${planId}`, { method: 'DELETE' }),
  activatePlan: (cardId: string, planId: string) =>
    request<Card>(`/cards/${cardId}/plans/${planId}/activate`, { method: 'POST' }),
  importPlan: (cardId: string, input: { sourceCardId: string; sourcePlanId: string; title?: string }) =>
    request<PlanWithTasks>(`/cards/${cardId}/plans/import`, { method: 'POST', body: JSON.stringify(input) }),
  addTask: (cardId: string, planId: string, title: string) =>
    request<Task>(`/cards/${cardId}/plans/${planId}/tasks`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateTask: (cardId: string, planId: string, taskId: string, input: { title?: string; order?: number }) =>
    request<{ ok: boolean }>(`/cards/${cardId}/plans/${planId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteTask: (cardId: string, planId: string, taskId: string) =>
    request<void>(`/cards/${cardId}/plans/${planId}/tasks/${taskId}`, { method: 'DELETE' }),
  approvePlan: (cardId: string, planId: string) =>
    request<PlanWithTasks>(`/cards/${cardId}/plans/${planId}/approve`, { method: 'POST' }),

  runBuild: (cardId: string) => request<void>(`/cards/${cardId}/build/run`, { method: 'POST' }),
  getRuns: (cardId: string, stage: string) =>
    request<RunsWithArtifacts>(`/cards/${cardId}/runs?stage=${encodeURIComponent(stage)}`),
  getRecentRuns: (limit = 100) => request<RunWithCard[]>(`/runs/recent?limit=${limit}`),
  streamUrl: (cardId: string) => `${API_BASE}/cards/${cardId}/stream`,
  accept: (cardId: string, branch: string) =>
    request<{ card: Card; mergeOutput: string }>(`/cards/${cardId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ branch }),
    }),

  listChat: (cardId: string, stage: string, docId?: string) =>
    request<ChatMessage[]>(
      `/cards/${cardId}/chat?stage=${encodeURIComponent(stage)}${docId ? `&docId=${encodeURIComponent(docId)}` : ''}`,
    ),
  sendChat: (cardId: string, stage: string, message: string, currentDoc: string, docId?: string) =>
    request<void>(`/cards/${cardId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ stage, message, currentDoc, docId }),
    }),
}
