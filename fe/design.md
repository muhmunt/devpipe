# Design — devpipe

A locked design system for this app. Every page redesign reads this file
before emitting code. Do not regenerate per page — extend or amend this
file when the system needs to grow.

## Genre
modern-minimal

## Macrostructure family
No catalog macrostructure imposed. devpipe's 8 pages are dashboard/app
surfaces (card grids, stage accordions, list rows) — Hallmark's 21 named
macrostructures are landing-page shapes and none fit a working dashboard.
Structural variety comes from the app's own information architecture; this
file governs tokens, type, motion, and component voice only. Page layouts
are frozen — this pass does not restructure any page.

## Theme
Custom, tuned — anchored on the catalog Cobalt theme's hue (~256, electric
blue) and 3-font stack, built as a real light+dark pair since devpipe has a
persistent theme toggle (Cobalt as written is single-mode, landing-page
only).

### Light
- `--background`        oklch(98.5% 0.004 250)
- `--foreground`         oklch(24% 0.02 258)
- `--card`               oklch(97.3% 0.005 250)
- `--card-foreground`    oklch(24% 0.02 258)
- `--popover`            oklch(99% 0.003 250)
- `--popover-foreground` oklch(24% 0.02 258)
- `--primary`            oklch(58% 0.20 256)
- `--primary-foreground` oklch(99% 0.01 250)
- `--secondary`          oklch(95% 0.008 252)
- `--secondary-foreground` oklch(24% 0.02 258)
- `--muted`              oklch(96% 0.006 251)
- `--muted-foreground`   oklch(46% 0.015 255)
- `--accent`             oklch(95% 0.008 252)
- `--accent-foreground`  oklch(24% 0.02 258)
- `--destructive`        oklch(0.577 0.245 27.325) — unchanged, not part of the signal system
- `--border` / `--input` oklch(90% 0.01 253)
- `--ring`               oklch(58% 0.20 256)

### Dark
- `--background`        oklch(22% 0.016 260)
- `--foreground`         oklch(94% 0.01 250)
- `--card`               oklch(25% 0.016 259)
- `--card-foreground`    oklch(94% 0.01 250)
- `--popover`            oklch(27% 0.015 259)
- `--popover-foreground` oklch(94% 0.01 250)
- `--primary`            oklch(72% 0.16 256)
- `--primary-foreground` oklch(20% 0.03 258)
- `--secondary`          oklch(28% 0.014 259)
- `--secondary-foreground` oklch(94% 0.01 250)
- `--muted`              oklch(24% 0.014 259)
- `--muted-foreground`   oklch(68% 0.012 255)
- `--accent`             oklch(28% 0.014 259)
- `--accent-foreground`  oklch(94% 0.01 250)
- `--destructive`        #fa746f — unchanged
- `--border` / `--input` oklch(36% 0.014 258)
- `--ring`               oklch(72% 0.16 256)

Sidebar tokens mirror card/popover/border/ring in both modes (same as
before this pass — no separate sidebar palette).

## Typography
- Display/heading: Space Grotesk, weight 500/600
- Body: Inter, weight 400/500
- Mono (labels, code, terminal, stage tags): JetBrains Mono, weight 400/500
- All self-hosted via `@fontsource-variable` — no external font requests
- `--font-mono` is a new token. It didn't exist before this pass, so every
  `font-mono` utility class across the app (there are dozens — stage tags,
  micro-labels, terminal panels) was silently falling back to the browser's
  system mono stack. This is the single most visible fix in this redesign.

## Spacing
Unchanged — Tailwind v4 default scale, no dedicated `--space-*` system.

## Motion
Unchanged — `--ease-out/in/in-out`, `--dur-micro/short/long` tokens and the
`.card-interactive` / `.btn-interactive` / `.reveal` classes from the
earlier hygiene pass. No motion library.

## Microinteractions stance
Unchanged from the hygiene pass — `.focus-ring` on every raw interactive
element, silent success (no celebratory toasts), `.terminal-panel` stays
black background / green-400 text (real-stdout convention, not part of the
accent system, deliberately not retinted).

## CTA voice
One primary solid button (`--primary` / `--primary-foreground`), outline
secondary buttons — unchanged shadcn `Button` variants, just recolored.

## Per-page allowances
No page gets enrichment (hero art, illustration, etc.) — this is a
function-first dashboard, not a marketing app. All 8 pages share the exact
same token set with zero per-page variation.

## What pages MUST share
Palette, fonts, radii, motion tokens, focus-ring treatment, terminal-panel
treatment, status-color semantics (unchanged — see `src/lib/statusMeta.ts`,
success/blocked/failed colors are semantic, not part of this theme's
signal-accent system).

## What pages MAY differ on
Nothing structural. This file governs the full token/type system app-wide.
Diversification is inverted here per Hallmark's multi-page flow: every page
shares this system, none rotates away from it.
