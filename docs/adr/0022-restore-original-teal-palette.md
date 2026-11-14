# ADR-0022: Restore the original teal palette (amends ADR-0006)

**Status:** Accepted by LuisMSoares on 2026-10-19 · **Date:** 2026-10-19 · **Deciders:** LuisMSoares

## Context

PRD 0016. The owner: "The second thing and no much important is to restore the visual identify from blue to green
(as was originally)". In the grilling he chose "Full original palette". On the conflict with ADR-0006 he chose "New
ADR-0022 amends colours (Recommended)".

The ADR-0006 Decision says: "The look is the target identity: oklch tokens, Inter and JetBrains Mono, sidebar shell,
shadcn new-york." and "A light palette is derived from the target oklch tokens. Light and dark both stay." Its
Settled section says: "Default theme: dark (target oklch palette), light derived from the same hues, toggle kept."
Today's tokens in `frontend/src/app/globals.css` are oklch, with a blue primary (hue 255) on neutral surfaces
(hue 270). The original palette is HSL, in the same file at commit `9661a38`, with a light `:root` block and a
`.dark` block. Its primary is teal (hue 168) on warm light surfaces (hue 40) and navy dark surfaces (hue 228).

## Decision

- The web's colours are the original palette of commit `9661a38`, in light and in dark. Every token with a twin in
  that palette takes the original value. For colours, this replaces "the target identity" and "A light palette is
  derived from the target oklch tokens" in the ADR-0006 Decision. The light palette is the original light palette;
  it is not derived from the dark one.
- Tokens stay written in oklch, converted from the original HSL by the CSS Color 4 rules, so `@theme`, `color-mix`
  and alpha keep working. A unit test pins every token to its original HSL value.
- Tokens added after `9661a38` that have no original twin follow the original values by fixed rules. `surface` =
  card, `surface-elevated` = popover, `primary-muted` = primary at 12% alpha and `info` = primary. `chart-1` to
  `chart-5` = primary, success, warning, destructive and muted-foreground. `border-strong` = border, 6 lightness
  points further from the background.
- The dark shadows, the primary glow and the hero gradient go back to their original values.
- Unchanged from ADR-0006: Inter and JetBrains Mono, the sidebar shell, shadcn new-york, light and dark, dark as the
  default, the toggle and the radius. The CV preview's print colours and categorical colours (seniority badges) stay.

## Consequences

- PRD 0016 supersedes PRD 0006 R-011 and R-012. PRD 0008 R-037's "PRD 0006 / ADR 0006 tokens" becomes "PRD 0016 /
  ADR 0022 tokens".
- When this ADR is accepted, the ADR-0006 header gains "Amended by: ADR-0022".
- One frontend release with no migration and no change to the backend, the CLI or the PDF.
- Components styled while the palette was blue are checked again for contrast. The owner reviews screenshots of both
  themes before merge.

## Non-goals

- The original fonts (DM Sans, Outfit), the 0.625rem radius, the old header layout, or HSL notation in the tokens.
- Any change to the CV PDF theme or to the CV preview's colours.
- A palette chosen per user or released behind a beta flag.
