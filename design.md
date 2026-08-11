# devpipe — design system

Governing artifact. Every screen defers to this file; drift from it is a bug.
Produced by a Hallmark audit pass over the whole frontend.

**Read:** IDE cockpit for developers running coding agents in parallel across
git worktrees. Dense, keyboard-reachable, dark-first, native-feeling.

**Dials:** variance 3 (structured chrome, not artsy) · motion 3 (feedback only)
· density 8 (cockpit: mono numerals, hairline separation, no card stacks).

**Scope note.** Hallmark's landing-page apparatus (macrostructures, hero / nav /
footer archetypes, eyebrow counts, section-layout repetition) does not apply —
its own Section 13 excludes dense product UI. What governs here is the universal
set: locked tokens, honest copy, no re-drawn chrome, real interaction states,
responsive floors, typography purity.

---

## 1. Colour

Single source: `fe/src/index.css` `@theme`. Nothing may inline a colour value;
every colour references a token by name. All pairs below were measured, not
eyeballed, against the **worst-case** background (`surface-hover`), in both
themes. AA floor 4.5:1.

| Token | Role |
|---|---|
| `background` / `surface` / `surface-elevated` / `surface-hover` | Neutral ramp. Off-black, never `#000` |
| `border` / `border-strong` | Hairlines. Elevation comes from these plus surface steps, never drop shadows (overlays excepted) |
| `text` / `text-muted` / `text-faint` | 14.9 / 6.8 / 4.65:1 |
| `accent` + `accent-soft` | **Selection and active state only.** Never a button fill |
| `action-strong` | **The single primary action only.** Never a selection state. Always carries a white label (4.6:1) |
| `success` / `error` / `warning` | Diff additions / deletions / attention |

The two-accent split is structural, taken from the reference app: blue answers
"where am I", orange answers "what do I press". Collapsing them is a regression.

## 2. Typography

- `font-ui` Inter Variable · `font-sans` UI text
- `font-mono` JetBrains Mono Variable · branches, paths, hashes, diffs, counts
- Base 13px. Ramp in use: 11 / 12 / 13 / 15px. Above that only page titles.
- `.tnum` (tabular numerals) wherever numbers are scanned or compared: diff
  stats, counts, durations, timestamps.
- Headings are roman. **Italic headers are banned.** Emphasis comes from weight
  or colour.

## 3. Density (cockpit metrics)

| Region | Height |
|---|---|
| Top bar | 36px |
| Tab strip | 36px |
| Status bar | 26px |
| Sidebar section header | 36px |
| File / tree row | 24px |
| Worktree row (two-line) | ~44px |
| Scrollbar | 9px, thin, auto-hiding thumb |

Radii: `sm` 4 · `md` 6 · `lg` 10. One scale, applied consistently.

## 4. Motion

- Only `--ease-out`. Never the browser default `ease`, never bounce on UI state.
- Transition `transform` and `opacity` only.
- Motion is feedback, never decoration. No infinite loops outside real loading.
- `prefers-reduced-motion: reduce` collapses everything (already global).
- Focus rings appear instantly and are never animated in.

## 5. Interaction — the 8-state contract

Every interactive element ships all eight, or documents why one is impossible:

`default` · `hover` · `:focus-visible` · `:active` · `disabled` · `loading` ·
`error` · `success`

- **Press** is physical: `active:translate-y-px` on buttons and rows.
- **Focus** is the global `:focus-visible` accent ring; rows and links must be
  reachable and must show it.
- **Loading** is a skeleton shaped like the content it replaces, never a spinner
  standing in for a layout.
- **Empty** states are composed and say what to do next.
- **Errors** are inline and specific, carrying the real message from the server.

## 6. Responsive floors

| Width | Shell |
|---|---|
| ≥ 1280 | Sidebar + main + right panel |
| 1024–1279 | Right panel becomes a toggled overlay |
| 768–1023 | Sidebar becomes an overlay drawer; main full width |
| < 768 | Composed minimum-width notice |

Rationale for the `< 768` decision: devpipe is a parallel-agent cockpit. A
three-pane IDE crammed onto a phone is a different product, not a narrower one.
Shipping an honest "open on a wider screen" state beats shipping something
unusable that pretends to work.

Non-negotiables at every width: no horizontal page scroll, `min-w-0` on every
flex/grid child that holds text, long unbroken strings (paths, branches, JSON,
hashes) wrap rather than blowing out the layout, and no clickable label wraps to
two lines.

## 7. Copy and honesty

- Never draw a control with no backing data. This is why **Create PR**,
  **Checks** and **Review** do not exist: there is no GitHub or CI integration.
- Never invent a metric, count, name or timestamp. Every number on screen comes
  from the API.
- Destructive actions state exactly what they touch. devpipe deletes the
  worktrees it created; it never deletes the user's repository or code, and the
  confirmation says so.
- No em-dashes in user-visible strings.
- No fake chrome: no drawn browser frames, no fake terminals, no mock windows.

## 8. Components

- **Icons:** `lucide-react`, one family, `size` 10–15 in chrome. (Hallmark
  discourages lucide by default but permits it when the project already depends
  on it — devpipe does, across every component. Switching would be churn.)
- **Rows** are the primary unit, not cards. Group with hairlines and spacing.
- **Cards** only where elevation carries real meaning (dialogs, popovers).
- **Tabs**: accent underline for the main strip, filled pill for sub-panels.
- **Menus**: anchored, close on outside click / Escape / selection.
- **Dialogs**: `role="dialog"` + `aria-modal`, Escape closes, click-outside
  closes, focus lands inside.
- **Forms**: label above input, helper text present, error below. Never
  placeholder-as-label.

## 9. Stamp

Every screen file carries, at the top:

```
/* devpipe · design-system: design.md */
```

An audit that finds a screen without the stamp, or drifting from this file,
reports it as a defect.
