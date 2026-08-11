/* devpipe · design-system: design.md */
import {
  Bot,
  FileEdit,
  FilePlus2,
  FileText,
  Globe,
  ListChecks,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

// Agents report what they did in their own vocabulary — "Bash", "Glob",
// "TodoWrite". Shown raw those read as internals leaking into a
// conversation. This turns each call into a short line a person can follow
// at a glance: what happened, and to what. Nothing is invented — the subject
// is pulled from the call's real arguments, and an unrecognised tool falls
// back to its own name rather than a made-up description.

type ToolInput = Record<string, unknown>

function str(input: ToolInput, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

/** Long absolute paths crowd the row; the last two segments locate a file. */
function shortPath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.length <= 2 ? path : parts.slice(-2).join('/')
}

function truncate(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export type ToolLabel = {
  /** What the agent did, in plain words. */
  verb: string
  /** What it did it to — a file, a command, a query. Monospaced. */
  subject?: string
  icon: LucideIcon
}

export function describeTool(tool: string, rawInput: unknown): ToolLabel {
  const input: ToolInput = rawInput && typeof rawInput === 'object' ? (rawInput as ToolInput) : {}
  const path = str(input, 'file_path', 'path', 'notebook_path', 'filePath')
  const file = path ? shortPath(path) : undefined

  switch (tool) {
    case 'Read':
      return { verb: 'Read', subject: file, icon: FileText }
    case 'Write':
      return { verb: 'Created', subject: file, icon: FilePlus2 }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { verb: 'Edited', subject: file, icon: FileEdit }
    case 'Bash':
    case 'BashOutput':
      // Claude sends a human-written `description` alongside the command;
      // when it's there it's a better line than the command itself.
      return { verb: 'Ran', subject: truncate(str(input, 'description', 'command') ?? 'a command'), icon: Terminal }
    case 'Glob':
      return { verb: 'Looked for files', subject: str(input, 'pattern'), icon: Search }
    case 'Grep':
      return { verb: 'Searched the code', subject: str(input, 'pattern'), icon: Search }
    case 'WebFetch': {
      const url = str(input, 'url')
      let host = url
      try {
        if (url) host = new URL(url).hostname
      } catch {
        // Not a parseable URL — show it as given rather than dropping it.
      }
      return { verb: 'Opened', subject: host, icon: Globe }
    }
    case 'WebSearch':
      return { verb: 'Searched the web', subject: str(input, 'query'), icon: Globe }
    case 'TodoWrite':
      return { verb: 'Updated its plan', icon: ListChecks }
    case 'Task':
      return { verb: 'Asked a helper agent', subject: str(input, 'description'), icon: Bot }
    default:
      return { verb: 'Used', subject: tool, icon: Wrench }
  }
}
