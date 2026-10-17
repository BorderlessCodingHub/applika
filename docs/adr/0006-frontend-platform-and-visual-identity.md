# ADR-0006: Frontend platform upgrade and new visual identity

**Status:** Accepted by LuisMSoares on 2026-09-15 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

The owner orders a new visual identity for applika. Selected: "Keep Applika name
+ logo", "Keep light+dark; restyle landing", "Upgrade in the identity feature".

| | applika today | target |
|---|---|---|
| Tailwind | 3.4, `tailwind.config.ts` | 4.2, CSS-first `@theme` |
| React | 18.3 | 19.2 |
| shadcn | default, individual `@radix-ui/*` | new-york, unified `radix-ui` |
| Colors | HSL, teal primary, light and dark | oklch tokens, dark only |
| Fonts | DM Sans, Outfit | Inter, JetBrains Mono |
| Shell | `app-header.tsx`, `app-layout.tsx` | `app-shell.tsx`, `sidebar.tsx`, `sidebar-nav.tsx` |

## Decision

- Identity is the first feature.
- Within it, slices run in order: platform bump (Tailwind v4, React 19, shadcn new-york
  regeneration), then tokens, then the sidebar shell.
- The look is the target identity: oklch tokens, Inter and JetBrains Mono, sidebar shell, shadcn new-york.
- A light palette is derived from the target oklch tokens. Light and dark both stay.
- The Applika name, logo (`frontend/src/components/app-logo.tsx`, `public/logo.webp`),
  favicon and domain stay.
- The landing sections in `frontend/src/components/landing/` stay and are restyled.

## Consequences

- The shadcn components in `frontend/src/components/ui/` are regenerated in new-york.
- PyPI, CLI and public URLs stay valid.
- Frontend tests and e2e are added under `.claude/rules/quality-gates.md`, so the shell change is
  covered.

## Non-goals

- Any product name or logo other than Applika's, or a dark-only theme.
- Single-origin serving (ADR-0010).

## Settled (2026-09-15, during /kodi.plan for PRD 0006)

- `/app/*` URL prefix: not adopted. Owner: "Keep current URLs (Recommended)".
- Applika-only components (calendar, command, date-picker, range-slider, star-rating): kept and
  restyled to new-york; the `<DatePickerInput>` mandate in `frontend/CLAUDE.md` stays.
  Owner: "Keep, restyle to new-york (Recommended)".
- Default theme: dark (target oklch palette), light derived from the same hues, toggle kept. Owner:
  "Dark default, derived light (Recommended)".
