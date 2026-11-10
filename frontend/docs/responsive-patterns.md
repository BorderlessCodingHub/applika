# Desktop and mobile patterns

How the web app is built for both widths, and what a change must do to keep
both working. This is the checklist; `AGENTS.md` holds the detail for each
area (the section names are given in brackets).

## 1. One breakpoint: `md` (48rem, 768px)

- At or above `md` the app renders the **desktop** layout; below it, the
  **phone** layout. There is no tablet layout and no other breakpoint.
- The width alone decides. Never branch on the user agent, the account or a
  stored preference.
- Every new page or component ships its phone layout below `md`, from its
  own design. Desktop stays as it is unless the change is about desktop.

## 2. How a screen switches

Use exactly one of these per screen.

| Kind of screen                                                        | Switch                                                                  | Why                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Signed-in (behind auth)                                               | `useIsPhone()` in the page, after every hook                            | Rendered after auth, so nothing flashes; hook order never changes |
| Public, static (`/`, `/login`, `/cli`, `/cli/code`, `/cookie-policy`) | CSS: two trees, `md:hidden` and `hidden md:flex` / `hidden md:contents` | The static HTML hydrates as is: no mismatch                       |

**`useIsPhone()`** (`hooks/use-is-phone.ts`) reads
`matchMedia(PHONE_QUERY)` (`"(max-width: 47.99rem)"`); its server snapshot
is `false`. `hooks/use-mobile.ts` is unused and is not the switch.

**Signed-in wrapper shape.** The page keeps its hooks, queries, forms and
mutations, then returns one of two renders:

```tsx
export function XPage() {
  const data = useX(); // every hook first
  const isPhone = useIsPhone(); // then the switch
  return isPhone ? <XScreen {...data} /> : <XDesktopPage {...data} />;
}
```

- The desktop body is renamed (`XDesktopPage`) and left unchanged.
- The phone file holds the designer's presentational `XScreenView` (props
  in, board out) and the wired `XScreen` on the same hooks.
- Pure logic goes to `src/lib` so both widths share it.
- A `FeatureGate` wraps BOTH branches: the phone branch never sends a gated
  request the desktop would not.
- Crossing `md` remounts the page. Autosaved forms send the pending change
  on unmount (`useDebouncedAutosave`); forms with no autosave lose unsaved
  edits, and an open sheet closes.

**Public CSS switch.** One tree per width, each with its own `data-slot`
(`landing-phone` / `landing-desktop`, `sign-in-phone` / `sign-in-desktop`,
…). Wrap the desktop tree in `hidden md:contents`, never `md:block`: a block
wrapper makes a sticky header stick to the wrapper. Shared chrome (the theme
and language pair) is mounted once, outside both trees.

**Phone-only addresses.** `/insights` and `/account` exist only below `md`.
At `md` and up they `router.replace` away (`useLeaveAtDesktop`). Every other
screen keeps one address at both widths.

[Routing; Phone shell → The switch]

## 3. Shells

|               | Desktop (`md` and up)                                                   | Phone (below `md`)                                                            |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Component     | `AppShell` (`components/layout/app-shell.tsx`)                          | `PhoneShell` (`components/layout/phone-shell.tsx`), returned by `AppShell`    |
| Navigation    | Fixed `w-60` rail, `nav` "Primary"                                      | Tab bar on the four tab roots, `nav` "Primary"                                |
| Header        | One `h-14` row: cycle selector, page actions, agenda, theme, language   | None. Back bar on non-tab screens; theme and language live in the Account hub |
| Scrolling     | `<main>` scrolls (`overflow-y-auto`) inside an `h-viewport` root        | **The document scrolls**, never `<main>`                                      |
| Content width | `data-width="full"\|"reading"` (`content-width.ts`, `FullWidthContent`) | Full width; a ported screen owns its padding                                  |
| Account       | `UserMenu` in the rail footer                                           | Avatar → `/account` (the Account hub)                                         |
| Creating      | Page buttons, dialogs, sheets                                           | FAB "Add" (Today, Pipeline) → quick-add sheet                                 |

**Phone shell rules.**

- The root is `relative min-h-viewport overflow-clip`. Never give it a
  height or `overflow-hidden`/`auto`, and never make `<main>` a scroll
  container. Mobile browsers hide their toolbars only when the document
  scrolls.
- The back bar is `sticky top-0 z-30`. The tab bar, the FAB, `.ph-bar` and
  the Application bar are `position: fixed` and add
  `env(safe-area-inset-bottom)` to their offsets.
- The root's `data-reserve` and `data-back-bar` set the document's
  `scroll-padding` in `phone.css`, so a focused control is never hidden
  under the chrome (WCAG 2.4.11).
- To save or restore scroll, read and write `document.scrollingElement`.
  To scroll something into view, use `scrollIntoContainer`
  (`lib/scroll-into-container.ts`), never `Element.scrollIntoView()`.
- `phone-nav.ts` is the one map: tab roots, FAB paths, back-bar labels and
  addresses, and which screens are ported (`PHONE_SCREEN_PATHS` /
  `PHONE_SCREEN_PREFIXES`). Add a route there when its board lands.
- Shell hooks a screen can use: `usePhoneShell()` / `useOptionalPhoneShell()`,
  `<PhoneChromeless />`, `<PhoneTopBarEnd>`, `<PhoneBackHref href />`.
- Known issue: Edge and Chrome on iOS leave fixed elements where their
  hidden bottom toolbar used to be, so a gap shows under the tab bar while
  that toolbar is hidden. The page cannot move fixed elements into that
  area: Edge clips them.

[App shell; Phone shell]

## 4. Styling

**Shared, both widths.**

- Tailwind 4, CSS-first. Every token is in `src/app/globals.css` (`:root`
  light, `.dark` dark, dark by default). Use tokens, never literal colours.
  The palette is pinned by `globals-palette.test.ts` and changes only with an
  ADR.
- shadcn/ui (Radix, `new-york`) in `src/components/ui/`; `cn()` from
  `src/lib/utils.ts`. A new custom `@utility` that competes with a Tailwind
  group is registered in `extendTailwindMerge`.
- Full-viewport boxes use `h-viewport` / `min-h-viewport` /
  `max-h-scrollport`, never `h-screen`, `h-dvh` or `min-h-screen`.
- `font-display` for headings, `font-numeric` for figures.

**Desktop.** Tailwind utilities in the component, shadcn primitives, the
stacking contract below.

**Phone.** The pattern sheet `src/styles/phone.css`:

- Every class is prefixed `ph-` and every selector needs a `ph-` class, so
  no phone rule can match a desktop page (`styles/phone-css.test.ts` pins
  the classes and their values).
- Put `.ph-app` on the phone chrome and on a ported screen's root.
- Port a board's classes whole: every class, size and word, never a subset.
  A board's own classes take one prefix per board (`ph-au-`, `ph-cat-`,
  `ph-cv-`, …).
- No new tokens: phone CSS reads the `globals.css` tokens
  (`--destructive-text` is the one it added).

**Stacking contract (both widths).** `z-30` in-column sticky chrome (the
header, the phone back bar, `CvEditorFooter`); `z-40` fixed page chrome
(`LandingHeader`, `CookieConsent`, the tab bar, the FAB, `.ph-bar`); `z-50`
the Radix portal layer (dialogs, sheets, menus, toasts). A shell root is
`relative` with no `z-*`, `isolate`, `transform` or `filter`.

[UI Components; Phone shell → The pattern sheet]

## 5. Components

| Need                           | Desktop                                 | Phone                                                                           |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| Confirm a destructive action   | `AlertDialog` / `ConfirmDialog`         | `PhoneConfirmSheet` (an `alertdialog` sheet, Cancel first and focused)          |
| A form or picker in an overlay | `Sheet` (`size` preset) or `Dialog`     | `PhoneSheet` / `PhoneSheetFrame` (closes itself when the width crosses `md`)    |
| A refused mutation             | Sonner toast                            | Said once, inside the sheet (`toastError: !isPhone`)                            |
| Loading, empty, failed         | Skeletons, empty states, `role="alert"` | `PhoneLoadable` / `fromQuery`, `PhoneEmptyCard`, `PhoneAlertCard`               |
| Paging                         | Table pager                             | `PhonePager` (ends `aria-disabled`, focus stays)                                |
| Choices                        | Radix `RadioGroup`, `Select`, chips     | `PhoneOption`, `PhoneCheckOption`, `PhoneSegmented`, `PhoneChip`, `PhoneSwitch` |
| Lists                          | Tables, cards                           | `PhoneGroup` / rows, cards from the board                                       |
| Bottom actions                 | Footer row in the page                  | `PhoneActionBar` (`.ph-bar`), with a bottom reservation                         |

Phone primitives live in `components/phone/` and take their words by props.

Shared rules at both widths:

- Dates are `DatePickerInput` (a day) or `MonthYearInput` (a CV month and
  year). Never `<input type="date">`.
- Forms are React Hook Form with Zod. Watch a field with `useWatch`.
- A disabled control that must keep focus uses `aria-disabled`, not
  `disabled`.

## 6. Touch targets, safe areas, input

- **44 × 44 px** minimum box for every control on a phone screen. The
  visible shape can be smaller: use `.ph-hit`, or the `::before` shape of
  `.ph-btn.ph-sm`, `.ph-chip`, `.ph-seg > *`, `.ph-switch`.
- `viewportFit: "cover"`: fixed phone chrome adds
  `env(safe-area-inset-bottom)`; a bottom block adds it to its padding
  (`.ph-safe-bottom`).
- Ported screens reserve the space under fixed chrome themselves:
  `170px` + inset with tab bar and FAB, `110px` + inset with the tab bar,
  `120px` + inset above an action bar.
- Numeric fields use `inputMode="numeric"`.
- No sideways scroll at 320px, 360px or 390px, in both languages. Long
  words wrap or truncate inside their own box.

## 7. Words, theme and accessibility (both widths)

- All JSX text comes from `src/i18n/messages/en.json` and `pt-BR.json`
  (`react/jsx-no-literals` is an error). Check Portuguese at phone width:
  it runs longer.
- Light and dark at both widths. Below `md` the theme and language switches
  are in the Account hub (signed in) or the screen's top bar (public).
- Each tree's heading, landmark and accessible names match its board. Mark
  the active item with `aria-current="page"` only.
- Respect `prefers-reduced-motion`.

## 8. Tests

**Unit (vitest, jsdom).**

- Tests render desktop by default (`matchMedia` answers `false`).
  `mockPhoneViewport()` (`src/test/phone.ts`) switches one test to the phone;
  `setPhone(false)` crosses `md`.
- `renderPhoneScreen(path, page)` renders a route in the phone shell;
  `renderPhonePage(page)` renders a page alone; `renderShellAcrossMd` for
  crossing tests.
- A CSS-switched screen renders both trees in jsdom: scope every query to
  the tree's `data-slot`.
- jsdom lays nothing out: assert geometry in E2E, not here.
- Assert on words, roles, `data-slot` / `data-action` hooks and
  `aria-current`, never on classes (except the `phone-css.test.ts` pins).

**E2E (Playwright, the real stack).**

- One Desktop Chrome project; a phone case sets `PHONE` (390 × 844) itself.
- `expectPhoneTargets(page, atLeast, exclude?)`: every control 44 × 44.
- `expectNoSidewaysScroll(page)`; `expectDocumentScrolls(page)` on
  signed-in phone screens.
- Phone screens get a case in `e2e/phone.spec.ts`; public headers in
  `e2e/headers.spec.ts`.

## 9. Checklist for any UI change

1. Does it render below `md`? If it is new, it has a phone layout from its
   own design; if it changes an existing screen, both trees or both branches
   change.
2. Signed-in: `useIsPhone()` after every hook, desktop body untouched.
   Public: two CSS trees with their own `data-slot`.
3. Phone styles in `phone.css` with `ph-` classes; no new tokens; no class
   that could match a desktop page.
4. 44px targets, safe-area insets, bottom reservation under fixed chrome,
   document scroll kept, no sideways scroll at 320px.
5. Phone overlays are `PhoneSheet` / `PhoneConfirmSheet`; a refusal is said
   once.
6. Both languages, both themes, at both widths.
7. Unit tests for both branches (`mockPhoneViewport`); an E2E case for a new
   phone screen.
8. Update `AGENTS.md` and this file when a pattern changes.
