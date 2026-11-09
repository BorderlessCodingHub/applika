# ADR-0027: Phone shell below md: bottom tab bar and Account hub (amends ADR-0006)

**Status:** Accepted by LuisMSoares on 2026-11-08 · **Date:** 2026-11-08 · **Deciders:** LuisMSoares

## Context

PRD 0021. The owner: "I need a plan to implement all screens in just one plan and feature branch with name
"labs01-146" [...] To the artifact for sign-in, I choose the option C." In the grilling he chose "Phone only, desktop
as today": below 768 px every screen gets its V2 board, at 768 px and up the sidebar shell and current pages stay as
they are, sign-in uses option C at both widths, and routes stay the same.

The V2 boards replace the narrow-screen shell. Four screens (Today, Pipeline, Agenda, Insights) carry a bottom tab
bar; every other screen carries a top bar with a back link; an avatar opens an Account hub that holds what the rail
and the account menu hold today. Sign-in option C shows the Borderless logo as a badge on the Applika app icon.

The ADR-0006 Decision says: "The look is the target identity: oklch tokens, Inter and JetBrains Mono, sidebar shell,
shadcn new-york." Its Non-goals say: "Any product name or logo other than Applika's, or a dark-only theme." PRD 0006
says: "R-019 On narrow screens the sidebar collapses into a menu the user can open and close." and "R-016 The Applika
name, logo, favicon and domain stay; no other product name or logo appears."

## Decision

- Below `md` (48rem, 768 px) a signed-in page renders in a phone shell, not the sidebar shell. There is no rail, no
  navigation sheet and no wrapping header. Today, Pipeline, Agenda and Insights show a bottom tab bar with those four
  entries. Every other screen shows a top bar with a back link to its parent screen. An avatar opens the Account hub.
- The Account hub holds the rail's other entries and the account menu: Jobs, CVs, Reports, Cycles, Profile, Devices &
  CLI, Sign in a device, Admin (admins only), language, theme, feedback, logout and the cookie policy. Each entry keeps
  today's visibility rule (feature key, membership badge, `is_admin`).
- At and above `md` nothing changes: ADR-0006's sidebar shell, header and pages stay, except `/login`.
- `md` stays the only breakpoint. The shell is chosen by the viewport width, never by user agent or account.
- Light and dark both stay on phones, dark by default. The theme is switched from the Account hub, and from every
  public screen that has the toggle today.
- The phone look is the V2 boards' shared stylesheet, ported whole as one prefixed pattern sheet that reads the
  existing `globals.css` tokens. The only token added is `--destructive-text`.
- Sign-in option C, at both widths, may show the Borderless logo as a badge on the Applika app icon. That is the one
  place another product's logo appears. The Applika name, logo, favicon and domain stay.

## Consequences

- PRD 0021 supersedes PRD 0006 R-019 and the "and mobile" of PRD 0006 US4 below `md`. PRD 0006 R-017 and R-018 still
  hold at `md` and up. Below `md`, R-018's controls move: the cycle selector to Insights and Cycles, agenda
  notifications to the Agenda tab and Today, the theme toggle, feedback, profile, logout and Admin to the Account hub.
  The CLI promo banner stays.
- PRD 0021 narrows PRD 0006 R-016 for the sign-in badge only.
- `e2e/shell-responsive.spec.ts` replaces its below-`md` sheet cases with tab bar cases; its `md`-and-up cases stay.
- When this ADR is accepted, the ADR-0006 header gains "Amended by: ADR-0027".
- One frontend release, no migration, no backend, CLI or PDF change.

## Non-goals

- A native or store app (Expo may come later), a PWA, a web manifest or offline mode.
- A second breakpoint, or any change to the desktop layout other than `/login`.
- A dark-only phone theme.
