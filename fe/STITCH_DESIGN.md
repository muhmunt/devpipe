# Stitch design handoff — devpipe dark theme

Stitch project: `projects/970480979846377552` (MCP: `mcp__stitch__*`, if connected in this session — not required, see below).

## Goal

Apply the visual design below to the existing React app in `fe/src`. **Do not rewrite component logic** — every page/component listed already has working state, API calls, SSE streaming, etc. Only change JSX structure/className/layout to match the visual design. If a restructure is unavoidable, keep all existing hooks, handlers, and prop shapes intact.

## How to see the actual designs

Real Stitch-exported HTML/CSS for every screen is checked into `fe/stitch-html/` (11 files, listed below). These are the actual generated markup — read them directly, don't reverse-engineer from screenshots. Each is a standalone `<html>` document (Tailwind CDN + Google Fonts links + inline styles) — treat it as a source-of-truth reference for exact spacing, colors, and structure, then re-implement the same look using the project's real stack (Tailwind v4 utility classes + existing shadcn primitives in `fe/src/components/ui/`), not by copy-pasting the file wholesale (it uses CDN Tailwind + different font-loading than the app).

Screenshot URLs (public `lh3.googleusercontent.com` links, open directly in browser) are still listed per-screen below as a quick visual double-check.

If the `mcp__stitch__*` tools are connected in this session, `get_screen` on any screen name below returns the same data live.

## 1. Theme tokens — apply first

Edit `fe/src/index.css`. The app currently defaults to light mode (`:root` block); Stitch design is dark-only. Two options — ask the user which, don't guess:
- (a) make dark the default/only theme (simplest, matches every Stitch screen), or
- (b) add a theme toggle that applies the `dark` class to `<html>`.

Either way, replace the `.dark { ... }` block values with these (derived from the Stitch "devpipe dark" design system, Material dynamic-color, seed `#3B82F6`):

```css
.dark {
  --background: #0d0e12;
  --foreground: #e3e5f0;
  --card: #17191f;
  --card-foreground: #e3e5f0;
  --popover: #1d1f26;
  --popover-foreground: #e3e5f0;
  --primary: #3B82F6;
  --primary-foreground: #0d0e12;
  --secondary: #23262d;
  --secondary-foreground: #e3e5f0;
  --muted: #17191f;
  --muted-foreground: #a9abb5;
  --accent: #23262d;
  --accent-foreground: #e3e5f0;
  --destructive: #fa746f;
  --border: #454850;
  --input: #23262d;
  --ring: #73757e;
}
```

Keep `--radius: 0.625rem` (~10px) — close enough to Stitch's ROUND_EIGHT.
Font stays Geist (already wired via `@fontsource-variable/geist` + `--font-sans`) — no change needed.

Status badge colors in `Board.tsx`/`CardDetail.tsx` (`statusColor` map, `bg-blue-500`/`bg-green-600`/`bg-red-600`/`bg-amber-500`) are already correct per the design — don't change those, they're independent of the shadcn tokens above.

## 2. Screen → file mapping

| Stitch screen | HTML export | Real file |
|---|---|---|
| Onboarding (desktop) | `fe/stitch-html/00-onboarding.html` | `fe/src/pages/Onboarding.tsx` |
| Board (desktop) | `fe/stitch-html/01-board.html` | `fe/src/pages/Board.tsx` |
| New Card modal (desktop) | `fe/stitch-html/02-new-card-modal.html` | `Board.tsx` (Dialog block) |
| 01 PRD stage (desktop) | `fe/stitch-html/03-prd.html` | `fe/src/components/ChatStep.tsx` |
| 02 Plan stage (desktop) | `fe/stitch-html/04-plan.html` | `fe/src/components/PlanStep.tsx` |
| 03 Approved stage (desktop) | `fe/stitch-html/05-approved.html` | `fe/src/pages/CardDetail.tsx` (inline `approved` block) |
| 04 Build stage (desktop) | `fe/stitch-html/06-build.html` | `fe/src/components/BuildStep.tsx` |
| 05 Simulate stage (desktop) | `fe/stitch-html/07-simulate.html` | `fe/src/components/BriefChat.tsx` + `BuildStep.tsx` (combined, per `CardDetail.tsx` `simulating` block) |
| 06 Test stage (desktop) | `fe/stitch-html/08-test.html` | `BuildStep.tsx` (failed state) |
| 07 Docs stage (desktop) | `fe/stitch-html/09-docs.html` | `BuildStep.tsx` (docs stage) |
| 08 Deploy stage (desktop) | `fe/stitch-html/10-deploy.html` | `fe/src/components/AcceptStep.tsx` |

`CardDetail.tsx` itself owns the outer accordion shell (back link, title/badge/subtext header, 8-item `Accordion`) — style that shell once, then each stage component inherits it.

## 3. Suggested implementation order

1. Theme tokens (`index.css`) — do this first, everything downstream depends on it.
2. `Board.tsx` — card grid, status badges, progress bar, New Card modal.
3. `Onboarding.tsx` — agent detection card.
4. `CardDetail.tsx` shell (header + accordion chrome) — once, not per-stage.
5. Per-stage components: `ChatStep`, `PlanStep`, `BuildStep`, `BriefChat`, `AcceptStep`.

## 4. Verify

Run `npm run dev` in `fe/`, click through Onboarding → Board → create a card → walk every accordion stage. Check both the shadcn `ui/` primitives (`button.tsx`, `badge.tsx`, `accordion.tsx`, etc.) still render correctly — restyle via the CSS variables in step 1 first before touching individual component files, since most of the visual match should come from the token swap alone.
