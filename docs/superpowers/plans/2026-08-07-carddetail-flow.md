# CardDetail Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CardDetail's four separate chat-capable UIs (ChatStep's inline chat, PlanStep's inline chat, BriefChat, CardChatSidebar) with one scope-aware chat surface, and give every stage panel a consistent "whose turn / what action" affordance.

**Architecture:** `CardChatSidebar` becomes the single chat surface, auto-scoped by a `scope` object CardDetail derives from the currently-open accordion stage (`{stage, docId, label, emptyHint}`), with a manual pin to a `general` fallback. A new `StageActionBar` shared component (turn indicator + one primary button) replaces each stage's hand-rolled action button. No backend changes — the chat API (`listChat`/`sendChat(cardId, stage, docId?)`) is already generic enough.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4, existing `fe/src/lib/api.ts` REST client, SSE via `EventSource` at `/cards/:id/stream`.

## Global Constraints

- No FE automated test framework exists in this repo (`fe/package.json` has no vitest/jest) — every task's verification step is a concrete manual dev-server check, not an automated test. Do not introduce a test framework as part of this plan; that's a separate decision.
- `devpipe/` has no git repository (`git status` → "Not a git repository") — task steps that would normally say "commit" are replaced with a plain checkpoint note. Do not run `git init` as part of this plan.
- Preserve every existing API call signature exactly — `fe/src/lib/api.ts` is not modified anywhere in this plan.
- `npx tsc -b --noEmit` (run from `fe/`) must be clean after every task.
- Dev server assumed running at `http://localhost:5174` (FE) per prior session state; if not running, `cd fe && npm run dev`.

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `fe/src/components/StageActionBar.tsx` | **new** | Shared turn-indicator + primary-action button, used by every stage panel. |
| `fe/src/lib/chatFormat.ts` | **new** | `tasksToNumberedList(tasks)` — shared between CardChatSidebar and (previously) PlanStep. |
| `fe/src/components/CardChatSidebar.tsx` | modified | The one chat surface. Gains scope-awareness, manual pin, revision-trigger logic. |
| `fe/src/components/ChatStep.tsx` | modified | PRD document editor only — chat removed, `content`/`onContentChange` now controlled props. |
| `fe/src/components/PlanStep.tsx` | modified | Task list editor only — chat removed, gains `revisionTick` prop to reload after a plan revision. |
| `fe/src/components/BuildStep.tsx` | modified | Run/Continue button swapped for `StageActionBar`. |
| `fe/src/components/AcceptStep.tsx` | modified | Accept & Merge button swapped for `StageActionBar`. |
| `fe/src/pages/CardDetail.tsx` | modified | Owns `prdDraftContent`, `planRevisionTick`, derives `chatScope`; wires everything above; `approved`-stage button swapped for `StageActionBar`; `simulating` merged into the shared BuildStep-only branch. |
| `fe/src/components/BriefChat.tsx` | **deleted** | Replaced entirely by the unified sidebar scoped to `simulating`. |

---

### Task 1: `StageActionBar` component + first integration (`AcceptStep`)

**Files:**
- Create: `fe/src/components/StageActionBar.tsx`
- Modify: `fe/src/components/AcceptStep.tsx`

**Interfaces:**
- Produces: default export `StageActionBar({ turn: 'you' | 'agent' | 'done', label: string, onClick: () => void, disabled?: boolean, icon: LucideIcon, spinning?: boolean })` — every later task that touches a stage's action button imports this with this exact prop shape.

- [ ] **Step 1: Create `StageActionBar.tsx`**

```tsx
import type { LucideIcon } from 'lucide-react'

export type StageTurn = 'you' | 'agent' | 'done'

const TURN_LABEL: Record<StageTurn, string> = {
  you: 'Waiting on you',
  agent: 'Agent is working',
  done: 'Done',
}

const TURN_DOT: Record<StageTurn, string> = {
  you: 'bg-primary',
  agent: 'bg-primary animate-pulse',
  done: 'bg-green-500',
}

// One consistent slot for "what do I do now" — turn indicator + the
// stage's single primary action. Every stage panel uses this instead of
// hand-rolling its own button block. Give it its own full-width row;
// any secondary action (Regenerate, View changes) goes in an adjacent
// row, never sharing width with this bar.
export default function StageActionBar({
  turn,
  label,
  onClick,
  disabled,
  icon: Icon,
  spinning,
}: {
  turn: StageTurn
  label: string
  onClick: () => void
  disabled?: boolean
  icon: LucideIcon
  spinning?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className={`size-1.5 rounded-full ${TURN_DOT[turn]}`} />
        {TURN_LABEL[turn]}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="btn-interactive focus-ring flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded font-bold text-sm tracking-tight hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon className={`size-4 ${spinning ? 'animate-spin' : ''}`} />
        {label}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `AcceptStep.tsx`**

In `fe/src/components/AcceptStep.tsx`, add the import:

```tsx
import StageActionBar from '@/components/StageActionBar'
```

Replace this block:

```tsx
      <button
        type="button"
        onClick={accept}
        disabled={merging || !branch.trim()}
        className="focus-ring w-full bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 px-6 rounded transition-[filter,transform] duration-(--dur-short) ease-(--ease-out) active:scale-[0.99] flex items-center justify-center gap-2"
      >
        <GitMerge className="size-4" />
        {merging ? 'Merging…' : 'Accept and Merge'}
      </button>
```

with:

```tsx
      <StageActionBar
        turn={merging ? 'agent' : 'you'}
        label={merging ? 'Merging…' : 'Accept and Merge'}
        onClick={accept}
        disabled={merging || !branch.trim()}
        icon={GitMerge}
      />
```

`GitMerge` is already imported at the top of the file — no import change needed for it. This intentionally drops the button's previous full-width look in favor of the standardized bar (turn indicator left, action right) — that's the point of this component.

- [ ] **Step 3: Verify**

Run `cd fe && npx tsc -b --noEmit` — expect no errors. Then in the running dev server, open a card that's reached the `deployed` stage but not yet merged, confirm the new bar renders ("Waiting on you" + "Accept and Merge" button), click it, confirm merging still works (button shows "Merging…" with the agent turn-dot pulsing, then the success pill appears as before).

- [ ] **Step 4: Checkpoint**

No git repo in `devpipe/` — no commit step. Note completion and move to Task 2.

---

### Task 2: `StageActionBar` in `CardDetail`'s approved block and `BuildStep`'s run button

**Files:**
- Modify: `fe/src/pages/CardDetail.tsx`
- Modify: `fe/src/components/BuildStep.tsx`

**Interfaces:**
- Consumes: `StageActionBar` from Task 1 (exact prop shape above).

- [ ] **Step 1: `CardDetail.tsx` — approved-stage block**

Add the import near the other component imports:

```tsx
import StageActionBar from '@/components/StageActionBar'
```

Replace:

```tsx
                      {isOpen && stage === 'approved' && (
                        <div className="space-y-4">
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            Plan approved. Ready to build. The technical specifications and agent constraints have been
                            verified. No pending blockers detected.
                          </p>
                          <button
                            type="button"
                            onClick={() => advance('building')}
                            className="focus-ring group flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded font-bold text-sm tracking-tight hover:brightness-110 transition-[filter,transform] duration-(--dur-short) ease-(--ease-out) active:scale-[0.98]"
                          >
                            <Zap className="size-4" />
                            Start Build
                          </button>
                        </div>
                      )}
```

with:

```tsx
                      {isOpen && stage === 'approved' && (
                        <div className="space-y-4">
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            Plan approved. Ready to build. The technical specifications and agent constraints have been
                            verified. No pending blockers detected.
                          </p>
                          <StageActionBar turn="you" label="Start Build" onClick={() => advance('building')} icon={Zap} />
                        </div>
                      )}
```

`Zap` is already imported at the top of `CardDetail.tsx`.

- [ ] **Step 2: `BuildStep.tsx` — run/continue button**

Add the import:

```tsx
import StageActionBar from '@/components/StageActionBar'
```

Replace this block (the `<div className="flex gap-3">` wrapping the run button and the diff dialog trigger):

```tsx
      <div className="flex gap-3">
        <button
          type="button"
          onClick={start}
          disabled={running}
          className={
            running
              ? 'focus-ring px-4 py-2 bg-primary/20 text-primary border border-primary/50 text-xs font-bold rounded flex items-center gap-2 opacity-80 cursor-wait'
              : 'btn-interactive focus-ring px-4 py-2 bg-primary text-primary-foreground border border-transparent text-xs font-bold rounded flex items-center gap-2 hover:opacity-90'
          }
        >
          {running && <RefreshCw className="size-3.5 animate-spin" />}
          {running ? 'Running…' : hasPartialProgress ? 'Continue Build' : `Run ${stageLabel}`}
        </button>

        <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
```

with:

```tsx
      <div className="space-y-3">
        <StageActionBar
          turn={running ? 'agent' : 'you'}
          label={running ? 'Running…' : hasPartialProgress ? 'Continue Build' : `Run ${stageLabel}`}
          onClick={start}
          disabled={running}
          icon={RefreshCw}
          spinning={running}
        />

        <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
```

The closing `</div>` after the `</Dialog>` block stays exactly where it was — only the opening wrapper's className and the run-button's markup change; the diff dialog itself is untouched. This is an intentional layout change: the run button now sits on its own full-width row above "View changes" instead of side-by-side with it, and it always shows the `RefreshCw` icon (spinning only while running) instead of the icon appearing only while running.

- [ ] **Step 3: Verify**

`cd fe && npx tsc -b --noEmit` clean. In the dev server, open a card at the `building` stage: confirm the bar shows "Waiting on you" / "Run Build" when idle, click it, confirm it switches to "Agent is working" with a spinning refresh icon and "Running…" label while a build streams, and "View changes" still opens the diff dialog once diffs exist.

- [ ] **Step 4: Checkpoint.** No commit (no git repo).

---

### Task 3: Chat scope infrastructure — `chatFormat.ts` + scope-aware `CardChatSidebar` + `CardDetail` wiring

This is the core of the redesign. After this task, the sidebar sends/receives correctly scoped messages for every stage, but `ChatStep`/`PlanStep`/`BriefChat` still also have their own (now redundant) inline chats — that redundancy is removed in Tasks 4–6. Verifying this task means confirming the sidebar itself behaves correctly, not yet that the old inline chats are gone.

**Files:**
- Create: `fe/src/lib/chatFormat.ts`
- Modify: `fe/src/components/CardChatSidebar.tsx`
- Modify: `fe/src/pages/CardDetail.tsx`

**Interfaces:**
- Produces: `tasksToNumberedList(tasks: Task[]): string` at `fe/src/lib/chatFormat.ts`.
- Produces: `export type ChatScope = { stage: string; docId: string | null; label: string; emptyHint: string }` from `fe/src/components/CardChatSidebar.tsx`.
- Produces: `CardChatSidebar` new prop shape: `{ cardId: string; cardTitle: string; scope: ChatScope; prdContent?: string; onDocRevised?: (content: string) => void; onPlanRevised?: () => void }`.
- Produces (in `CardDetail.tsx`): `prdDraftContent: string` state + `setPrdDraftContent`, `planRevisionTick: number` state + `setPlanRevisionTick`, `chatScope: ChatScope` derived value — Tasks 4 and 5 consume these.

- [ ] **Step 1: Create `fe/src/lib/chatFormat.ts`**

```ts
import type { Task } from '@/lib/types'

export function tasksToNumberedList(tasks: Task[]) {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .map((t, i) => `${i + 1}. ${t.title}`)
    .join('\n')
}
```

(This is moved out of `PlanStep.tsx` — Task 5 deletes the local copy there. `CardChatSidebar` needs it now for building the `plan`-scope `currentDoc`.)

- [ ] **Step 2: Rewrite `fe/src/components/CardChatSidebar.tsx` in full**

```tsx
import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { tasksToNumberedList } from '@/lib/chatFormat'
import type { ChatMessage, StreamEvent } from '@/lib/types'

export type ChatScope = {
  stage: string
  docId: string | null
  label: string
  emptyHint: string
}

const GENERAL_SCOPE: ChatScope = {
  stage: 'general',
  docId: null,
  label: 'General',
  emptyHint: 'Ask the agent anything about this card.',
}

function timeLabel(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const THINKING_PHRASES = [
  'Thinking this through…',
  'Reading the card…',
  'Still working on it…',
  'Almost there…',
]

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce" />
    </span>
  )
}

// The one chat surface for the whole card. Auto-scopes to whatever
// accordion stage is open (the `scope` prop, derived in CardDetail); a
// manual pin lets the user stick to the card-wide General thread instead.
// Replaces the inline chats that used to live in ChatStep/PlanStep/
// BriefChat — this is now where every revision-triggering message goes.
export default function CardChatSidebar({
  cardId,
  cardTitle,
  scope,
  prdContent,
  onDocRevised,
  onPlanRevised,
}: {
  cardId: string
  cardTitle: string
  scope: ChatScope
  prdContent?: string
  onDocRevised?: (content: string) => void
  onPlanRevised?: () => void
}) {
  const [pinned, setPinned] = useState(false)
  const effectiveScope = pinned ? GENERAL_SCOPE : scope

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // A doc-scoped stage (prd/plan) with no active draft yet has nothing to
  // revise — disable sending instead of erroring.
  const scopeUnavailable =
    (effectiveScope.stage === 'prd' || effectiveScope.stage === 'plan') && !effectiveScope.docId

  useEffect(() => {
    if (scopeUnavailable) {
      setMessages([])
      return
    }
    api.listChat(cardId, effectiveScope.stage, effectiveScope.docId ?? undefined).then(setMessages)
  }, [cardId, effectiveScope.stage, effectiveScope.docId, scopeUnavailable])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== effectiveScope.stage) return
      if (ev.type === 'chat_delta' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + ev.line))
      } else if (ev.type === 'chat' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + '\n' + ev.line))
      } else if (ev.type === 'chat_done') {
        setStreaming(null)
        api.listChat(cardId, effectiveScope.stage, effectiveScope.docId ?? undefined).then(setMessages)
        if (effectiveScope.stage === 'prd') onDocRevised?.(ev.data ?? '')
        if (effectiveScope.stage === 'plan') onPlanRevised?.()
      } else if (ev.type === 'error') {
        setStreaming(null)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId, effectiveScope.stage, effectiveScope.docId, onDocRevised, onPlanRevised])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages, streaming])

  useEffect(() => {
    if (streaming == null) {
      setPhraseIdx(0)
      return
    }
    const id = setInterval(() => setPhraseIdx((i) => Math.min(i + 1, THINKING_PHRASES.length - 1)), 4000)
    return () => clearInterval(id)
  }, [streaming === null])

  // What the agent sees as "the current state" alongside the message —
  // the live (possibly unsaved) PRD text for prd scope, a fresh fetch of
  // the plan's tasks for plan scope (tasks always auto-save, so a fresh
  // fetch is always correct there), nothing for general/simulating.
  const buildCurrentDoc = async () => {
    if (effectiveScope.stage === 'prd') return prdContent ?? ''
    if (effectiveScope.stage === 'plan' && effectiveScope.docId) {
      const plan = await api.getPlan(cardId, effectiveScope.docId)
      return tasksToNumberedList(plan.tasks)
    }
    return ''
  }

  const send = async () => {
    if (!input.trim() || scopeUnavailable) return
    setError(null)
    const stage = effectiveScope.stage
    const docId = effectiveScope.docId
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, cardId, stage, docId, role: 'user', content: input, createdAt: '' },
    ])
    setStreaming('')
    const message = input
    setInput('')
    const currentDoc = await buildCurrentDoc()
    await api.sendChat(cardId, stage, message, currentDoc, docId ?? undefined)
  }

  const loading = streaming !== null

  return (
    <div className="flex flex-col h-full min-w-0 bg-card">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0 min-w-0">
        <MessageSquare className="size-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate flex-1">
          {cardTitle}
        </span>
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className="focus-ring shrink-0 text-[9px] font-mono uppercase tracking-wide px-2 py-1 rounded border border-border text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
          title={pinned ? 'Click to auto-follow the open stage' : 'Click to pin to General'}
        >
          {pinned ? 'General' : `Auto: ${scope.label}`}
        </button>
      </div>

      <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {scopeUnavailable && (
          <p className="text-sm text-muted-foreground">
            Create a {effectiveScope.label.toLowerCase()} to start chatting — use the draft picker above.
          </p>
        )}
        {!scopeUnavailable && messages.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">{effectiveScope.emptyHint}</p>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex flex-col items-end">
              <div className="max-w-[90%] min-w-0 break-words bg-secondary border border-border px-4 py-2.5 rounded-xl rounded-tr-none text-sm leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 mr-1">
                You{m.createdAt ? ` · ${timeLabel(m.createdAt)}` : ''}
              </span>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start">
              <div className="max-w-[90%] min-w-0 break-words bg-popover border border-border px-4 py-2.5 rounded-xl rounded-tl-none text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 ml-1">
                Agent{m.createdAt ? ` · ${timeLabel(m.createdAt)}` : ''}
              </span>
            </div>
          ),
        )}
        {loading && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] min-w-0 break-words bg-popover border border-border px-4 py-2.5 rounded-xl rounded-tl-none text-sm text-muted-foreground">
              {streaming || (
                <>
                  {THINKING_PHRASES[phraseIdx]}
                  <ThinkingDots />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive px-4 pb-2">{error}</p>}

      <div className="p-4 border-t border-border shrink-0">
        <div className="relative">
          <input
            className="w-full bg-input border border-border rounded-lg pl-4 pr-11 py-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors duration-(--dur-short) ease-(--ease-out) disabled:opacity-40"
            placeholder={
              effectiveScope.stage === 'prd' || effectiveScope.stage === 'plan'
                ? 'Message the agent — replies revise this document…'
                : 'Message the agent…'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && send()}
            disabled={loading || scopeUnavailable}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim() || scopeUnavailable}
            className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center text-primary hover:opacity-80 disabled:opacity-30 transition-colors"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire `CardDetail.tsx`**

Add near the top of the component body (before the `if (!card) return ...` early return, since hooks must be unconditional):

```tsx
  const [prdDraftContent, setPrdDraftContent] = useState('')
  const [planRevisionTick, setPlanRevisionTick] = useState(0)

  useEffect(() => {
    if (!card?.activePrdId) return
    api.getPRD(card.id, card.activePrdId).then((prd) => setPrdDraftContent(prd.content))
  }, [card?.activePrdId])
```

Add this constant at module scope, near `STAGE_LABEL`/`STAGE_DESCRIPTION`:

```tsx
const CHAT_EMPTY_HINTS: Record<string, string> = {
  prd: "Chat with the agent to draft this — describe what you want, it'll write the doc below.",
  plan: 'e.g. "combine steps 2 and 3" or "add a step for tests".',
  simulating:
    'Describe the simulation — actor/login, endpoints, expected results… Run Simulate below uses whatever you land on here.',
  general: 'Ask the agent anything about this card.',
}
```

After `const currentIdx = ...` (past the `if (!card) return` guard, `card` is non-null here), add:

```tsx
  const chatScope: ChatScope =
    openStage === 'prd'
      ? { stage: 'prd', docId: card.activePrdId, label: 'PRD draft', emptyHint: CHAT_EMPTY_HINTS.prd }
      : openStage === 'plan'
        ? { stage: 'plan', docId: card.activePlanId, label: 'Plan draft', emptyHint: CHAT_EMPTY_HINTS.plan }
        : openStage === 'simulating'
          ? { stage: 'simulating', docId: null, label: 'Simulate brief', emptyHint: CHAT_EMPTY_HINTS.simulating }
          : { stage: 'general', docId: null, label: 'General', emptyHint: CHAT_EMPTY_HINTS.general }
```

Add the type import:

```tsx
import CardChatSidebar, { type ChatScope } from '@/components/CardChatSidebar'
```

(replaces the existing `import CardChatSidebar from '@/components/CardChatSidebar'` line)

Update both `<CardChatSidebar>` call sites (desktop, around the existing `<div className="hidden lg:flex ...">` block, and mobile, inside the `<Sheet>`) to:

```tsx
<CardChatSidebar
  cardId={card.id}
  cardTitle={card.title}
  scope={chatScope}
  prdContent={prdDraftContent}
  onDocRevised={setPrdDraftContent}
  onPlanRevised={() => setPlanRevisionTick((t) => t + 1)}
/>
```

- [ ] **Step 4: Verify**

`cd fe && npx tsc -b --noEmit` clean. In the dev server: open a card, expand the `prd` accordion stage, confirm the sidebar header shows "Auto: PRD draft"; type a message in the sidebar and send it, confirm it streams a reply (check the Network tab or backend log shows the POST to `/cards/:id/chat` with `stage=prd` and the correct `docId`). Expand `plan` instead, confirm the header switches to "Auto: Plan draft" and sending posts with `stage=plan`. Collapse to a stage with no doc (e.g. `building`), confirm it shows "Auto: General". Click the pin button, confirm it locks to "General" regardless of which stage is open, click again to unpin. This task does not yet make the *visible* document/task list react to sidebar chat (that's Tasks 4–5) — confirming the correct network calls and scope-switching is enough here.

- [ ] **Step 5: Checkpoint.** No commit (no git repo).

---

### Task 4: Strip `ChatStep`'s inline chat

**Files:**
- Modify: `fe/src/components/ChatStep.tsx`
- Modify: `fe/src/pages/CardDetail.tsx` (its `<ChatStep>` call site)

**Interfaces:**
- Consumes: `prdDraftContent`/`setPrdDraftContent` and `StageActionBar` from Tasks 1 and 3.
- Produces: new `ChatStep` prop shape `{ cardId: string; prdId: string; content: string; onContentChange: (content: string) => void; nextStage: string; continueLabel: string; onAdvance: () => void }` (drops the old `stage` prop — `ChatStep` is PRD-only, that check was always true in practice).

- [ ] **Step 1: Rewrite `fe/src/components/ChatStep.tsx` in full**

```tsx
import { useEffect, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ArrowRight } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import MermaidDiagram from '@/components/MermaidDiagram'
import StageActionBar from '@/components/StageActionBar'
import { api } from '@/lib/api'

export default function ChatStep({
  cardId,
  prdId,
  content,
  onContentChange,
  nextStage,
  continueLabel,
  onAdvance,
}: {
  cardId: string
  prdId: string
  content: string
  onContentChange: (content: string) => void
  nextStage: string
  continueLabel: string
  onAdvance: () => void
}) {
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [diagram, setDiagram] = useState<string | null>(null)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [diagramLoading, setDiagramLoading] = useState(false)
  const [diagramError, setDiagramError] = useState<string | null>(null)

  useEffect(() => {
    api.getPRD(cardId, prdId).then((prd) => setDiagram(prd.diagram))
  }, [cardId, prdId])

  const generateDiagram = async () => {
    setDiagramLoading(true)
    setDiagramError(null)
    try {
      const prd = await api.generateDiagram(cardId, prdId)
      setDiagram(prd.diagram)
      setDiagramOpen(true)
    } catch (e) {
      setDiagramError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagramLoading(false)
    }
  }

  const saveAndContinue = async () => {
    setSaving(true)
    try {
      await api.updatePRD(cardId, prdId, { content })
      await api.updateStage(cardId, nextStage, 'idle')
      onAdvance()
    } finally {
      setSaving(false)
    }
  }

  const previewHtml = preview ? DOMPurify.sanitize(marked.parse(content || '', { async: false })) : ''

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Document · editable · markdown
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={preview ? 'outline' : 'default'}
              className="h-6 px-2 text-xs"
              onClick={() => setPreview(false)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={preview ? 'default' : 'outline'}
              className="h-6 px-2 text-xs"
              onClick={() => setPreview(true)}
            >
              Preview
            </Button>
          </div>
        </div>

        {preview ? (
          <div
            className="border rounded-md p-3 text-sm min-h-[190px] prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
          />
        ) : (
          <Textarea
            rows={8}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Draft appears here as you chat — or write it directly."
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={generateDiagram} disabled={diagramLoading || !content.trim()}>
          {diagramLoading ? 'Generating…' : diagram ? 'Regenerate Diagram' : 'Generate Diagram'}
        </Button>
        <Dialog open={diagramOpen} onOpenChange={setDiagramOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!diagram}>
              View Diagram
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>PRD Diagram</DialogTitle>
            </DialogHeader>
            {diagram && <MermaidDiagram code={diagram} />}
          </DialogContent>
        </Dialog>
      </div>
      {diagramError && <p className="text-sm text-destructive">{diagramError}</p>}

      <StageActionBar
        turn="you"
        label={saving ? 'Saving…' : continueLabel}
        onClick={saveAndContinue}
        disabled={!content.trim() || saving}
        icon={ArrowRight}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update `CardDetail.tsx`'s `<ChatStep>` call site**

Replace:

```tsx
                          <ChatStep
                            cardId={card.id}
                            prdId={card.activePrdId}
                            stage="prd"
                            nextStage="plan"
                            continueLabel="Save & Continue to Plan"
                            onAdvance={load}
                          />
```

with:

```tsx
                          <ChatStep
                            cardId={card.id}
                            prdId={card.activePrdId}
                            content={prdDraftContent}
                            onContentChange={setPrdDraftContent}
                            nextStage="plan"
                            continueLabel="Save & Continue to Plan"
                            onAdvance={load}
                          />
```

- [ ] **Step 3: Verify**

`cd fe && npx tsc -b --noEmit` clean. In the dev server: open a card's `prd` stage. Confirm the document textarea shows the PRD content and is editable directly. In the sidebar (scoped to "PRD draft"), send a chat message asking for a revision — confirm the textarea updates with the agent's revised content once the reply completes (this proves `onDocRevised` → `setPrdDraftContent` → the controlled `content` prop round-trip works). Confirm "Save & Continue to Plan" still saves and advances the stage. Confirm "Generate Diagram" / "View Diagram" still work.

- [ ] **Step 4: Checkpoint.** No commit (no git repo).

---

### Task 5: Strip `PlanStep`'s inline chat

**Files:**
- Modify: `fe/src/components/PlanStep.tsx`
- Modify: `fe/src/pages/CardDetail.tsx` (its `<PlanStep>` call site)

**Interfaces:**
- Consumes: `planRevisionTick` and `StageActionBar` from Tasks 1 and 3.
- Produces: new `PlanStep` prop shape `{ cardId: string; prdId: string; planId: string | null; revisionTick: number; onAdvance: () => void }`.

- [ ] **Step 1: Rewrite `fe/src/components/PlanStep.tsx` in full**

```tsx
import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StageActionBar from '@/components/StageActionBar'
import { api } from '@/lib/api'
import type { PlanWithTasks, StreamEvent, Task } from '@/lib/types'

export default function PlanStep({
  cardId,
  prdId,
  planId,
  revisionTick,
  onAdvance,
}: {
  cardId: string
  prdId: string
  planId: string | null
  revisionTick: number
  onAdvance: () => void
}) {
  const [data, setData] = useState<PlanWithTasks | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapText, setBootstrapText] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!planId) {
      setData(null)
      return
    }
    const d = await api.getPlan(cardId, planId)
    setData(d)
  }

  // revisionTick bumps whenever the sidebar chat completes a plan
  // revision — this re-fetches the (now server-side-revised) task list.
  useEffect(() => {
    load()
  }, [cardId, planId, revisionTick])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== 'plan') return
      if (ev.type === 'log_delta' && ev.line != null) {
        setBootstrapText((prev) => prev + ev.line)
      } else if (ev.type === 'log' && ev.line != null) {
        setBootstrapText((prev) => (prev ? prev + '\n' + ev.line : ev.line!))
      } else if (ev.type === 'done') {
        setBootstrapping(false)
        load()
      } else if (ev.type === 'error') {
        setBootstrapping(false)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId])

  const bootstrap = async () => {
    setError(null)
    setBootstrapping(true)
    setBootstrapText('')
    try {
      const d = await api.generatePlan(cardId, prdId)
      setData(d)
      onAdvance() // re-syncs CardDetail's planId — first-ever plan auto-activates server-side
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBootstrapping(false)
    }
  }

  const renameTask = async (task: Task, title: string) => {
    if (!planId) return
    await api.updateTask(cardId, planId, task.id, { title })
    load()
  }

  const moveTask = async (tasks: Task[], index: number, dir: -1 | 1) => {
    if (!planId) return
    const other = tasks[index + dir]
    if (!other) return
    const a = tasks[index]
    await Promise.all([
      api.updateTask(cardId, planId, a.id, { order: other.order }),
      api.updateTask(cardId, planId, other.id, { order: a.order }),
    ])
    load()
  }

  const deleteTask = async (task: Task) => {
    if (!planId) return
    await api.deleteTask(cardId, planId, task.id)
    load()
  }

  const addTask = async () => {
    if (!newTitle.trim() || !planId) return
    await api.addTask(cardId, planId, newTitle)
    setNewTitle('')
    load()
  }

  const approve = async () => {
    if (!planId) return
    await api.approvePlan(cardId, planId)
    onAdvance()
  }

  if (!planId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No plan yet — generate one from the PRD.</p>
        <Button size="sm" onClick={bootstrap} disabled={bootstrapping}>
          {bootstrapping ? 'Generating…' : 'Generate Plan'}
        </Button>
        {(bootstrapping || bootstrapText.length > 0) && (
          <div className="terminal-panel font-mono text-xs rounded-md p-3 h-40 overflow-y-auto whitespace-pre-wrap">
            {bootstrapText || <span className="text-muted-foreground">Starting…</span>}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const tasks = [...data.tasks].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">Tasks — Editable</h3>
          <span className="text-[10px] text-muted-foreground/60">{tasks.length} items</span>
        </div>
        <div className="space-y-1">
          {tasks.map((task, i) => (
            <div
              key={task.id}
              className="group flex items-center gap-3 p-3 bg-card border border-border/50 rounded hover:border-ring transition-colors"
            >
              <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
              <input
                className="focus-ring flex-1 border-none bg-transparent p-0 text-sm"
                defaultValue={task.title}
                onBlur={(e) => e.target.value !== task.title && renameTask(task, e.target.value)}
              />
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1 hover:bg-secondary rounded text-muted-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveTask(tasks, i, -1)}
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  className="p-1 hover:bg-secondary rounded text-muted-foreground disabled:opacity-30"
                  disabled={i === tasks.length - 1}
                  onClick={() => moveTask(tasks, i, 1)}
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  className="p-1 hover:bg-destructive/20 hover:text-destructive rounded text-muted-foreground"
                  onClick={() => deleteTask(task)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 p-3 bg-muted border border-dashed border-border rounded">
            <Plus className="size-4 text-muted-foreground/50" />
            <input
              className="focus-ring bg-transparent border-none p-0 text-sm w-full"
              placeholder="Add task…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-border/30">
        <StageActionBar turn="you" label="Approve Plan" onClick={approve} disabled={tasks.length === 0} icon={Check} />
        <button
          type="button"
          onClick={bootstrap}
          disabled={bootstrapping}
          className="w-full px-4 py-2.5 border border-border text-foreground text-sm font-medium rounded hover:bg-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <RefreshCw className="size-3.5" />
          {bootstrapping ? 'Regenerating…' : 'Regenerate from PRD'}
        </button>
      </div>
    </div>
  )
}
```

Note the bottom section is now stacked (Approve Plan via `StageActionBar` on top, "Regenerate from PRD" below as a full-width secondary button) instead of the two side-by-side half-width buttons it was before — same reasoning as Task 2's `BuildStep` change: `StageActionBar` needs its own full-width row.

- [ ] **Step 2: Update `CardDetail.tsx`'s `<PlanStep>` call site**

Replace:

```tsx
                          <PlanStep
                            cardId={card.id}
                            prdId={card.activePrdId}
                            planId={card.activePlanId}
                            onAdvance={load}
                          />
```

with:

```tsx
                          <PlanStep
                            cardId={card.id}
                            prdId={card.activePrdId}
                            planId={card.activePlanId}
                            revisionTick={planRevisionTick}
                            onAdvance={load}
                          />
```

- [ ] **Step 3: Verify**

`cd fe && npx tsc -b --noEmit` clean. In the dev server: open a card's `plan` stage (generate one first if needed via "Generate Plan"). In the sidebar (scoped to "Plan draft"), send a chat message asking for a task-list revision (e.g. "combine the first two tasks") — confirm the visible task list updates once the reply completes (proves `onPlanRevised` → `planRevisionTick` bump → `PlanStep`'s `load()` re-fetch works). Confirm task rename/reorder/delete/add still work exactly as before, and "Approve Plan" / "Regenerate from PRD" still work.

- [ ] **Step 4: Checkpoint.** No commit (no git repo).

---

### Task 6: Delete `BriefChat`, merge `simulating` into the shared `BuildStep` branch

**Files:**
- Delete: `fe/src/components/BriefChat.tsx`
- Modify: `fe/src/pages/CardDetail.tsx`

**Interfaces:** none — this task only removes now-dead code and a redundant JSX branch.

- [ ] **Step 1: Update `CardDetail.tsx`**

Remove the `BriefChat` import line:

```tsx
import BriefChat from '@/components/BriefChat'
```

Replace both the separate `simulating` block and the `['building', 'testing', 'docs']` block:

```tsx
                      {isOpen && stage === 'simulating' && (
                        <div className="space-y-4">
                          <BriefChat
                            cardId={card.id}
                            stage="simulating"
                            placeholder="Describe the simulation — actor/login, endpoints, expected results…"
                            emptyHint='Chat first to describe the scenario — e.g. "log in as the seeded test user, then GET /api/orders with that token, expect a 200 with a non-empty array." Run Simulate below uses whatever you land on here.'
                          />
                          <BuildStep
                            cardId={card.id}
                            stage={stage}
                            stageLabel={STAGE_LABEL[stage]}
                            planId={card.activePlanId}
                            onAdvance={refreshCard}
                          />
                        </div>
                      )}
                      {isOpen && ['building', 'testing', 'docs'].includes(stage) && (
                        <BuildStep
                          cardId={card.id}
                          stage={stage}
                          stageLabel={STAGE_LABEL[stage]}
                          planId={card.activePlanId}
                          onAdvance={refreshCard}
                        />
                      )}
```

with a single merged block:

```tsx
                      {isOpen && ['building', 'simulating', 'testing', 'docs'].includes(stage) && (
                        <BuildStep
                          cardId={card.id}
                          stage={stage}
                          stageLabel={STAGE_LABEL[stage]}
                          planId={card.activePlanId}
                          onAdvance={refreshCard}
                        />
                      )}
```

The `simulating`-specific guidance copy ("log in as the seeded test user…") now lives in `CHAT_EMPTY_HINTS.simulating` (added in Task 3) and shows in the sidebar instead. Note: `BriefChat`'s distinct input `placeholder` text ("Describe the simulation…") is not carried over — the sidebar uses a generic placeholder for all scopes. This is an accepted, deliberate minor copy loss; the more valuable guidance (the empty-state hint) is preserved verbatim.

- [ ] **Step 2: Delete the file**

Delete `fe/src/components/BriefChat.tsx`.

- [ ] **Step 3: Verify**

`cd fe && npx tsc -b --noEmit` clean (confirms nothing else imports `BriefChat`). In the dev server: open a card's `simulating` stage, confirm it now shows only the `BuildStep` UI (run/continue bar, view changes, output panel) with no separate chat block above it, and the sidebar (scoped to "Simulate brief") carries the scenario-description conversation instead. Send a scenario description via the sidebar, then click Run — confirm the simulate run still behaves as before (this exercises the same backend path BriefChat used, `stage=simulating` chat messages feeding the run).

- [ ] **Step 4: Checkpoint.** No commit (no git repo).

---

### Task 7: Full manual verification pass

**Files:** none — verification only.

- [ ] **Step 1: Type-check**

```bash
cd fe && npx tsc -b --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 2: Walk every stage, both themes**

Restart the dev server if needed (`cd fe && npm run dev`), then in the browser, for a card that has progressed through every stage (or several cards at different stages):

- `prd`: sidebar shows "Auto: PRD draft", chatting revises the visible document, Save & Continue advances.
- `plan`: sidebar shows "Auto: Plan draft", chatting revises the visible task list, task row edit/reorder/delete/add work, Approve Plan advances.
- `approved`: `StageActionBar` shows "Waiting on you" / "Start Build", clicking it advances to `building`.
- `building`: `StageActionBar` run bar works, view changes works, sidebar shows "Auto: General" (no doc for this stage).
- `simulating`: sidebar shows "Auto: Simulate brief", chatting there works, Run/Continue via `BuildStep` still functions.
- `testing`, `docs`: same `BuildStep` behavior as `building`, sidebar on "Auto: General".
- `deployed`: `AcceptStep`'s `StageActionBar` ("Waiting on you" / "Accept and Merge") works; after merging, the success pill still shows unchanged.
- On any stage, click the sidebar's pin button, confirm it locks to "General" and stays locked while switching accordion stages, unpin and confirm it resumes auto-following.
- Toggle light/dark theme (the `ThemeToggle` in `AppShell`), spot-check the new `StageActionBar` bars and the sidebar's pin button render correctly in both.
- On mobile width (or browser responsive mode), confirm the chat FAB + Sheet still opens the same scope-aware sidebar.

- [ ] **Step 3: Confirm no dead imports/files**

```bash
cd fe && grep -rn "BriefChat" src/
```

Expected: no matches (file deleted, no remaining imports).

- [ ] **Step 4: Checkpoint.** No commit (no git repo). Implementation complete.

---

## Self-Review

**Spec coverage:** Architecture table (Task 3) ✓, manual-pin pill (Task 3) ✓, `ChatStep`/`PlanStep` chat removal + revision-trigger move (Tasks 4–5) ✓, `BriefChat` deletion (Task 6) ✓, `StageActionBar` + all 5 call sites (Tasks 1, 2, 4, 5) ✓, error handling — scope-unavailable disabled state, always-visible scope label (Task 3) ✓, no backend changes — confirmed, no task touches `be/` or `api.ts` ✓, testing — Task 7 covers every item in the spec's Testing section ✓.

**Placeholder scan:** no TBD/TODO; every step has real, complete code; every task's verification step names exact actions, not "add appropriate tests."

**Type consistency:** `StageActionBar`'s prop shape (Task 1) matches every call site (Tasks 1, 2, 4, 5) exactly — `turn`/`label`/`onClick`/`disabled`/`icon`/`spinning`. `ChatScope`'s shape (Task 3) matches every construction site in `CardDetail` and every read site in `CardChatSidebar`. `ChatStep`'s new `content`/`onContentChange` props match both its own signature (Task 4) and `CardDetail`'s call site (Task 4). `PlanStep`'s new `revisionTick` prop matches both its own signature and `CardDetail`'s call site (Task 5) and the `planRevisionTick` state defined in Task 3.
