# Phase 0 — Audit & Teardown

Goal: strip current visual design to a clean base, stand up the new token system,
without breaking data flow (`Card`, `Stage`, `RunStatus`, `PRD` types stay as-is).

## Out of scope
- No changes to `lib/api.ts` request shapes.
- No changes to `lib/types.ts` domain types (Phase 5 handles contract changes).
- No new pages/routes yet.

## Tasks

### 0.1 — Inventory pass
- List every Tailwind class currently hardcoding color/spacing outside token vars
  in `App.css`, `index.css`, and each component (`grep -rn "bg-\[#" fe/src`,
  `grep -rn "text-\[#" fe/src`).
- Note every place `STATUS_META`/`STATUS_PILL` (`lib/statusMeta.ts`) is consumed
  (`Board.tsx`, `CardDetail.tsx`, `ActiveCardsRail.tsx`, `StageActionBar.tsx`) —
  these must keep working through the token swap.
- Screenshot current Board/CardDetail/Onboarding pages for before/after diff record
  (save under `docs/redesign/before/`).

### 0.2 — Delete/retire
- Remove unused assets: `assets/react.svg`, `assets/vite.svg` if unreferenced.
- Remove any leftover shadcn default theme scaffolding in `index.css` not in use
  (check `App.css` — 2.8K suggests legacy boilerplate from `create-vite`; fold
  anything still needed into `index.css`, delete `App.css`).

### 0.3 — New token layer in `index.css`
Replace existing `:root`/`.dark` CSS var blocks with the spec's token set
(§30 of reference doc), mapped onto Tailwind v4 `@theme`:

```css
@theme {
  --color-background: ...;
  --color-surface: ...;
  --color-surface-elevated: ...;
  --color-border: ...;
  --color-text: ...;
  --color-text-muted: ...;
  --color-accent: ...;
  --color-success: ...;
  --color-warning: ...;
  --color-error: ...;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  --font-ui: "Inter Variable", sans-serif;
  --font-mono: "JetBrains Mono Variable", monospace;
}
```
- Keep dark as default (matches screenshot); add `.light` override block.
- Re-derive `STATUS_META`/`STATUS_PILL` colors from the new `--color-success` /
  `--color-warning` / `--color-error` / `--color-accent` tokens instead of raw
  `green-400`/`amber-500`/`destructive` Tailwind defaults — keeps status color
  decisions in one place per existing comment intent.

### 0.4 — Font check
`@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`,
`@fontsource-variable/space-grotesk` already installed. Decide: keep Space
Grotesk for display headings (workspace/repo titles) or drop it — spec calls
for Inter (UI) + JetBrains Mono (code/terminal) only. Recommendation: keep
Space Grotesk only if used for a distinct "display" heading tier in Phase 2;
otherwise remove the dependency.

## Acceptance criteria
- App builds (`npm run build`) and lints (`npm run lint`) clean with zero new
  hardcoded hex colors outside `@theme`.
- Existing pages render (even if visually "unstyled/base") with no runtime errors.
- `STATUS_META`/`STATUS_PILL` compile against new tokens; Board page still shows
  correct status colors per `RunStatus`.
- Before-screenshots saved to `docs/redesign/before/`.

## Manual test checklist
- [ ] `npm run dev`, load `/` (Board), `/card/:id`, `/agents`, `/docs`, `/logs`, `/onboarding` — no console errors.
- [ ] Toggle dark/light via `ThemeToggle.tsx` — both render without unstyled flashes.
- [ ] Confirm no visual regression in status badge colors (idle/running/success/failed/blocked).
