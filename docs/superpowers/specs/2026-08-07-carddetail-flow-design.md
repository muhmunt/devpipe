# CardDetail flow redesign — unified chat + consistent next-action

Status: approved (design), pending plan
Date: 2026-08-07

## Problem

Working a single card through its stages (PRD → Plan → Approved → Build →
Simulate → Test → Docs → Deploy) is the weakest part of devpipe's UX. Four
distinct pain points were confirmed, all on `CardDetail.tsx` and its stage
components:

1. **Stage navigation/orientation** — hard to tell where you are, what's
   locked/done/next.
2. **Chat-driven revision loop** — unclear when a revision is "done," too
   many back-and-forths, unclear what the agent needs from you.
3. **Draft switching** — which PRD/Plan draft is active, importing from
   other cards — the `DraftSwitcher` UX itself is easy to miss/misread.
4. **Not knowing the next action** — unclear what button to press or who
   you're waiting on (you vs. the agent) at any given stage.

Root cause behind #2–#4: the page currently has **four separate chat-capable
UIs** with no shared mental model:

- `ChatStep.tsx` — inline chat transcript + input, scoped to the active PRD
  draft (`docId=activePrdId`), drives PRD revisions.
- `PlanStep.tsx` — inline chat transcript + input, scoped to the active Plan
  draft (`docId=activePlanId`), drives task-list revisions.
- `BriefChat.tsx` — chat-only (no document), scoped to `stage=simulating`,
  feeds `BuildStep`'s simulate run.
- `CardChatSidebar.tsx` — the only persistent one (desktop sidebar / mobile
  FAB+Sheet), scoped to a pseudo-stage `general`, always visible regardless
  of which accordion stage is open.

A user has to learn four different UIs to figure out "how do I talk to the
agent right now," and the always-visible general sidebar sits alongside
whichever stage-specific chat is also on screen with no explained
relationship between them.

**Key finding:** the backend chat API is already fully generic —
`listChat/sendChat(cardId, stage, docId?)` — `ChatStep`/`PlanStep` pass a
docId, `BriefChat`/`CardChatSidebar` pass stage-only with `docId=null`. The
four-way split is a frontend problem only; no backend schema or endpoint
change is needed for this redesign.

## Goals

- One chat surface, not four. A user always knows where to type to talk to
  the agent about whatever they're currently looking at.
- Every stage panel shows, consistently: whose turn it is (you / agent) and
  one unambiguous next-action button, in the same visual slot.
- No regression to the actual revision mechanics — PRD chat must still
  revise the PRD, Plan chat must still revise tasks, Simulate chat must
  still feed the simulate run.

## Non-goals (explicitly out of scope for this pass)

- No accordion → stepper/rail rewrite (considered as "Approach C," rejected
  for now — the accordion's `StepRow` already carries the right
  information; revisit only if A+B turns out insufficient).
- No backend schema/endpoint changes — confirmed unnecessary.
- No changes to card creation, Board, Onboarding, Agents/Logs/Simulate/Docs
  pages, or the theme/token system (separate, already-completed passes).
- No new draft-management features beyond what `DraftSwitcher` already
  does — this pass makes it more visible/legible, not more capable.

## Design

### Architecture

`CardChatSidebar` (already the one persistent, always-visible chat) becomes
the single chat surface for the whole page. It auto-scopes to whatever
accordion stage is currently open:

| Open stage | Auto scope | Backend key |
|---|---|---|
| `prd` | PRD draft | `stage=prd, docId=card.activePrdId` |
| `plan` | Plan draft | `stage=plan, docId=card.activePlanId` |
| `simulating` | Simulate brief | `stage=simulating, docId=null` |
| `approved`, `building`, `testing`, `docs`, `deployed` | General | `stage=general, docId=null` |

A pill in the chat header shows the current scope ("Auto: PRD draft") and
lets the user manually pin to "General" instead. Manual pin persists until
the user unpins it — switching accordion stages does not silently override
an explicit choice.

### Components

- **`ChatStep.tsx`** — remove the inline chat transcript + input entirely.
  Keep the PRD document editor/preview and the "Save & Continue" action.
  Its current send-handler logic (chat message → agent revises the PRD,
  streamed back into the document) moves to the unified chat component.
- **`PlanStep.tsx`** — same shape: remove inline chat, keep the editable
  task list. Its revision-trigger logic (chat message → agent revises
  tasks) moves to the unified chat component.
- **`BriefChat.tsx`** — deleted. It was chat-only with no document; the
  unified sidebar scoped to `simulating` replaces it exactly.
  `CardDetail.tsx`'s `simulating` accordion block drops `<BriefChat />`,
  keeps `<BuildStep />`.
- **`CardChatSidebar.tsx`** — gains: scope-switching driven by a `scope`
  prop from `CardDetail`, the manual-pin pill, and the revision-trigger
  logic moved from `ChatStep`/`PlanStep` (parameterized — only fires when
  scope has a non-null `docId` for `prd`/`plan`).
- **`CardDetail.tsx`** — derives `chatScope` from `openStage` +
  `card.activePrdId`/`card.activePlanId`, passes it to
  `CardChatSidebar`. Both sidebar-desktop and Sheet-mobile call sites get
  the same `scope` prop.
- **New: `StageActionBar`** (shared component) — turn indicator ("waiting
  on you" / "waiting on agent" / "done") + the stage's primary action
  button, in one consistent slot. Used by: `ChatStep`'s Save & Continue,
  `PlanStep`'s approve/continue action, `BuildStep`'s run/continue button,
  `CardDetail`'s inline `approved`-stage Start Build button, `AcceptStep`'s
  Accept & Merge button. Replaces each component's hand-rolled button
  block with a call to this one.

### Data flow

No backend changes. `chatScope` is a plain derived value in `CardDetail`,
recomputed on `openStage`/`card` change:

```
openStage === 'prd'        → { stage: 'prd', docId: card.activePrdId, label: 'PRD draft' }
openStage === 'plan'       → { stage: 'plan', docId: card.activePlanId, label: 'Plan draft' }
openStage === 'simulating' → { stage: 'simulating', docId: null, label: 'Simulate brief' }
else                        → { stage: 'general', docId: null, label: 'General' }
```

The one real implementation risk: moving the revision-trigger logic out of
`ChatStep`/`PlanStep`'s send handlers into the shared chat component
without changing its behavior. This needs a careful read of both
components' current send handlers before touching anything — flagged here,
to be resolved precisely during planning, not guessed at in this spec.

### Error handling

- Stage open but no active draft yet (new card, no PRD/Plan created) → chat
  shows a disabled state pointing at `DraftSwitcher`'s "New" button, not an
  error.
- Scope label is always visible next to the input — "Replies revise this
  document" for `prd`/`plan` scope, plain "General" otherwise — so sending
  a message never has a surprise side effect.
- Existing per-component error states (`setError` patterns already in
  `ChatStep`/`PlanStep`/`BriefChat`/`CardChatSidebar`) consolidate into one
  error-state UI in the unified component.

### Testing

No FE automated test suite exists in this repo. Verification is a manual
walk after implementation:

- PRD-stage chat still revises the PRD document.
- Plan-stage chat still revises the task list.
- Simulate-stage chat still feeds `BuildStep`'s simulate run correctly.
- General scope works when opened from any non-doc stage.
- Switching the active PRD/Plan draft mid-chat re-scopes the chat
  correctly (new docId picked up).
- Mobile FAB + Sheet chat still works, scope pill included.
- `StageActionBar`'s turn indicator and action button are correct on every
  stage (idle/running/blocked/failed/success), both themes.
- `npx tsc -b --noEmit` clean.

## Open questions (none blocking)

None — scope, backend impact, and component boundaries are all confirmed
against the current codebase. Exact send-handler behavior in
`ChatStep`/`PlanStep` needs a close read during planning (noted above under
Data flow) but doesn't change the design's shape.
