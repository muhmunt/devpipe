const ONBOARDED_KEY = 'devpipe_onboarded'
const DEFAULT_AGENT_KEY = 'devpipe_default_agent'

export const settings = {
  isOnboarded: () => localStorage.getItem(ONBOARDED_KEY) === '1',
  setOnboarded: () => localStorage.setItem(ONBOARDED_KEY, '1'),
  getDefaultAgent: () => (localStorage.getItem(DEFAULT_AGENT_KEY) as 'claude' | 'cursor' | null) ?? 'claude',
  setDefaultAgent: (agent: 'claude' | 'cursor') => localStorage.setItem(DEFAULT_AGENT_KEY, agent),
}
