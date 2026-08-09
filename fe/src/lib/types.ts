export const STAGES = [
  'prd',
  'plan',
  'approved',
  'building',
  'simulating',
  'testing',
  'docs',
  'deployed',
] as const

export type Stage = (typeof STAGES)[number] | 'failed'

export type RunStatus = 'idle' | 'running' | 'success' | 'failed' | 'blocked'

export type AgentAvailability = {
  claude: boolean
  cursor: boolean
}

export type Card = {
  id: string
  title: string
  repoPath: string
  branch: string
  worktreePath: string | null
  stage: Stage
  agent: 'claude' | 'cursor'
  status: RunStatus
  activePrdId: string
  activePlanId: string | null
  createdAt: string
  updatedAt: string
}

export type PRD = {
  id: string
  cardId: string
  title: string
  content: string
  diagram: string | null
  version: number
  status: 'draft' | 'final'
  sourceCardId: string | null
  sourcePrdId: string | null
  createdAt: string
  updatedAt: string
}

// Draft-picker list shape — no content/diagram, so listing a card's drafts
// doesn't ship N full documents.
export type PRDSummary = {
  id: string
  cardId: string
  title: string
  version: number
  status: 'draft' | 'final'
  sourceCardId: string | null
  sourcePrdId: string | null
  updatedAt: string
}

export type Plan = {
  id: string
  cardId: string
  title: string
  content: string
  version: number
  parentId: string | null
  // rootId is the draft's stable identity across revisions — id/version
  // change on every chat-driven revision, rootId never does. Use this for
  // activation and chat scoping, not id.
  rootId: string
  status: 'draft' | 'revised' | 'approved'
  approvedBy: string | null
  approvedAt: string | null
  sourceCardId: string | null
  sourcePlanId: string | null
  createdAt: string
}

// One row per draft lineage (its current/latest version) — used for the
// draft-picker list.
export type PlanSummary = {
  id: string
  cardId: string
  title: string
  version: number
  rootId: string
  status: 'draft' | 'revised' | 'approved'
  taskCount: number
  sourceCardId: string | null
  sourcePlanId: string | null
  approvedAt: string | null
}

export type Task = {
  id: string
  planId: string
  title: string
  order: number
  status: RunStatus
}

export type PlanWithTasks = {
  plan: Plan
  tasks: Task[]
}

export type StreamEvent = {
  type:
    | 'log'
    | 'log_delta'
    | 'diff'
    | 'stage'
    | 'done'
    | 'error'
    | 'chat'
    | 'chat_delta'
    | 'chat_done'
    | 'task'
    | 'card_status'
  stage?: string
  line?: string
  file?: string
  diff?: string
  data?: string
  cardId?: string
}

export type ChatMessage = {
  id: string
  cardId: string
  stage: string
  role: 'user' | 'assistant'
  content: string
  docId: string | null
  createdAt: string
}

export type Run = {
  id: string
  cardId: string
  taskId: string | null
  stage: string
  agent: string
  cmd: string
  stdout: string
  stderr: string
  exitCode: number | null
  startedAt: string
  finishedAt: string | null
}

export type Artifact = {
  id: string
  runId: string
  filePath: string
  diff: string
}

export type RunsWithArtifacts = {
  runs: Run[]
  artifacts: Artifact[]
}

export type RunWithCard = Run & {
  cardTitle: string
}

export type RepoSuggestion = {
  valid: boolean
  suggestions: string[]
}
