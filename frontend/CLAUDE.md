# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it when the project changes in ways that affect how to work here.**

Update when:

- A new UI pattern or component convention is established (e.g., a new reusable primitive)
- A new hook or service is added with non-obvious usage
- Authentication or token refresh behavior changes
- New environment variables become required
- The routing structure changes significantly
- A new form/validation convention replaces an existing one

Do NOT add:

- Implementation details already visible in the code
- Ephemeral task notes or in-progress work
- Anything already in git history or comments

---

## Commands

```bash
# Install dependencies
pnpm install

# Start dev server on port 8080
pnpm dev

# Production build (static export)
pnpm build

# Serve production build locally
pnpm start

# Unit / component tests (vitest, jsdom)
pnpm test
pnpm test:watch
pnpm test src/path/to/file.test.ts   # a single file

# Lint / format / types
pnpm lint
pnpm lint-fix
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
pnpm typecheck       # tsc --noEmit
```

### The gate

A PR to `develop` is ready only when the whole chain is green
(`.claude/rules/quality-gates.md`):

```bash
pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build
```

`pnpm lint` currently emits warnings on pre-existing files: `application-form-
sheet.tsx` (a `useMemo` missing dependency, and React Compiler skipping
memoization because `react-hook-form`'s `watch()` cannot be memoized safely)
and `company-select.tsx` (a `useEffect` missing dependency). Warnings do not
fail the gate; errors do. Do not add new ones — in particular, watch a form
field with `useWatch` (from `react-hook-form`), never `form.watch()`, in any
new form (see the timeline and finalize forms below for the pattern).

### E2E

Playwright drives the REAL stack — the built API image, the built static
frontend behind nginx, a real Postgres migrated with `alembic upgrade head` and
a real Redis. Nothing is mocked, and there is no `webServer` block.

```bash
../scripts/e2e.sh                          # full run: up -> seed -> test -> down
../scripts/e2e.sh e2e/smoke.spec.ts        # args are forwarded to `playwright test`
KEEP_STACK=1 ../scripts/e2e.sh             # leave the stack up to debug
```

`pnpm e2e` on its own will NOT work: `e2e/support/auth.ts` needs the `E2E_*`
variables that `scripts/e2e.sh` exports after seeding the real users. The suite
runs serially (`workers: 1`) against one shared real database, so specs must be
read-only or clean up after themselves.

**The job board in E2E (KODI-049).** `docker-compose.e2e.yml` also runs
`worker` and `scheduler` (`applika-e2e-worker`/`-scheduler`, the
`applika-e2e-api` image with `pull_policy: never`, the commands of ADR-0016,
`depends_on: api: service_healthy`). They share the API's env through the
`x-api-environment` anchor, which sets `JOBS_SCRAPERS: fixture` and
`JOBS_FIXTURE_PATH: /fixtures/postings.json`
(`./backend/tests/fixtures/jobs:/fixtures:ro`): the fixture scraper serves
every enabled source from that file, so the suite never reaches himalayas.app
or remoteok.com — and never navigate a job's `job_url`. `JOBS_INGEST_CRON` is
`0 0 1 1 *` so the scheduler never fires during a run; the only ingest is the
admin's "Run now". `e2e/jobs.spec.ts` (serial) runs it and polls by reload
until both sources read OK, turns RemoteOK off (and proves the next run skips
it by its unchanged `last_run_at`) and back on, then drives the user half:
fits (the worker recomputes them after the master CV is seeded, so poll),
search + source filter in the URL, a saved search, the job's fit, Start
application with "Tailor by keywords", the reorder under "Show changes", the
CV fit panel, Finish → "Applied", start again → "Open application", dismiss
and restore — plus no sideways scroll at 375px with a long CV name on the job
pages. It wipes the seeded user's drafts, applications, saved searches and
master CVs before it starts, and `afterAll` restores dismissals and turns
every source back on.

---

## Architecture

This is a **Next.js 16 App Router** frontend (static export) for Applika.dev — a job application tracker. It communicates with a FastAPI backend running on port 8000.

### Routing

Route groups control access:

- `src/app/(public)/` — Unauthenticated pages (home, login)
- `src/app/(protected)/` — Auth-guarded pages (dashboard, applications, profile, admin)

Each protected route has a thin `page.tsx` shell that renders a `*-page.tsx` component containing the actual logic.

`/login` lives at `src/app/login/`, OUTSIDE the `(public)` group, so it renders no landing header or footer. The URL is unchanged.

**Search params under static export.** `output: "export"` FAILS THE BUILD on a
page that reads `useSearchParams()` outside a `<Suspense>` boundary. The shell
`page.tsx` owns the boundary and the `*-page.tsx` component reads the params —
see `src/app/(protected)/cvs/editor/`, which is the precedent for any future
`?query=` route.

Master CV routes (KODI-002):

| Route             | Shell                             | Component                            |
| ----------------- | --------------------------------- | ------------------------------------ |
| `/cvs`            | `(protected)/cvs/page.tsx`        | `cvs-page.tsx` — the gallery, delete |
| `/cvs/new`        | `(protected)/cvs/new/page.tsx`    | `new-cv-page.tsx` — create           |
| `/cvs/editor?id=` | `(protected)/cvs/editor/page.tsx` | `cv-editor-page.tsx` — edit          |

Application CV copy route (KODI-003):

| Route                  | Shell                                  | Component                                     |
| ---------------------- | -------------------------------------- | --------------------------------------------- |
| `/applications/cv?id=` | `(protected)/applications/cv/page.tsx` | `application-cv-page.tsx` — picker AND editor |

New application with CV, i.e. a draft (PRD 0010, KODI-033):

| Route                                 | Shell                                           | Component                                                         |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `/applications/new-with-cv?id=&step=` | `(protected)/applications/new-with-cv/page.tsx` | `new-with-cv-page.tsx` — both steps, owns both forms and autosave |

Job board (PRD 0012, KODI-048) — see **Job board** below:

| Route            | Shell                            | Component                                         |
| ---------------- | -------------------------------- | ------------------------------------------------- |
| `/jobs`          | `(protected)/jobs/page.tsx`      | `jobs-page.tsx` — list, filters in the URL, marks |
| `/jobs/view?id=` | `(protected)/jobs/view/page.tsx` | `job-view-page.tsx` — description, fit per CV     |

`?id=` is the APPLICATION's id, never the copy's. There is no nav entry: the
route is reached from the CV link on an application row, and
`e2e/shell-responsive.spec.ts` pins `PRIMARY_NAV` at eight entries
(Jobs right after Applications since KODI-048).

**`/applications/cv?id=` is the reading column while it shows the picker, and
full width only once it shows the editor (KODI-017)** — see **App shell**
below for the mechanism. `/cvs/new` and `/cvs/editor` stay full width in every
state, path-based, unchanged.

**`/applications?focus=<application_id>` (R-011, KODI-038)** is how the
agenda card's note-row link opens the applications list with one row already
expanded. `applications-page.tsx` follows the same shell-owns-the-Suspense-
boundary/one-shot-read/`replaceState` shape as `cvs/editor` and
`profile-page.tsx`: `?focus=` is read once via a lazy `useState` initializer,
never an effect. Whether the id is IN the list is a value DERIVED every
render from `useApplications(selectedCycleId).filtered` — not stored in
state and not resolved from an effect — because `ApplicationItem`'s
`defaultExpanded` (`application-item.tsx`) only seeds that row's OWN initial
`isExpanded` on mount; a prop update to an already-mounted row would not
reopen it, so the match has to be known on the exact render that first mounts
the row (the one where `isLoading` flips to `false`), one render earlier than
any state set from an effect could deliver it. **`focusRowId` also carries a
`focusDone` guard**, set once the scroll+focus effect below actually runs:
without it, a row that gets hidden and shown again — a search/filter change,
a cycle switch, a background refetch — would recompute `focusRowId` as truthy
forever and re-steal scroll/focus on every remount. A found id drives a
`requestAnimationFrame`-guarded scroll of its `<li>` to the top of `<main>`
through `scrollIntoContainer` (`src/lib/scroll-into-container.ts`; `"auto"`
under `prefers-reduced-motion: reduce`) — **never `Element.scrollIntoView()`**,
which also scrolls the shell's `overflow-hidden` root once `<main>` runs out
of room and shifts the whole layout up, sidebar included, over a blank band —
gated (in the
effect's condition AND its dependency array) on `useApplications`'s own
`supports` becoming truthy — `ApplicationItem` returns `null` until
`useSupports()` resolves, so scheduling the `requestAnimationFrame` before
that is settled would find no `<article>` and, with `focusRowId` as the only
dependency, never retry; gating on `supports` instead makes the effect
RE-RUN the moment it arrives. This is the same "wait a frame, then re-query
by a stable data attribute" pattern `cv-removed-row.tsx`/`cv-changed-marker.tsx`
use, just re-armed by a real dependency rather than a one-shot deadline. A
separate, ref-guarded effect (Strict Mode's double-invoke included) fires the
SIDE EFFECTS exactly once: an id absent from the list — e.g. it belongs to an
archived cycle — shows the one-off notice "This application is not in the
cycle you are viewing." (`toast.info`, `richColors: false`, a fixed `id` so
Strict Mode cannot double it); either branch then clears the query string
with `window.history.replaceState(null, "", "/applications")` — never
`router.replace()`, a no-op here for the same reason `profile-page.tsx`
documents. **This effect also waits out `isError`**: a load FAILURE is
`isLoading: false` with an empty `filtered`, which without the guard reads
identically to "the id isn't in this list" and would show the false notice
on every failed load instead of leaving the resolution for a successful
retry.

### Providers

Providers are split into two layers:

- **`RootProviders`** (`src/components/layout/root-providers.tsx`) — wraps the entire app in the root layout. Includes QueryClientProvider, ThemeProvider, AuthProvider, TooltipProvider, and Sonner.
- **`ProtectedProviders`** (`src/components/layout/protected-providers.tsx`) — wraps protected routes only. Adds a nested AuthProvider for protected-scope auth state.

The `(protected)/layout.tsx` wraps children with `ProtectedProviders` + `SupportsProvider` + `CycleProvider`, redirects unauthenticated users to `/login`, and renders everything inside `<AppShell>` (see **App shell** below).

### Service Layer & DI

All HTTP calls go through typed service classes in `src/services/implementations/`. A singleton container at `src/services/services.ts` exposes them:

```typescript
import { services } from "@/services/services";
services.applications.getApplications();
services.companies.search(name);
```

The Axios instance in `src/lib/api-client.ts` handles cookie-based auth with `withCredentials: true`.

### Auth & Token Refresh

Authentication uses HTTP-only JWT cookies. Token refresh is handled via **polling in AuthContext** (not via Axios interceptor):

- Polls `services.auth.refresh()` using React Query's `refetchInterval`
- **10-minute interval** when authenticated
- **30-second interval** on failure (for reconnection)
- Polls in background (`refetchIntervalInBackground: true`)

User profile is fetched separately via `useUserProfile()` only after auth succeeds.

**A 429 on either query is temporary, never a sign-out (KODI-041, R-019/R-024).**
The backend rate-limiter (KODI-039) answers a refused request with `429` +
`Retry-After` (+ `X-RateLimit-*`, all CORS-exposed). `src/lib/rate-limit.ts` is
the single place that reads that shape — `isRateLimited(error)` (an axios
429), `retryAfterMs(error)` (the `retry-after` header, axios lowercases it, in
seconds x 1000, clamped >= 1000ms, falling back to 60000ms when missing/NaN)
and `rateLimitNotice(error)` (the 429's own `detail`, or `null`). It lives
outside `api-client.ts` for the same circular-import reason `blob-error.ts`
does. Both `AuthContext`'s refresh query and `useUserProfile()` pass
`retry: (n, e) => isRateLimited(e)` / `retryDelay: (n, e) => retryAfterMs(e)`
— a 429 is retried forever on the server's own wait and NEVER settles the
query into `isError`, so a cached session stays `isAuthenticated` and a cold
load stays `isLoading` (never redirected to `/login` by
`(protected)/layout.tsx`) instead of being signed out. Any other error keeps
today's behaviour: no retry, straight to `isError`. Do not change the 401
interceptor in `api-client.ts` for this — it is unrelated to the refresh
query's own retry.

### State Management

- **Server state**: TanStack React Query with a 5-minute stale time and
  `retry: false` — **except** the auth refresh query and `useUserProfile()`,
  which retry a 429 only (see above)
- **Auth state**: `AuthContext` (wraps the entire app via `RootProviders`)
- **Supports data**: `SupportsContext` — shared lookup data (platforms only, since PRD 0008/ADR 0012: step and feedback definitions are gone, R-021) available via `useSupports()`
- **Feature state**: custom hooks in `src/hooks/` (e.g., `useApplications`, `useTimeline`)

Mutations always call `queryClient.invalidateQueries()` on success and show a
`sonner` toast on error. A mutation with a fixed error message shows the 429's
own retry text instead, when there is one: `toast.error(rateLimitNotice(error)
?? "Failed to …")` (KODI-041, R-025) — every toast already showing
`getApiError(error)` (which returns the `detail` unconditionally) needs no
change, since a 429's `detail` already flows through it.

### Forms

All forms use **React Hook Form + Zod**:

```typescript
const schema = z.object({ field: z.string().min(1, "Required") });
type FormValues = z.infer<typeof schema>;
const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { ... } });
```

- Show inline error messages below each field using `form.formState.errors.field?.message`
- Highlight invalid fields with `cn(error && "border-destructive focus-visible:ring-destructive")`
- Trigger validation on Select/custom inputs with `form.setValue("field", value, { shouldValidate: true })`
- Watch a discriminated-union form field (e.g. `event_type`, `outcome`) with
  `useWatch` from `react-hook-form`, never `form.watch()` — see the lint note
  above and `### Application Timeline` below for the pattern.

### Master CVs (`src/components/base-cvs/`)

The master CV surface is presentational components plus one schema module, and
the pages wire data to them:

- `types.ts` is the SINGLE vocabulary: `BaseCv` (wire shape), `CvFormValues`
  (form shape), the item types and `BASE_CVS_MAX`. `src/services/types/base-cv.ts`
  RE-EXPORTS them rather than forking a second set.
- `base-cv-schema.ts` owns the zod schema and the only two translations between
  the two shapes: `baseCvToFormValues()` (wire to form — `phone: null` becomes
  `""` so inputs stay controlled) and `toBaseCvPayload()` (form to wire — `""`
  becomes `null`, strings are trimmed, blank rows are dropped, and `id`,
  `created_at` and `updated_at` are never sent).
- `base-cv-editor.tsx` renders the `<form>` itself and takes a
  `UseFormReturn<CvFormValues>`; the page owns the schema, the defaults and the
  submit. It MINTS section-item ids via its `newItemId` prop. Section item ids
  are CLIENT-generated and preserved round-trip — never regenerate them on load.
- `base-cv-list.tsx` owns all four list states and the delete confirmation.
- **`BaseCvList`/`CvCard` carry an optional `selection` variant (KODI-017)**,
  which is how `tailored-cvs/base-cv-picker.tsx` reuses them instead of
  forking them. Absent, both render EXACTLY as they do on `/cvs` today — the
  prop only ADDS behaviour, it never changes the unselected render.
  `BaseCvListSelection` (`{ value, onValueChange, describedBy? }`) mints ONE
  group name (`useId`) and hands each tile a `CvCardSelection` (`{ name,
checked, onSelect, describedBy? }`). `CvCard` turns that into a native
  `<input type="radio">` — not Radix `RadioGroup`: its roving-focus root is
  itself a tab stop and would steal focus from the tile's own Edit/Delete/
  Download buttons, and a `radiogroup` may only contain radios, which real
  buttons are not. The radio's LABEL is the CV's name (so the accessible name
  is exactly the visible one), stretched over the tile with
  `before:absolute before:inset-0` so clicking anywhere selects it, while the
  action row stays `relative` and paints above that pseudo-element — no
  interactive control is ever nested inside another. Selected state is a
  filled radio dot AND a `border-primary`/`ring-primary` outline — never
  colour alone. The radio disables while `isDeleting` is true on that tile.
- The cap is told on screen by `NewCvCard`, whose default `BASE_CV_LIMIT_REASON`
  contains the words "the limit is three". Do NOT pass an API message as
  `reason`: the server's `detail` belongs in the 409 toast, and overriding the
  default would take those words off the screen.
- The typeset document is **leaves plus ONE container**.
  `cv-document-blocks.tsx` owns every fragment of it (`CvIdentityHeader`,
  `CvSectionHeading`, `CvExperienceEntry`, …), the pure helpers
  (`getPopulatedCvSections`, `formatCvDatePeriod`, `skillCategoryHeading`,
  `educationDegreeLine`, `visibleSkillCategories`, `visibleEducation`) and
  `buildCvDocumentBlocks(cv)`. `cv-document.tsx` is now only the BARREL that
  re-exports that vocabulary — the continuous `CvDocument` renderer was removed
  with KODI-008 once nothing rendered it, because the whole pinned parity table
  was then asserting markup no user could see. There is one container,
  `CvDocumentPreview`, and the table runs against it.
- Every leaf deliberately uses raw `neutral-*`/`blue-700` utilities instead of
  semantic tokens: it is a print artefact that must look identical in light and
  dark mode. It is a PREVIEW of the content, never of the page — see the PDF
  export below. The one exception is the PREVIEW CHROME outside the white
  sheet (the page indicator, the overflow note), which is app UI and uses
  `text-muted-foreground` precisely so it cannot be mistaken for a folio the
  PDF prints.
- `CV_DOCUMENT_EXPORT_ID` lands on `CvPageStack`'s `<article>` — the element
  that holds the ordered LIST of sheets, never one of the sheets: a multi-page
  document's export root cannot be one of its pages. Still exactly one such
  node per mounted document. Nothing reads it today and nothing new should.

**The live preview is real A4 pagination (KODI-008).** The owner: "if possible,
make the preview during CV creation create pages if the document become too
large, use A4 dimensions". Three files, one seam:

- `cv-page-sheet.tsx` owns the A4 geometry at 96dpi (`CV_PAGE_WIDTH_PX`,
  `CV_PAGE_HEIGHT_PX`, `CV_PAGE_PADDING_PX`, `CV_PAGE_CONTENT_HEIGHT_PX`), the
  words (`cvPageIndicator`, `cvPageIndicatorLabel`, `CV_PAGE_OVERFLOW_NOTE`,
  `cvPreviewPageCount`), the `CvPageLayout` contract and the presentational
  `CvPageStack` / `CvPageSheet`. Pure: props in, markup out.
- `use-cv-page-flow.ts` is the only thing that measures. `distributeCvBlocks`
  is PURE and takes a height lookup, which is the only way the arithmetic can
  be tested honestly — **jsdom reports every height as zero**. The hook reads
  `offsetHeight` (never `getBoundingClientRect().height`: the sheet is inside a
  `transform: scale()`) IN PLACE, in a layout effect, with no off-screen
  measuring container — one would duplicate the CV's text in the DOM and, if
  absolutely positioned, stretch `<html>` and regress KODI-006's AC7.
- **The no-measurement path is a contract, not a stopgap.** jsdom, the
  static-export prerender and the first paint all render `singleCvPage()`: ONE
  sheet holding the complete document, indicator `1 / 1`. Never replace it with
  something that renders nothing or N empty sheets.
- A sheet is created only when a block is assigned to it. That is the whole of
  "a CV that fits renders exactly one sheet, with no stray empty second page".
- The break unit is the ATOM, and an experience entry's bullet `<ul>` is inside
  its atom — so "never mid-bullet" and "never mid-entry" are one statement.
  `keepWithNext` (section headings only) moves a heading with the block after
  it, **guarded** so a pair too tall for any sheet places the heading and lets
  the entry fall through instead of opening sheets for ever.
- An atom taller than A4 gets its own sheet, `data-overflowing="true"`, grown to
  its own height and shown WHOLE. Nothing is ever clipped.
- The `scale()` is applied PER SHEET inside a fixed-size viewport, never to the
  stack, so the 11px page indicator stays 11px at any zoom.
- Assert on `[data-slot="cv-page"]`, `[data-cv-block]`, `[data-overflowing]`
  and the WORDS — never on the classes.
- The page-count live region is `aria-live="polite" aria-atomic="true"` with
  **no `role="status"`**: the CV copy editor's read-only banner is already this
  screen's one `status`, and a second breaks every `getByRole("status")`
  locator in the suite.
- **The preview pane names no height of its own.** The EDITOR bounds the
  column — `md:sticky md:top-0 md:flex md:max-h-editor-scrollport md:flex-col`
  — and `CvDocumentPreview` fills its share through `md:min-h-0 md:flex-1`
  passed in `className`. Do not put a `max-h` back on the preview. It used to
  carry
  `calc(100dvh - var(--cookie-notice-height,0px) - 12rem)` and that `12rem`
  was a lump with three unrelated things in it: the shell header that `100dvh`
  wrongly counts (the pane lives in `main`, not in the viewport), a phantom
  `md:top-20` sticky offset, and the aside's own label and caption. KODI-009
  measured the result at 720px — the first sheet 104px below the top of the
  scrollport at every scroll position, which is the gap the owner reported.
  `max-h-editor-scrollport` replaces the first two; flexbox replaces the third.
- **`CvSectionCard` has no header action slot, and its whole header toggles.**
  The owner, KODI-009: "remove the button to insert a new link/category/etc
  from the category header and put inside the colapsable section, preferable
  bellow from the last item added". Every repeatable section's add control now
  renders INSIDE `CollapsibleContent`, directly under the last row (under the
  empty hint when there is none) and above the section's error `footer`. Two
  consequences are the ask, not a defect: a COLLAPSED section exposes no add
  control at all — do not put a duplicate back in the header — and the
  auto-expand-on-invalid-submit is what keeps the form operable, since a
  collapsed section now hides its error line too. With nothing competing for
  the header, the trigger is stretched over it with `after:absolute
after:inset-0` against a `relative` header (`data-slot="cv-section-header"`).
  That is deliberately NOT a bigger `<button>`: the accessible name stays
  EXACTLY the title — every locator matches it exactly — the description stays
  a real `<p>`, and the focus indicator is an inset `outline` because the
  card's `overflow-hidden` would clip a `ring`. The header row is
  `items-center`, so the chevron sits on the centre of the whole two-line
  block ("align the chevron icons to the center vercially of the component").
- **The preview's page breaks do NOT match the PDF's**, and the owner accepted
  that: Typst owns the real layout. `CV_PDF_LAYOUT_NOTICE` therefore stays
  exactly where and as it is. Now that the preview LOOKS like paginated A4 that
  notice does MORE work, not less.

**Skills are CATEGORIES, and education is a section (KODI-006).** The owner:
"skills isn't simply a section where i put "tags" or just "keywords" it's a
section where i can create a category and inside this caregory add keywords".

- `CvSkillCategory` is `{ id, category, keywords: string[] }` and
  `CvEducation` is `{ id, institution, degree, area?, start, end? }`. There is
  no `skills: string[]` back-compat: the column never existed on any database.
- `CvSkillsSection` is the categorised editor (a `CvRepeatableSection` of
  categories, each wrapping a `CvKeywordsInput`). Keyword reorder is
  KEYBOARD-ONLY (`Alt`+arrow) — a wrapping chip row has no room for two
  buttons per chip — and the keys are told in words once per field via
  `CV_KEYWORDS_HINT` and per chip via `aria-keyshortcuts`. The keywords block
  is deliberately NOT a `CvField`: that label wraps its child, and the first
  labelable node in a keyword field is a chip button the label would wrongly
  name.
- **The preview and the server's PDF are two renderers of ONE document.** Four
  things are pinned on both sides and must be changed on both or neither
  (`backend/app/application/services/cv_rendering/mapper.py`): the section
  order (`CV_DOCUMENT_SECTIONS` / `SECTION_ORDER` — summary, experience,
  languages, skills, projects, education, certifications); the keyword
  separator (`CV_KEYWORD_SEPARATOR` / `SKILLS_SEPARATOR`, U+00B7 with a space
  each side, NEVER the header's U+2022); the trailing colon on a category
  (`skillCategoryHeading` / `_skill_category_label`, never doubled); and the
  education degree phrase (`CV_EDUCATION_DEGREE_JOINER` / RenderCV's
  `DEGREE_WITH_AREA`, `" in "`). A project renders on THREE lines — name, then
  its link (the raw URL when `link_label` is blank), then the description.
- Languages render as a three-column grid filled from the LEFT at any count,
  name then level in words, with no separator dot and no proficiency meter.
  One or two languages sit left STRUCTURALLY, not by a tuned justification.
- Client validation stays STRICTER than the server's for these two sections: a
  category with keywords but no name, and a qualification missing its
  institution or degree, are section-level errors here (the API declares all
  three `min_length=1`), and `BASE_CV_MAX` carries their length ceilings at or
  under the server's. **The older sections in `base-cv-schema.ts` carry
  required-ness but NO length ceiling** — only `TAILORED_CV_MAX` is complete —
  so an over-long link or bullet still reaches the server on the master CV
  route. That is a known gap, not a pattern to copy: `getApiError` renders
  FastAPI's 422 `detail` ARRAY into the toast as garbage, so a reachable 422 is
  the bug, not the toast.
- The section error is reported at SECTION level (rows have no inline slot) but
  it is ATTACHED to the offending control: `CvSkillsSection` puts
  `aria-invalid`/`aria-describedby` on the empty _Category_ input of the row
  actually at fault, never on the keyword entry the user filled in correctly,
  and never on a valid sibling row.

**A CV date is a month and a year (KODI-007).** The owner: "instead of a bare
text input it needs to ask when started and when finished (finish is optional,
when empty is counted as Present), it's a date input but only for month and
year "MM/yyyy" for both start and finish".

- `CvExperience` and `CvEducation` BOTH carry `start: string` (required) and
  `end?: string | null` (optional). There is no `period` field on either any
  more. The wire names are exactly **`start` and `end`** — never `start_date` /
  `end_date`, which is what the server's renderer calls them internally.
- The value is ISO `YYYY-MM` in the form, in store and on the wire; `MM/yyyy`
  is input and display ONLY. `src/lib/month-year.ts` is the single
  implementation of both directions and of the mask.
- An absent, `null` or empty `end` means the entry is CURRENT. Reading tolerates
  both `null` and a missing key; writing OMITS the key (`optionalText` yields
  `undefined`), so `""` never reaches the API.
- `formatCvDatePeriod` in `cv-document-blocks.tsx` is the FIFTH pinned twin of the
  server renderer, beside the section order, the keyword separator, the category
  colon and the degree joiner: `02/2023 - 02/2024`, or `02/2024 - present` with
  no finish. The separator is a spaced ASCII hyphen-minus (the theme's
  `date_range`, not RenderCV's en-dash default) and `present` is lowercase.
  A start that is not yet a real `YYYY-MM` prints NOTHING, so a half-typed row
  never shows a dangling separator in the live preview.
- Client validation mirrors the server's rule exactly — the format
  `^\d{4}-(0[1-9]|1[0-2])$` and "a finish is never earlier than its start" —
  and invents NO year range. Equal, not stricter, is what puts the 422 out of
  reach.

**The PDF is rendered on the SERVER** (`docs/applika/adr/0011`, Accepted):
RenderCV/Typst, one fixed theme named `applika`, no theme parameter, no user
choice. **Never add `html2pdf`, a `cv-pdf.ts` or any client-side rasteriser.**
So is its Markdown twin (KODI-017 part 3) — RenderCV's own Markdown renderer,
the same reason: no client-side Markdown generation either.

- `export-cv-button.tsx` is the whole affordance and is PRESENTATIONAL: no hook,
  no service, no axios. It takes `onExport` and `isExporting` and it has NO
  `disabled` prop — only a render already in flight locks it, so no caller can
  take the download away from a finalized or archived CV copy, or from a copy
  whose master CV was deleted. Since KODI-017 part 3 it ALSO takes the optional
  `onExportMarkdown`/`isExportingMarkdown` pair: given, a second "Download
  Markdown" button renders beside "Download PDF", same pending/live-region
  pattern, same "no `disabled` prop but the render in flight" rule. Every call
  site the slice names passes both: `/cvs` tiles (`CvCard`, itself threaded
  through `BaseCvList`/`BaseCvPicker`), `/cvs/editor?id=` and the copy editor
  (`/applications/cv?id=`, both read-write and read-only).
- It mounts in the editors' `actions` slot: `/cvs/editor?id=` (never `/cvs/new`
  — the server typesets the STORED CV, so there is nothing to render until it
  has been saved once) and `/applications/cv?id=` in BOTH modes.
- `layout?: "inline" | "compact"` — `"inline"` (the default) is the editor
  footer: a full-size button beside the VISIBLE layout notice. `"compact"` is a
  gallery tile: `size="sm"`, no notice, and the wrapper is `display: contents`
  so the button is a direct flex item of the tile's own footer row.
- `cvName?: string` — names the CV in the accessible name, the way the
  gallery's `Edit {name}` and `Delete {name}` do. It is COMPOSED as
  `` `${label} ${cvName}` ``, so a caller cannot break WCAG 2.5.3 by passing an
  unrelated string, and the visible text stays the plain label.
- **The layout notice (`CV_PDF_LAYOUT_NOTICE` in `base-cvs/types.ts`) is said
  where a PREVIEW is rendered, and only there.** It qualifies a render the user
  could mistake for the PDF; a surface with no render has nothing for it to
  qualify. Per surface:
  - `/cvs` (the gallery) — **not said at all.** The tiles render no preview.
    It used to reach them `sr-only` through `layout="compact"`'s
    `aria-describedby`, which was the worst of both: a screen reader heard it
    once per tile, up to three times, about a document the page never shows,
    while a sighted user never saw it. `layout="compact"` now renders no `<p>`
    and sets no `aria-describedby`.
  - `/cvs/new` — said **once**, the `<figcaption>`. There is no export button
    on this route, so there is no second copy: that caption is the only thing
    on screen saying it, which is why `max-h-editor-scrollport` exists.
  - `/cvs/editor?id=` and `/applications/cv?id=` (both modes) — said **twice**:
    the `<figcaption>`, plus the button's own visible copy wired with
    `aria-describedby`.

  Do NOT add another at a call site, and do NOT put one back on a surface that
  renders no preview. The WORDING is fixed and mirrored verbatim in
  `e2e/cv-builder.spec.ts`; changing WHERE it is said is not changing WHAT it
  says. Assert the WORDS.

- The visible label does not change while the server renders (1-3s): the icon
  swaps to a spinner and `CV_PDF_EXPORT_PENDING` fills an always-mounted
  `aria-live` region, so the `"Download PDF"` locator stays stable.
- `useExportBaseCvPdf` / `useExportTailoredCvPdf` own the request. They
  invalidate nothing (a download changes no row) and raise no SUCCESS toast —
  the browser and the live region already say it — which is the one place the
  mutation convention above is deliberately not followed.
- `src/lib/pdf-download.ts` owns `downloadBlob` (object URL on a synthetic
  `<a download>`, revoked on a LATER tick) and `cvPdfFilename`, which mirrors
  the server's slug rule character for character. The server names the file via
  `Content-Disposition` (readable cross-origin, `expose_headers`); the slug is
  only the fallback for a header that did not survive the trip.
- **`getApiError` cannot read a blob error.** With `responseType: "blob"` axios
  hands back a 404/500 body as a `Blob`, so `detail` is `undefined` and the
  toast would say "undefined". Use `getBlobApiError` from `src/lib/blob-error.ts`
  for any blob request. It lives outside `api-client.ts` on purpose: that module
  imports the service container, so a service cannot import back from it.

### Tailored CVs (`src/components/tailored-cvs/`)

A **tailored CV** is an application's own COPY of a master CV, edited for that
job. The vocabulary is deliberate and worth keeping straight:

- a **master CV** (`base-cvs/`, `/base-cvs`) belongs to the USER, and there are
  at most three;
- a **CV copy** (`tailored-cvs/`, `/applications/{id}/cv`) belongs to an
  APPLICATION, and there is at most one;
- the copy is a full snapshot. Editing or deleting the master CV never touches
  it. Deleting the master only clears the copy's `base_cv_id`, and the editor
  then shows the words `source CV deleted` (`TAILORED_CV_SOURCE_DELETED`).

**There is no default master CV.** The user picks one per application, every
time. `BaseCvPicker` is the only way to create a copy, and its one shortcut is
`preselectedBaseCvId(options)`: with exactly ONE master CV it returns that id
and the picker reports it through `onValueChange`, so the PAGE stays the single
source of truth for the selection. With none, the picker becomes an invitation
to write a master CV first.

**The picker IS the `/cvs` gallery (KODI-017).** The owner: "basically just use
the same components there in here with the same buttons to delete, edit and
download." `BaseCvPicker` is rebuilt on `BaseCvList`/`CvCard` rather than its
own markup — no more `BaseCvOption`, no more skill-CATEGORY badges or a hidden
"+N": the tiles show KEYWORDS, exactly like `/cvs` (`CvCard`'s `selection?`
prop turns a tile into one radio of a native group, the whole card still a
real `<Card>` with its own Edit/Delete/Download buttons — no nested
interactive content inside a `<label>`, see **Master CVs** below). Same
`NewCvCard` while slots are left, same limit state at three. The "Manage
master CVs" link is GONE (owner decision, 2026-09-19: "remove the button to
'manage master cvs' since all operations to manage cvs will also be available
in the page") — every master CV operation (edit, delete, download, create) is
already on this screen. The empty state (zero master CVs) is `/cvs`'s own
(`BASE_CV_EMPTY_TITLE`/`BODY`/`CTA` in `base-cvs/base-cv-list.tsx`), not a
picker-specific invitation. **Read-only renders no cards at all** — just the
`TailoredCvReadOnlyBanner` and `BASE_CV_PICKER_LOCKED_BODY`, no list, no
create, exactly as before this slice.

The module mirrors `base-cvs/` rather than forking it:

- `types.ts` is the vocabulary (`TailoredCv`, `TailoredCvReadOnlyReason`) and
  owns the on-screen copy constants (`TAILORED_CV_READ_ONLY_COPY`,
  `TAILORED_CV_SOURCE_DELETED`). Assert the WORDS, never the classes.
  `src/services/types/tailored-cv.ts` re-exports it.
- `tailored-cv-schema.ts` mirrors `base-cv-schema.ts` field for field and
  carries every length ceiling explicitly. **Keep every client ceiling at or
  under the server's.** `getApiError` returns `detail` unguarded and FastAPI's
  422 `detail` is an ARRAY, so a server-side validation error would reach the
  toast as garbage; a reachable 422 is the bug, not the toast.
- `tailored-cv-editor.tsx` is `CvFormSections` — the SAME body as the master CV
  editor, so the two cannot drift — plus the job-description panel, the
  provenance badge and read-only mode. Like `BaseCvEditor` it does NOT own
  `useForm`; the page does. Its `actions` slot is where `ExportCvButton` mounts,
  and in read-only mode it is the ONLY thing the footer carries.
- `was_ai_generated` exists on the wire type and renders NOWHERE. Nothing in
  this product generates a CV, and no UI may suggest it will. `adjustments`
  (`TailoredCvAdjustment[]`, `{section, description}`) DOES render since
  KODI-049 — see "Tailor by keywords" below.

**"Tailor by keywords" and the CV fit (PRD 0012, KODI-049, R-025/R-026/R-028,
ADR-0017).** The verbatim copy stays the default everywhere; keyword tailoring
is opt-in.

- `TailorByKeywordsSwitch` (`tailor-by-keywords-switch.tsx`, label "Tailor by
  keywords", description "Reorders skills and bullets by how well they match
  the job description. No text is added or changed.") renders inside
  `BaseCvPicker`'s footer ONLY when the caller passes
  `onTailorByKeywordsChange`. Both callers pass it only when the application's
  job description is not blank — `application-cv-page.tsx` reads
  `application.job_description`, `new-with-cv-page.tsx` the draft's SAVED one
  (`lastSavedDraftInput`), since the server tailors against what it has. A
  blank JD renders no switch at all, never a disabled one (Plan corrections
  16). Off by default; on sends `tailoring: "keywords"`. The create hook takes
  `{baseCvId, tailoring?}` and the service always sends `tailoring` (`"copy"`
  by default). The job start dialog's own "Tailor by keywords" is a RADIO, not
  this switch — select by role in tests.
- `CvFitPanel` (`cv-fit-panel.tsx`) is `FitBadge` + `FitKeywords` (K6, reused,
  never forked) in `TailoredCvEditor`'s `fit` slot, right under
  `JobDescriptionPanel` — so the editor then has ELEVEN h2s (Job description,
  CV fit for this job, Identity…). `useApplicationCvFit(applicationId,
enabled)` (`hooks/use-application-cv-fit.ts`, key `["application-cv-fit",
id]`) reads `GET /applications/{id}/cv/fit`; `enabled` is "a copy exists
  AND the JD is not blank", so a blank JD asks for nothing. A 404 (no copy)
  renders no panel (`isNoTailoredCv`), `score: null` renders nothing, any other
  failure renders the panel's own alert + "Try again". Same panel editable and
  read-only, on both the application CV page and draft step 2. "The fit
  reflects the last saved version." shows while the form is dirty (draft: while
  the CV autosave is saving or failed). Every write that can move the score
  invalidates the key: the copy's create/update/delete (incl. the draft's
  silent autosave), `useUpdateDraft` (step 1 autosave carries the JD),
  `useApplicationMutate` (the application edit sheet) and the application
  delete.
- **The moves in the comparison.** `useCvDiff` takes `adjustments`
  (`cv.adjustments`). While "Show changes" is on and the list is not empty,
  `CvDiffSummaryBar` lists them under "Reordered by job match"
  (`cv-diff-adjustments.tsx`, one `li[data-section]` per entry, the server's
  `description` verbatim, `getByRole("list", {name: "Reordered by job
match"})`), and a section an adjustment names gets "reordered" on its header
  count (`CvDiffSectionCount` `reordered`, `data-reordered`: "reordered", "1
  change, reordered"). The "Compared with X: N changes" line is unchanged.
  `cv-diff.ts`, `applika/fixtures/cv-diff/` and the server diff are UNCHANGED
  (KODI-045 AC6): skill-category and keyword reorders show ONLY through
  `adjustments`; a pure reorder is still zero diff changes. `adjustments` is
  written once at creation and can go stale after edits — a known gap.

**Read-only is the application's state, never the copy's.** The page derives
`readOnlyReason` as `application.finalized_at != null ? "finalized" :
isViewingPastCycle ? "archived" : null` (PRD 0008/ADR 0012: keyed on
`finalized_at`, not the derived `finalized` boolean — see **Application
Timeline** below) and both the picker and the editor take it: the banner goes
up, every control is disabled and no Save, Cancel or Delete is rendered at all,
so there is nothing to WRITE by accident. The footer itself survives when
`actions` is given, carrying the PDF export and nothing else — refusing to let a
locked copy be written is not refusing to let it be read. A read-only editor
with no `actions` renders no footer, which is why the older unit test that
asserts the footer is gone still holds. The UI is a courtesy, not the rule — the
API refuses a finalized write with 409 and an archived one with 422 whatever the
screen shows, and both reach the user as the server's own `detail` in a toast.
`GET` carries no such guard, so VIEWING a locked copy always works.

Because the API has no `GET /applications/{id}`, the page reads its application
out of the cycle's list through `useApplicationById`, under the SAME query key
as `useApplications`. That is also why "archived" is knowable at all: the wire
carries no per-application `cycle_id`, so the cycle being VIEWED
(`useCycleContext().isViewingPastCycle`) is the only signal, and an archived
application is therefore reachable only by opening its CV from the applications
list with that cycle selected.

A 404 from `GET /applications/{id}/cv` is NOT a failure — it is the ordinary
"no copy yet" answer and the page renders the picker for it. Use
`isNoTailoredCv(error)` to tell it apart from a real one.

**`application.finalized_at` (not the `finalized` boolean) is the source of
truth for "closed" everywhere (KODI-012, PRD 0008, ADR 0012).** It replaced a
step/feedback-driven "finalize" with a real application TIMELINE. Both fields
are set together server-side, but every read-only derivation on the web keys
on `finalized_at != null` — including the tailored-CV `readOnlyReason` above,
which was `application.finalized ? "finalized" : …` before this slice.

**The copy editor is 50/50 at every width from `md`, with the job description
above Identity and contact (KODI-017 part 2).** The owner: "instead of showing
the job description in the right side just above cv preview, move to the
left above identity and contact" — and drop the `2xl` cap `BaseCvEditor` never
had either, so the two editors match at every width, not just up to `2xl`
(KODI-009's note on the cap is superseded). `TailoredCvEditor`'s form column is
now `JobDescriptionPanel`, then the diff `diffSummary` slot, then
`CvFormSections`, in DOM order — which is also the mobile stacking order. The
preview column is unchanged: sticky, `max-h-editor-scrollport`, the same
layout-notice rules as `BaseCvEditor`. Because `JobDescriptionPanel` is a
`CvSectionCard`, it carries its own `h2` — the copy editor's field body now has
TEN level-2 headings where the master CV editor has nine; any test asserting
that list has to count the job description first.

**The copy's diff against its baseline is computed TWICE, independently, on
the web and on the server, from one PINNED shared contract (KODI-017 parts 2
and 3).** Baseline resolution: `cv.base_snapshot` (the master CV's content,
captured once at copy-creation time, `TailoredCvSnapshot` in `types.ts`) when
present, else the CURRENT master CV fetched via `base_cv_id`, else no diff UI
at all — the `source CV deleted` note stays exactly as it was. Neither is ever
written by the client: `base_snapshot` rides on `GET`/`POST`/`PUT` responses
only, and `toTailoredCvPayload` never emits it (the API's `extra=forbid` would
422 it anyway).

- `cv-diff.ts` is the pure engine, no React, no I/O. `computeCvDiff(baseline,
  current)` returns the rich internal shape (`CvDiffDetail`) `use-cv-diff.tsx`
  reads to build markers: per-field before/after, added items, removed items
  WITH their baseline position (`at`, for `Restore`), and skill-keyword
  add/remove sets. `diffCv(baseline, current)` is
  `computeCvDiff(...).canonical` — the flat `{total, sections, changes[]}`
  shape the slice brief PINS, identical in field names and semantics to the
  server's own diff. Matching is by the client-generated item `id`, never by
  position — a pure reorder is zero changes. `null`/`undefined`/`""` compare
  equal; bullets compare as ONE whole-value change; skill keywords compare as
  a SET per category, so each added/removed keyword is its own change.
  `cv-diff.fixtures.test.ts` loads every file in `applika/fixtures/cv-diff/
*.json` (backend-owned) and asserts `diffCv()` matches the server's
  `expected` output; it `describe.skipIf`s itself away while that folder does
  not exist, so it activates with no code change once the backend adds it.
- `use-cv-diff.tsx` is the ONLY thing that watches the form (`useWatch`) and
  turns a `CvDiffDetail` into `TailoredCvEditor`'s `diffSummary` (a
  `CvDiffSummaryBar`) and `diff` (`CvFormDiffSlots`) props, live — a Revert or
  an edit recomputes on the next keystroke. It owns the "Show changes" toggle
  state (default OFF, no persistence) and every `form.setValue`/`getValues`
  call behind Revert and Restore. Read-only passes `onRevert`/`onRestore` as
  `undefined` rather than omitting the marker — markers and badges still show
  on a locked copy, only the actions that would write to it are gone.
- The marker components (`ui-designer`-delivered, KODI-017 part 2 spec) are
  `cv-diff-summary-bar.tsx` (`CvDiffSummaryBar`, the toggle and the "Compared
  with `<label>`: N changes" text — `<label>` is the CURRENT master's name
  when `base_cv_id` resolves, else "the original master CV", ALWAYS, even
  when the diff is read off the frozen snapshot), `cv-changed-marker.tsx`
  (`CvChangedMarker`, the popover with the original value and Revert),
  `cv-added-badge.tsx`, `cv-removed-row.tsx` (Restore reinserts at the row's
  `CvRemovedRowSlot.at` index) and `cv-diff-section-count.tsx`. The slots
  themselves (`CvFormDiffSlots` in `base-cvs/cv-form-diff.ts`) are optional
  props threaded through `CvFormSections`/`CvSectionCard`/
  `CvRepeatableSection`/`CvSkillsSection`/`CvField` — absent, every one of
  those renders BYTE-IDENTICAL to before this slice, which is what keeps the
  master CV editor untouched.
- **"Download changes"** (`cv-diff-download-row.tsx`, `CvDiffDownloadRow`,
  KODI-017 part 3) sits under `CvDiffSummaryBar` in the same `diffSummary`
  slot, offering the diff as a Markdown file or a PDF —
  `GET /applications/{id}/cv/diff/{markdown|pdf}`, rendered on the SERVER
  from the SAVED copy (ADR 0011: no client rasteriser), never the form's
  unsaved edits. Its two buttons are named "Download changes as PDF" /
  "Download changes as Markdown" — never bare "PDF"/"Markdown" — precisely so
  a `getByRole("button", {name})` substring match cannot also catch the
  unrelated "Download PDF"/"Download Markdown" buttons the same screen
  renders (the ui-designer's `getByLabel` ambiguity note, applied to these
  too). A 409 ("This CV copy has no baseline to compare with.") or an
  unresolved baseline (the master CV fetch itself failing while
  `base_cv_id` is set) disables both buttons WITH the reason on screen,
  via `aria-describedby`; while `form.formState.isDirty`, a `"Downloads
reflect the last saved version."` note sits beside them — the export is
  always of the saved row, never a preview of the edit in progress.
- `ExportCvButton` gained a Markdown button beside the PDF one
  (`onExportMarkdown`/`isExportingMarkdown`, KODI-017 part 3): every surface
  that renders the PDF button renders both — `/cvs` tiles, `/cvs/editor`, the
  picker's `CvCard`s and the copy editor. Same pending/live-region pattern,
  one shared layout notice. `src/lib/pdf-download.ts` gained
  `cvMarkdownFilename`/`cvDiffMarkdownFilename`/`cvDiffPdfFilename` beside
  `cvPdfFilename`, and the services gained `exportMarkdown` (both
  `IBaseCvService`/`ITailoredCvService`) plus `exportDiffMarkdown`/
  `exportDiffPdf` (`ITailoredCvService` only) — all `GET` with
  `responseType: "blob"`, unlike the `POST` PDF routes.

### Application Timeline (`src/components/timeline/`)

Ported from `mynextjob/frontend/src/components/timeline/` (16 files) plus its
service layer, hooks and `lib/timeline-view.ts` — mynextjob has no interview
types at all, so `interview_type` and the R-030/R-032 behaviour below are
applika-only additions on top of the port, never present in the mynextjob
source. When touching this area, port a NAMED mynextjob source WHOLE (a
prose-subset port cost a 40% deviation on a prior feature) and extend it,
rather than reimplementing from scratch.

- **Vocabulary.** `timeline-types.ts` is the single vocabulary: the hardcoded
  5-value `event_type` (`note | interview | feedback | offer | denied`, NOT a
  DB catalog — R-021 removed the old step/feedback definition catalogs
  entirely, admins can no longer create/edit/delete them), the hardcoded
  7-value `interview_type` (`unknown | initial_screening | technical |
cultural | hiring_manager | take_home | final`, `unknown` is the default),
  the 20 `SALARY_CURRENCIES` and the 3 `SALARY_PERIODS` (`hourly | monthly |
annually` — an OFFER's own period is further restricted to `monthly |
annually`; `hourly` survives only on a legacy offer migrated from a step or
  written by an old CLI). `timeline-options.ts` carries the presentation
  config (`EVENT_TYPE_CONFIG`, `INTERVIEW_TYPE_CONFIG`, `CURRENCY_OPTIONS`,
  `SALARY_PERIOD_OPTIONS`) and `TIMELINE_STAGES` — the 9 dashboard/API stages
  (each interview type, then offer, then denied) plus `stageLabel()` /
  `stageShortLabel()`.
- **AC9 (R-031): one source of the 20 currencies and the 3 periods.**
  `src/services/types/users.ts`'s `SalaryPeriodValues`/`SalaryCurrencyValues`
  and `src/options.ts`'s `CURRENCY`/`SALARY_PERIOD` are DERIVED from
  `timeline-options.ts`/`timeline-types.ts`, not redefined — every currency or
  period list in the app (profile, application create/edit, the timeline
  offer form, the finalize offer fields) is therefore the same 20/3 list, and
  the stale `"annual"` (vs. the API's `"annually"`) cannot resurface on the
  web. Never hand-roll a second currency or period list.
- **Data layer.** `src/services/types/timeline.ts` is the wire DTO
  (`TimelineEvent`, `CreateTimelineEventPayload` — a discriminated union on
  `event_type` so `interview_type` only ever rides with `interview` and the
  salary trio only with `offer`). `src/lib/timeline-view.ts` maps the DTO to
  `TimelineEventView` (camelCase) and sorts newest-first — components never
  see the raw DTO. `src/hooks/use-timeline.ts` (+ the create/update/delete
  mutation hooks) own the `["timeline","list",applicationId]` query key.
  `use-application-steps.ts` and `step-form-dialog.tsx` are GONE (R-021); the
  web must never call `/applications/{id}/steps*` or
  `/admin/{step,feedback}-definitions*` (all now CLI-0.1.4-only or 404).
- **`TimelineSection`** (mounted directly inside `application-item.tsx`'s
  expanded area, not passed in as `children`) owns the add/edit dialog and the
  delete confirmation, and derives read-only from TWO signals:
  `application.finalized_at != null` (closed) OR
  `useCycleContext().isViewingPastCycle` (archived) — the same
  `isViewingPastCycle` convention the tailored-CV page already uses, since
  applika's `Application` carries no per-row `cycle_id` on the wire (unlike
  mynextjob's, which the ported `timeline-section.tsx` read directly).
- **R-030 (at most one initial-screening interview).** `TimelineEventForm`
  takes `otherEvents` (every event but the one being edited) and disables
  `initial_screening` in `InterviewTypeSelect` — disabled, not hidden, with
  `INITIAL_SCREENING_TAKEN_HINT` under the trigger — whenever another event is
  already `interview`/`initial_screening`. The API 409s the same rule
  server-side; its detail reaches the user through the mutation's toast
  (`getApiError`).
- **The interview type select needs an explicit default.** Its trigger DISPLAYS
  "Unknown" the moment `event_type` becomes `interview` (a presentational
  fallback in `InterviewTypeSelect`), but nothing writes that back into
  react-hook-form state until the user touches the control — `TimelineEventForm`
  has a small `useEffect` that seeds `interview_type` to `DEFAULT_INTERVIEW_TYPE`
  the moment the branch becomes active, precisely so a save with the select left
  untouched still validates instead of failing silently on a blank value. Keep
  this if you touch the form; deleting it reintroduces that bug invisibly (the
  select LOOKS fine, the save just fails).
- **Legacy hourly offers (R-031 WATCH).** `SalaryPeriodToggle` shows NOTHING
  selected when the loaded value is `hourly` (its own zod branch only accepts
  `monthly | annually`), and the edit form renders `LEGACY_HOURLY_OFFER_HINT`
  under it — the user must actively repick a period before the edit can save.
  Never default a legacy hourly offer to monthly/annually silently.
- **Close/reopen is an outcome picker, not confirm-only (R-032).** The plan's
  original "finalize" line is superseded by the owner's 2026-09-18 decision:
  `FinalizeDialog` (`src/components/applications/finalize-dialog.tsx`) lets the
  user pick None (default, bodyless `POST /applications/{id}/finalize`), Offer
  or Denied; Offer/Denied reveal a date + observation, and only Offer also
  reveals the salary triad. The confirmation copy always contains the word
  "reversible" (`FINALIZE_REVERSIBLE_COPY`) — this used to be an
  irreversible-warning `AlertTriangle`; it is now a muted `RotateCcw`, because
  `useReopenApplication` makes the promise real. `useFinalizeApplication` takes
  an OPTIONAL payload (`{applicationId, payload?}`) rather than mynextjob's
  bodyless-only mutation, and invalidates `["applications"]`, `["statistics"]`
  and that application's timeline key (an outcome lands as a new event).
- **Closed application UI.** `ApplicationClosedBadge` (keyed on `finalized_at`)
  and `ApplicationReopenButton` (accessible name composed as `` `Reopen
${role} at ${company}` ``, WCAG 2.5.3) live in `src/components/applications/`.
  A closed row hides Add/Edit/Close entirely — not merely disables them — and
  shows Reopen instead; the CV link always stays (a closed application's CV
  copy is still readable, mirroring the tailored-CV read-only pattern above).
- **Dashboard + agenda read from `TIMELINE_STAGES`/`stageLabel`, never
  `step_name`/`step_color`.** Both statistics endpoints ALWAYS return exactly
  the 9 stages in `TIMELINE_STAGES` order; `step-conversion-chart.tsx` and
  `avg-days-per-step-chart.tsx` map every stage to a row (defaulting to 0 when
  the API omits one, never a missing bar) rather than rendering only the rows
  the API happens to send. The agenda item's `step_name`/`step_color` are now
  nullable, legacy, reverse-mapped fields kept only for the CLI; the agenda
  page, the agenda dropdown, agenda notifications and `lib/calendar.ts`'s ICS
  generation all label from `stageLabel(event_type, interview_type)` instead.
  The old step dialog's "Add to calendar (.ics)" button went with
  `step-form-dialog.tsx`, and its `genApplicationStepIcsFile` was deleted as
  dead code; `.ics` export now lives only on the agenda page
  (`genAgendaStepIcsFile`). Porting it to the timeline form is an open owner
  call, not an oversight.
- **jsdom polyfills for Radix in `src/test/setup.ts`.** `hasPointerCapture` /
  `setPointerCapture` / `releasePointerCapture` / `scrollIntoView` and a
  `ResizeObserver` stub were added here (KODI-012) — jsdom implements none of
  them, and Radix `Select`/`RadioGroup` (the interview type select, the event
  type selector, the salary period toggle, the finalize outcome picker) reach
  for all of them when opening or measuring. Any future test that opens a
  Radix `Select` needs nothing extra; these are global.
- **The event dialog is `max-w-3xl`, top-anchored, only its body scrolls
  (KODI-014).** `timeline-event-dialog.tsx`'s `DialogContent` is
  `top-4 translate-y-0 … sm:top-[8dvh] sm:max-h-[84dvh] sm:max-w-3xl` with
  `flex flex-col gap-0 p-0`; the header and footer are fixed `px-6` bands and
  only the middle `overflow-y-auto` div scrolls. Picking an event type grows
  or shrinks the form (schedule group, offer salary group, denied-reason box)
  without moving the footer's submit button off screen. Any other dialog whose
  body can grow tall should copy this shape rather than centring + `max-h` on
  the whole `DialogContent`.
- **A type-specific field group is UNMOUNTED, never CSS-hidden, and its
  payload is nulled or omitted from the wire side, not just left unfilled
  (KODI-014, revised KODI-016).** The interview-only schedule
  (start/end/`TimezoneSelect`) and the denied-only `DeniedReasonSelect`
  follow the same shape as the offer salary group before them:
  `TimelineEventFormFields`/`FinalizeOutcomeFields` take an
  `isInterview`/`isDenied`/`isOffer` flag and render the group or `null`, so a
  value the user typed before switching types never sits in an invisible
  control. **A non-interview event never sends a schedule, on CREATE or
  EDIT, whatever was stored (KODI-016).** `toTimelineEventPayload` takes only
  the form values — no `original`/stored-event argument any more — and reads
  the CURRENT `event_type`: for `interview` it sends `start_time`/`end_time`/
  `timezone` (nulling `timezone` whenever `start_time` is blank, because
  `TimezoneSelect` cannot be cleared and always holds a real zone); for every
  other type it OMITS the three keys from the payload ENTIRELY — not `null`,
  ABSENT — even when editing an event that already carries a legacy stored
  schedule. This replaces KODI-014's interim rule, which kept an already
  non-interview event's stored schedule unchanged on an edit that left the
  type alone; the owner's final call (2026-09-18) is that a non-interview
  event is blocked from ever carrying a schedule, full stop, so there is
  nothing left to preserve. `toFinalizePayload` is unaffected: it never had a
  stored-schedule case.
- **The response mirrors the rule: `start_time`/`end_time`/`timezone` are
  ABSENT (not `null`) on a non-interview `TimelineEvent`, never REQUIRED
  fields (KODI-016).** `services/types/timeline.ts`'s `TimelineEvent` marks
  all three optional (`?:`); `toHourMinute` in `lib/timeline-view.ts` passes
  `undefined` through unchanged rather than crashing or coercing it to
  `null`, and `timelineEventToFormValues`'s `event.startTime ?? ""` /
  `event.timezone || browserTimeZone()` already tolerate a missing key the
  same way they tolerate `null`. Nothing may crash or render the string
  `"undefined"` when the keys are absent — see
  `timeline-event-card.test.tsx` and `lib/timeline-view.test.ts`.
- **A card shows the zone READABLE, exactly like `TimezoneSelect`
  (KODI-016).** `formatTimeRange` (`timeline-format.ts`) renders the zone
  through `timeZoneLabel` from `timezone-options.ts` — the SAME formatter the
  select's trigger and options use (underscores as spaces, e.g.
  `America/Sao Paulo`) — never the raw IANA id and never a second
  implementation of the same substitution. The STORED and SENT value is
  always the raw id (`America/Sao_Paulo`); only the on-screen label is
  reformatted.
- **`TimezoneSelect` (`timezone-select.tsx`) and `timezone-options.ts`
  (KODI-014)** are the pattern for any future searchable single-choice
  combobox: a `Popover` + `Command` over `Intl.supportedValuesOf("timeZone")`
  (`UTC` force-included), grouped by region via `groupTimeZones`, with a
  stored value the browser does not list shown FIRST in its own `"Selected"`
  group — never dropped. It is not clearable (a schedule with no zone is the
  times left blank, not an empty zone). `browserTimeZone()` — wrapping
  `Intl.DateTimeFormat().resolvedOptions().timeZone` in a try/catch —
  pre-fills a new event; the stored value always wins on edit
  (`timelineEventToFormValues`), falling back to `browserTimeZone()` only when
  nothing is stored. `timeZoneFilter` is a literal case-insensitive substring
  match (id + offset), never cmdk's fuzzy default — fuzzy would match `"zzzz"`
  into `Brazzaville`.
- **`DeniedReasonSelect`/`DeniedReasonBadge` (KODI-014)** are the
  `denied_reason` counterpart of `InterviewTypeSelect`/`InterviewTypeBadge`:
  a plain Radix `Select` (not a combobox — only 10 fixed values), grouped
  Unknown | the 8 named reasons | Other, defaulting to `unknown`
  (`DEFAULT_DENIED_REASON`) via the same "seed on the effect that flips
  `isDenied`" pattern `interview_type` already used. The card badge reads
  `null`/absent as `unknown` and carries a `sr-only` `"Reason: "` prefix —
  assert on `/reason:\s*<label>/i`, never an exact string, the same convention
  `InterviewTypeBadge` already set.

### Agenda (`src/components/agenda/`, `app/(protected)/agenda/agenda-page.tsx`, KODI-037)

Rewritten after `docs/refs/agenda-rework.png`: Upcoming | Past tabs (Upcoming
always selected on open), date groups, rich cards, a toolbar search + stage
filter with tab counts. `GET /users/me/agenda` is UNCHANGED — same ±30-day
window, same `AgendaStep` fields (R-014/R-012).

- **`agenda-view.ts` is pure — no React, no I/O — and every zone computation
  goes through ONE Intl-based primitive, `zonedTimeToUtc`/`timeZoneOffsetMs`.**
  `parseTime`, `convertToLocalTime`, `getDisplayTime` and `isStepPast` were
  moved here from the old page component, but `isStepPast`/`convertToLocalTime`
  were REWRITTEN on top of `Intl.DateTimeFormat` with an explicit `timeZone`
  rather than `Date#toLocaleString()`/`Date#getHours()` with none: the old pair
  silently reads the PROCESS's own `TZ`, which made both the "today" boundary
  and the converted HH:mm depend on the machine running the test — real under
  a developer's local zone, wrong the moment CI (UTC) or any other zone runs
  it. `now`/`localTz` are INJECTABLE parameters on top of that fix, so a test
  pins both the clock AND the zone rather than relying on the process's
  ambient ones. Verify a change here against more than one zone:
  `TZ=UTC pnpm vitest run src/components/agenda` and `TZ=Asia/Tokyo …` must
  both stay green.
  `splitAgenda(items, now, localTz)` returns `{upcoming, past}`: Upcoming is
  not-yet-started, soonest first; Past is already-started, most recent first.
  An untimed step (no `start_time`) stays Upcoming until its calendar day is
  over (R-005) — it is never "past" on its own date. Within one tab, cards are
  ordered by `step_date` FIRST (so a group's cards never interleave with
  another date's) and by each step's own real START INSTANT second — never by
  comparing the raw `HH:mm` strings, which gets a same-day, cross-timezone
  pair backwards (a 10:00 New York card is later in real time than a 10:30
  São Paulo one). `groupByDate(items)` groups an ALREADY-ordered list by
  `step_date`, preserving order both across and within groups (R-006).
  `filterAgenda(items, {search, interviewType})` is case-insensitive substring
  on `company_name` OR `role` SEPARATELY (R-009) — never concatenated, or a
  search matching one word from each field would wrongly match neither — plus
  an exact `interview_type` match (R-010), `"all"` or omitted keeping
  everything. **`agenda-page.tsx` runs `filterAgenda` BEFORE
  `splitAgenda`/`groupByDate`**, so both tabs' counts and contents already
  reflect the search and the stage filter — never filter after splitting, or a
  match in one tab could still show the other tab's stale, unfiltered count.
- **The card anatomy is `AgendaItemCard`** (`components/agenda/agenda-item-card.tsx`,
  ui-designer-delivered): a left time column (bold start, muted end, or "All
  day" when `displayTime` is `null`), an `IconTile` company tile, company +
  role, a meta row (date, time range + "(converted)", readable timezone via
  `timeZoneLabel`), a stage pill (`EVENT_TYPE_CONFIG[type].badgeClass` + dot +
  `stageLabel`), an alert button, a calendar button and a `CollapsibleTrigger`
  chevron, then a nested note row (`FileText` + the trimmed `observation` or
  "No notes" + an `ExternalLink` to `/applications?focus=<application_id>`).
  `AgendaDateGroup` wraps a date's cards with a header bar
  (`formatAgendaDate` + `agendaGroupCountLabel`). Both components are
  presentational: the PAGE wires `onDownloadCalendar` (`genAgendaStepIcsFile`
  - a `"Calendar event downloaded"` toast) and the `alert` prop. The
    chevron's `CollapsibleContent` reveals `AgendaCardTimeline`
    (`components/agenda/agenda-card-timeline.tsx`, ui-designer-delivered,
    KODI-038, R-012) — loaded on open, read-only (no `renderActions`, no
    actions menu, ever). `agenda-page.tsx` wires it as a small child,
    `AgendaCardTimelineBody`, passed as `AgendaItemCard`'s `children`: it
    calls `useTimeline(step.application_id)` unconditionally, and it is
    Radix `CollapsibleContent` unmounting while closed (`ui/collapsible.tsx`,
    no `forceMount`) that makes the fetch happen only once the card opens —
    no `open` state is lifted into the page for this. Reopening a card shows
    the CACHED result immediately (TanStack Query's 5-minute stale time), no
    skeleton flash.
- **The sound alert button is Upcoming-only, and only with a `start_time`
  (R-013, AC11).** `agenda-page.tsx` passes `alert` to `AgendaItemCard` ONLY
  from the Upcoming panel AND only when the step has a `start_time` —
  `undefined` on every Past card and on an untimed Upcoming card, which hides
  the button entirely rather than disabling it.
  `useAgendaNotifications().isEnabled`/`toggle` are unchanged (still
  `localStorage`-backed, still firing at 30/15/5 minutes before).
- **The hyphenated stage label is R-027; the calendar UID is R-008, and the
  two never merge.** `stageLabel()` (`timeline/timeline-options.ts`) now joins
  with `" - "` (`"Interview - Initial screening"`), not `"·"` — every reader
  (the agenda pill, the header `agenda-dropdown`, agenda sound-alert
  notifications, dashboard chart tooltips, `TimelineEventActionsMenu`'s
  accessible name, and the calendar file's SUMMARY/file name) gets the hyphen
  for free since they all call this one function. **The calendar event's
  IDENTITY does not follow it.** `lib/calendar.ts` has a local, UNEXPORTED
  `legacyStageLabel()` — a byte-for-byte copy of the OLD `"·"`-joined
  logic — used ONLY in the ICS `UID:` line, so re-downloading and
  re-importing the same event still updates the same calendar entry instead
  of creating a duplicate. Every other line in the file (`SUMMARY`, the
  downloaded file's name) calls the real `stageLabel()`. `calendar.test.ts`
  pins both halves independently and is written to fail if either is
  reverted onto the other.
- **Empty and error states (R-015, AC13).** Three distinct messages, never
  conflated: "No upcoming interviews" / "No past interviews in the last 30
  days" (the tab is genuinely empty, before any filter — each with a "Go to
  Applications" action) vs. "No interviews match your search" (the tab had
  items before `filterAgenda` ran, shown with no action). A load error
  renders `getApiError(error)` verbatim inside `role="alert"`, with the tabs
  themselves showing no counts (`countsReady` is `false` while `isLoading` or
  `isError`) rather than a stale or fabricated number.
- **Tab state is never in the URL.** `Tabs defaultValue="upcoming"` means a
  fresh page load — including a hard refresh — always opens on Upcoming,
  which is the owner's explicit ask ("upcoming first and active by default").

### Application drafts (`src/components/application-drafts/`, PRD 0010, KODI-033)

The owner: "i want to add option to the user to create a job application and a
cv together (this option will be available only in the web app, no support to
the cli) … open a new page where the user selects a master cv to use as
template, let the user edit the cv to the job and then in the next step the
user fills the data about the application." Clarified: step order reversed —
"the user first fill the data related to the application and then in the
second step select a master cv to edit, this way i can create a draft
application entry."

- **Two steps, one draft, one page.** `/applications/new-with-cv?id=&step=`
  (`new-with-cv-page.tsx`) owns BOTH react-hook-form instances (the
  application fields and the CV fields) and both autosave loops, mirroring
  `application-cv-page.tsx`'s "the page owns the schema, the presentational
  components render it" convention. `draft-cv-step.tsx` is the same
  picker/editor split as `application-cv-page.tsx`, reused against a DRAFT id
  — the backend accepts a draft id under `/applications/{id}/cv` exactly like
  a real application id.
- **The draft carries a date from the moment step 1 exists (KODI-036, AC1,
  R-003).** `showDate` is GONE from `ApplicationFields` — both callers ask for
  the application date now. A new draft presets it to the browser's own
  calendar day, never `toISOString()` (`localCalendarDay()` in
  `draft-copy.ts`); a resumed draft shows its STORED value
  (`applicationValuesFromDraft`, `services/types/application-drafts.ts`'s
  `DraftInput.application_date`); every autosave POST/PUT sends it, like every
  other field; and Finish flushes the current value with one more PUT and
  sends THAT SAME value to `POST /applications/drafts/{id}/finish` — never a
  freshly computed "now", even if "now" has moved on since the draft was
  created. `maxDate={new Date()}` refuses a future pick client-side; the
  server's own `ensure_not_in_future` is the real gate (a 422 shows "Not
  saved", the sheet's and the draft page's existing failed-autosave copy,
  unchanged).
- **`application-fields.tsx` is the field set the side sheet and the draft
  page share.** It was extracted from `application-form-sheet.tsx`
  (characterized first in `application-form-sheet.test.tsx` — the payload
  shapes for an existing company id, a brand-new `{name, url}` company and a
  name-only company, plus the validation messages — so the extraction could
  not silently change any of them). The sheet still owns its own zod schema,
  its own submit and its own Sheet chrome; `ApplicationFields` owns only the
  fields. The first section's third line is the application date and then the
  job link, side by side (KODI-036, AC3/AC4, R-037) — same `ROW2` grid both
  fields before it use, not a full-width row of its own any more.
- **Card-free, flat sections (KODI-036, AC10-AC16, R-043..R-049).**
  `form-section.tsx`'s `FormSection` dropped its `icon` prop and its `Card`
  shell: a section is now a bare `<section>`, a title (`as="h2"` on the page,
  `as="h3"` in the sheet, under the sheet's own `h2` title) plus a muted
  description, and its fields — no card, no icon, anywhere, in either caller.
  A `FormSection` immediately after another one gets
  `border-t border-border/60 pt-5` from a CSS sibling selector
  (`[[data-slot=form-section]+&]`) — the hairline AND the whitespace AC12
  asks for, on TOP of the `application-fields.tsx` root's own `gap-5` between
  sections. Rows inside a section are `gap-3` (`ROW2`/`ROW3`), still
  `grid-cols-1` narrow and `@md/app-form:grid-cols-2|3` wide — nothing here
  needed a media query, `application-fields.tsx`'s root was already
  `@container/app-form`. Neither caller puts a width limit of its own on the
  form any more (AC5) — `draft-application-step.tsx` dropped the `max-w-4xl`
  it used to pass, and the new-with-cv PAGE (not the fields) is what bounds
  the content column, same as any other page.
- **Step 1's bottom row is Cancel + Continue to CV (KODI-036, AC15).**
  `DraftFooterActions`' step-1 branch grew a `LinkButton` to `/applications`
  beside the existing Continue button. Cancel never deletes an existing
  draft — it is a plain navigation, not a mutation. Its one piece of behaviour
  is the `hasUnsavedRisk` prop (the SAME condition `new-with-cv-page.tsx`'s
  own `beforeunload` guard already computes): risky, the click is intercepted
  and replaced with `window.location.assign("/applications")` — a REAL
  top-level navigation, so the browser's native `beforeunload` prompt gets a
  chance to fire, which a Next.js client-side transition would skip
  entirely; with nothing at risk it is left as a plain link. This is
  deliberately narrower than `draft-page-states.tsx`'s "Back to applications"
  link, which stays exactly as it was.
- **The autosave contract (`use-debounced-autosave.ts`).** One request in
  flight, the latest value always wins: a change mid-flight is queued and
  fires the instant the first request settles, with NO extra debounce wait.
  ~1000ms after the last change, `PUT` is always a FULL replace of
  `DraftInput` — never a partial, exactly like the application's own update.
  `AutosaveStatus` treats the debounce WAIT itself as `"saving"` so `Saved`
  never shows over unsaved typing; the flip happens during RENDER (React's own
  "adjust state when a prop changes" pattern), never inside a `useEffect` body
  — a synchronous `setState` in an effect is a lint error in this repo
  (`react-hooks/set-state-in-effect`), and this project's `react-compiler`
  ESLint plugin ALSO forbids reading or writing a `ref.current` during render;
  keep every piece of render-visible derived state in `useState`, and move
  ref-only bookkeeping (things only an async callback reads) into refs
  updated from effects or event handlers, never from the render body.
- **No draft until company, role and platform are all set (AC6).** Before
  that, what the user types lives only in the page's own React state — nothing
  is ever written to `localStorage`/`sessionStorage`/IndexedDB — and a
  `beforeunload` listener warns before closing or reloading while typing is
  unsaved (before the draft exists, or while an autosave is `saving`/`error`).
  The first successful save is a `POST /applications/drafts` that mints the
  draft id and `router.replace`s `?id=` onto the URL; every later save on
  either step is a `PUT`.
- **Company/platform resolution on the draft is NOT the sheet's.** The
  sheet's `CreateApplicationPayload.company` accepts an id OR a bare
  `{name, url}` object and lets the SERVER decide; `DraftInput` requires an
  explicit `company_id: string | null` and `company_name`. So the draft page
  resolves a brand-new company itself: a URL confirmed for it calls
  `POST /companies` (`useCreateCompany`) and takes the 201/200 id back
  (AC18); no URL means `company_id: null` and the typed name stays free text
  forever (AC16, matches the sheet). `CompanySelect` gained an optional
  `onCompanyChange` callback (existing pick, inline create, or clear) purely
  so the draft page can recover the NAME of an existing selection, which the
  polymorphic form field alone does not carry — the sheet ignores it.
- **The platform picker (`components/applications/platform-select.tsx`,
  AC14).** A Popover+Command combobox, the `CompanySelect`/`TimezoneSelect`
  pattern: an exact case-insensitive match is offered instead of "Create"
  (AC17); "Create "X"" swaps the list for a name + optional URL form
  (`POST /platforms`); a 409 refetches `["supports"]` and selects the
  colliding row with the server's `detail` shown verbatim (`useCreatePlatformOutcome`
  in `hooks/use-create-platform.ts`). It replaces the plain `<Select>` in
  `application-fields.tsx`, so both the sheet and the draft page get it for
  free. A platform may have no URL, whoever adds it — every list renders a
  `url: null` row without error.
- **Private rows (AC15).** `OnlyYouBadge` (`components/applications/only-you-badge.tsx`)
  marks a `is_public === false` company or platform in both pickers with
  "Only you"; the admin screens pass `label="Private"`. The backend already
  filters visibility; this is the UI half only.
- **Applications | Drafts tabs (KODI-036, AC8/AC9, R-041/R-042).** On the
  current cycle, `applications-page.tsx` wraps the toolbar+filters+list in a
  shadcn `Tabs` (`variant="line"`): "Applications" (`defaultValue`, so it is
  always the one selected when the page opens — Tabs state is not persisted
  across a remount) holds the list, its filters and its empty state exactly as
  before this slice; "Drafts" holds `DraftsSection` and carries the draft
  count as a small pill PLUS one `sr-only` span reading the whole accessible
  name `` `Drafts (${n})` `` (the visible pill stays `aria-hidden` — do not
  read the count off it in a test, read the tab's accessible name). On an
  ARCHIVED cycle there is no `Tabs` at all — the toolbar and list render
  directly, with no drafts, unchanged from before tabs existed.
- **`drafts-section.tsx` (AC2) is now the Drafts tab's WHOLE body, not a
  section that floats beside the list.** It lost its own `h2`/description
  header (the tab trigger already says "Drafts") and its early-return on an
  empty list: with no drafts it renders "No drafts yet." plus a "New with CV"
  link (`APPLICATIONS_PAGE_COPY.newWithCv`) instead of `null` — including
  right after the LAST draft is deleted, so the tab never goes blank. It still
  returns `null` only while `isLoading`. Resume (`draftResumeHref`) always
  targets `/applications/new-with-cv?id=`; the PAGE decides step 1 vs step 2
  from `has_cv` (AC12). Delete is an `AlertDialog` confirm; deleting a draft
  takes its CV copy with it, same cascade as deleting a real application.
- **Finish (AC9/AC10).** Disabled with the missing list
  (`DRAFT_REQUIREMENT_ORDER`: company, role, platform, then "CV copy") shown
  via `missingLabel()`. Before calling `POST /applications/drafts/{id}/finish`
  it flushes both forms with one more full-replace `PUT` each, so nothing
  typed in the last debounce window is lost even if it has not fired yet. A
  422 (no CV copy, or a future date) surfaces as the server's own `detail` in
  `[data-slot="draft-finish-error"]`.

### Admin — private company/platform rows (`components/admin/catalog-visibility.tsx`, `approve-catalog-button.tsx`, PRD 0010, AC19/AC20)

The public companies/platforms admin screens (`admin/companies/companies-page.tsx`,
`admin/platforms/platforms-page.tsx`) gained a `VisibilityFilter` (All/Public/Private,
sends `visibility=public|private`, `all` sends no param), an "Added by" column
reading the row's nested `created_by.username` (a dash when absent — the
LEGACY flat `created_by_username` field is still on the wire for the CLI but
the web no longer reads it) and, on private rows only, `ApproveCatalogButton` —
`Approve` behind an `AlertDialog` confirm, calling
`POST /admin/{companies|platforms}/{id}/publish`. A 409 (the row would
duplicate a public one) keeps the dialog open and shows the server's `detail`
VERBATIM in `[data-slot="approve-catalog-error"]`, naming the colliding public
row — never a generic message. A private row's own name carries `OnlyYouBadge`
with `label="Private"`.

### Company picker = platform picker; a three-section application form; a paginated admin Platforms page (PRD 0010, KODI-035)

The owner: "i liked how you did the select input for platform, do the same for
company as well, same select component with same behavior." Both pickers are
now one component.

- **`components/applications/catalog-select.tsx`** is the WHOLE picker
  (`Popover` + `Command`, search, an exact-match rule, "Create "X"" → a name +
  optional URL form, `OnlyYouBadge`), extracted from what used to be
  `platform-select.tsx` alone. `platform-select.tsx` and `company-select.tsx`
  are now thin wrappers: `exactMatchReplacesCreate` is `true` for platforms
  (an exact match replaces Create, R-017/R-020 unchanged) and `false` for
  companies (a matching name is listed first but Create still shows, R-021 —
  the server only reuses a company when BOTH name and URL match). Confirming
  a URL calls `POST /companies`/`POST /platforms` from inside the picker
  itself and selects the id (201 new or 200 reused); a blank URL keeps the
  typed name as free text on that application only (`id: ""`). There is no
  more separate "Company URL" input or `onCompanyUrlBlur` — the picker owns
  the whole create flow now, for both catalogs.
- **`hooks/use-platforms.ts`** (`usePlatforms(name?)`) reads the new
  `GET /platforms?name=` for the web picker — visible platforms only, search
  substring, ordered by name. `GET /supports` is UNCHANGED and still what the
  CLI reads; the web no longer uses it for the platform picker.
- **`components/applications/form-section.tsx`** (`FormSection`, ported from
  `mynextjob/frontend/src/components/profile/form-section.tsx`) is the Card
  shell every application form section uses. `application-fields.tsx` groups
  its fields into three: "Role & company" (role+source, company+platform, job
  link, and the application date in the sheet only), "Details" (work
  mode+experience+country, currency+period, the salary trio), "Posting &
  notes" (job description, then additional notes). The sheet passes
  `as="h3"` sections (its own `SheetTitle` is the `h2`); the new-with-cv page
  keeps the default `h2` sections under its own page `h1`.
- **`components/admin/catalog-table.tsx`** is the shared admin table
  `companies-page.tsx` and `platforms-page.tsx` both render: search,
  `VisibilityFilter`, paging, Added by, Apps and Approve, plus a Status
  column only when a caller passes `onToggleActive` (companies only).
- **`/admin/platforms`** replaced `/admin/supports` (the step/feedback
  definition catalogs were already gone, R-021 — a lone "Platforms" tab is
  now the page itself) and is now PAGINATED like `/admin/companies`, with an
  `applications_count` that excludes drafts. `admin/supports/page.tsx` is a
  client-side `router.replace("/admin/platforms")` so a saved link still
  works — this is a static export, so there is no server-side rewrite.

### Profile — connected accounts (`src/components/profile/`, KODI-022, revised KODI-027)

The owner: "Keep github login but add an option in user profile to sincronize
with discord." `/profile` gained a **Connected accounts** card, above Delete
account, for Discord only (GitHub stays login-only, never a link/unlink
target).

- `connected-accounts.tsx` (`ConnectedAccounts`) is presentational and takes
  `account?: { name; avatarUrl; needsReconnect } | null` (KODI-027 — replaced
  the KODI-022 `linked: boolean`, once `GET /users/me` grew a real
  `discord: DiscordAccount | null` beyond the bare `discord_linked` flag) plus
  `onConnect`, `onDisconnect`, `isConnecting?`, `isDisconnecting?`. It still
  never takes the Discord **id** — `discordCardState(account)` derives one of
  three states, `li[data-provider="discord"][data-state="unlinked"|"linked"|
"needs_reconnect"]`:
  - **unlinked** (`account` null): badge "Not connected", "Connect Discord".
  - **linked**: `Avatar` (`AvatarImage` when `avatarUrl`, else the
    `DiscordIcon` fallback — Radix `AvatarImage` never mounts in jsdom, so a
    vitest assertion on the fallback has to read
    `[data-slot="avatar-fallback"]`, never `getByRole("img")`), a green status
    dot, badge "Discord connected", `p[data-slot="discord-account-name"]`
    reading exactly "Connected as `<name>`" (`global_name || username`, `||`
    not `??` — an empty `global_name` string still falls back), and
    "Disconnect Discord" behind an `AlertDialog` ("Cancel" / "Disconnect").
  - **needs_reconnect** (AC5/AC6, `account.needsReconnect`): the same avatar
    and name line, an amber dot, badge "Reconnect needed", a primary
    "Reconnect Discord" button wired to the **same** `onConnect` as
    "Connect Discord" (same OAuth consent flow, AC6), THEN "Disconnect
    Discord" — "Connect Discord" never renders while a connection exists,
    reconnected or not.
  - `profile-view.tsx` maps `user.discord` to the prop; `ConnectedAccounts`
    itself owns none of that derivation.
- `discord-link-notice.tsx` (`DiscordLinkNotice`, `DISCORD_LINK_STATUSES`,
  `isDiscordLinkStatus`) renders the post-redirect outcome: `linked` ("Discord
  connected. Your reports and feedback will mention you.", `role="status"`),
  `conflict` ("This Discord account is linked to another Applika account",
  `role="alert"`) or `error` ("Discord was not connected, try again",
  `role="alert"`). Assert the exact WORDS — `getByText("Discord connected")`
  also matches the card's shorter badge; scope with `exact: true` or
  `[data-slot="discord-link-notice"]`.
- `hooks/use-account-links.ts`: `useStartDiscordLink` calls
  `POST /auth/link/discord` and does a TOP-LEVEL navigation
  (`window.location.assign(authorize_url)`) on success — never an in-app
  router push, OAuth must own the tab — so there is no success toast, only a
  failure one (503 → "Discord linking is unavailable", anything else →
  `getApiError`). `useUnlinkDiscord` calls `DELETE /auth/link/discord`,
  invalidates `USER_QUERY_KEY` (now exported from `hooks/use-user.ts`) and
  toasts. `services/types/auth.ts` carries the two wire shapes
  (`AccountLinkStart`, `AccountLinkOut`).
- **`/profile`'s outcome route.** Discord's OAuth callback 307s the browser
  back to `/profile?account=discord&status=linked|conflict|error`.
  `profile-page.tsx` reads `status` via a LAZY `useState` initializer (not an
  effect — `react-hooks/set-state-in-effect`), so the notice survives the URL
  cleanup that immediately follows. An effect does the one-shot side effects
  (guarded by a `useRef` so React Strict Mode's double-invoke does not
  double-fire them): invalidate `USER_QUERY_KEY` and clear the query string
  back to `/profile`. **The clear is `window.history.replaceState(null, "",
"/profile")`, not `useRouter().replace()`** — verified against the real e2e
  stack that on this fully static export (`output: "export"`, Next 16, no
  server to resolve a transition against) `router.replace()` to the SAME
  pathname with only the query string changed is a no-op: the address bar
  keeps the original `?account=&status=` indefinitely. Driving the History
  API directly is what actually updates it. `page.tsx` wraps the page in a
  `Suspense` boundary — precedent `(protected)/cvs/editor/page.tsx` — because
  `useSearchParams` suspends and `output: "export"` fails the build otherwise.
- **E2E** (`e2e/profile-discord.spec.ts`, serial): a third seeded role,
  `discord` (`SeededRole`, `e2e-discord`), whose `discord_id` is RE-SET on
  every `scripts/e2e.sh` seed run — so the suite's own Disconnect test is
  undone by the next run. `E2E_DISCORD_USER_ID` / `E2E_DISCORD_ACCESS_TOKEN` /
  `E2E_DISCORD_REFRESH_TOKEN` are exported by `scripts/e2e.sh` alongside the
  existing `E2E_*`/`E2E_ADMIN_*` pairs. Real `discord.com` is never reached:
  the spec's `page.route("**://discord.com/**", ...)` aborts the navigation
  and asserts the ATTEMPTED authorize URL (`scope=identify guilds
guilds.members.read`, a `state` param) instead of following it. Since
  KODI-027 the linked-state test also asserts the seeded row directly:
  "Connected as E2E Discord" (the seed's `global_name`), no `<img>` (the seed
  links with no avatar, so only the `DiscordIcon` fallback renders) and no
  snowflake-shaped text anywhere in the card; the final Disconnect test reads
  back `GET /users/me` and asserts both `discord_linked: false` AND
  `discord: null`.

### Admin — Discord webhooks (`app/(protected)/admin/discord-webhooks/`, KODI-027)

The owner: "as an admin user i can configure which webhooks to send my
reports (new table to save the discord webhook url, the server id … and
multiples roles id …)". Pattern: `admin/supports/supports-page.tsx` (a thin
`page.tsx` shell over a `*-page.tsx`, no dynamic route segment — this is a
static export). Nav tab "Discord" in `components/admin/admin-nav.tsx`
(`/admin/discord-webhooks`, lucide `Webhook` icon).

- `services/types/admin.ts` carries `AdminDiscordWebhook` (`id`, `label`,
  `guild_id`, `role_ids: string[]`, `webhook_url_masked`, `created_at`,
  `updated_at`) plus the `CreateDiscordWebhook`/`UpdateDiscordWebhook` request
  shapes. **The full webhook address never reaches the client after
  creation** — the API returns only `webhook_url_masked`
  (`https://discord.com/api/webhooks/<id>/…<last 4>`), so there is no wire
  type that carries a real `webhook_url` back.
- `admin-service.ts` adds the CRUD (`getDiscordWebhooks`,
  `createDiscordWebhook`, `updateDiscordWebhook`, `deleteDiscordWebhook`) and
  `hooks/use-admin.ts` adds the matching hooks under the query key
  `["admin", "discord-webhooks"]`. The create/update hooks raise **no** error
  toast themselves — the PAGE catches the mutation's `onError` so a 409/422
  can be shown inline in the dialog (see below); only `useDeleteDiscordWebhook`
  toasts its own errors, since delete has no form to show them in.
- `discord-webhook-list.tsx` / `discord-webhook-form-dialog.tsx`
  (`ui-designer` components, composed by `discord-webhooks-page.tsx`) own the
  four list states (loading/error/empty/ready,
  `section[data-slot="discord-webhooks"][data-state]`) and the Add/Edit
  dialog layout; the page owns the query, the zod schema and the wiring.
- **The zod schema mirrors the server's own validators byte for byte**
  (`backend/app/application/validators/discord_webhook.py`): the webhook URL
  regex (`discord.com`/`discordapp.com`, `ptb`/`canary`, an optional
  `/v<n>`, a 17-20 digit webhook id, a >=20-char token), a guild/role id
  regex (17-20 digits) and the Postgres `BIGINT` ceiling
  (`9223372036854775807`) — compared as **`BigInt`, never `Number`**, since a
  20-digit numeric string already loses precision in a JS double. The five
  fixed messages ("Invalid Discord webhook URL", "Invalid Discord server
  id", "Invalid Discord role id", "A webhook may hold at most 25 role ids",
  "Label must be at most 100 characters") are copied verbatim so a client
  refusal reads exactly like the server's. `parseRoleIds` in
  `discord-webhooks-page.tsx` splits the role-ids textarea on comma, space or
  newline and dedupes by string value before validating the count.
- **Edit sends only dirty fields, and a blank URL keeps the stored one.**
  `discordWebhookToFormValues` always resets the URL field to `""` on open
  (the stored address is a secret, never pre-filled — AC9) and joins
  `role_ids` with `\n`. On submit, `handleUpdate` reads RHF's own
  `formState.dirtyFields`: `webhook_url` is sent only when dirty AND
  non-blank (so leaving it untouched, or touching and then re-blanking it,
  both keep the stored value); `guild_id`/`role_ids`/`label` are sent only
  when their own field is dirty — an untouched `role_ids` never resends the
  same list, and a dirty-but-emptied one sends `[]` (clears, per the
  server's `PATCH` contract), same for `label: null`.
- **`serverErrorFrom` never hands a non-string to `<p>{serverError}</p>`.**
  Every business-rule 409/422 on this route carries a single fixed string
  `detail` (`_NoInputEchoRoute`, backend `CLAUDE.md`, which strips FastAPI's
  own array-shaped validation errors from this router's 422s) and
  `serverErrorFrom` renders it verbatim into
  `div[role="alert"][data-slot="discord-webhook-form-error"]` — never a toast.
  A `detail` that is still an array (a raw framework-level 422 slipping past
  the router) or missing (a non-JSON 5xx body) falls back to a fixed message
  instead of the generic `getApiError`, which would hand back that same
  non-string value unguarded and either crash the render or show "undefined".
- **E2E** (`e2e/admin-discord-webhooks.spec.ts`, serial, new for KODI-027): a
  valid-FORMAT fake webhook URL and ids — the backend never calls Discord on
  save (an explicit non-goal), so no `discord.com` mock is needed at all. The
  suite adds one webhook, asserts the row shows the masked form and
  `page.content()` never contains the real token, edits its role ids without
  resending the URL (asserts the URL input reopens blank), then deletes it as
  its own cleanup — a rerun of the suite must never accumulate rows in the
  shared database. `admin-gating.spec.ts` and `smoke.spec.ts` both gained the
  `/admin/discord-webhooks` route alongside the other three admin pages.

### Admin — Jobs (`app/(protected)/admin/jobs/`, PRD 0012, KODI-049, R-033..R-035)

`/admin/jobs` (`page.tsx` shell over `jobs-page.tsx`), nav tab "Jobs" (lucide
`Search`, after Platforms) in `admin-nav.tsx`. Pattern:
`admin/discord-webhooks/`. The h1 is "Job sources".

- `services/types/admin.ts` carries `AdminJobSource` (`id`, `code`, `name`,
  `base_url`, `platform_id`, `is_enabled`, `last_run_at`, `last_run_status`
  `"ok"|"failed"|"blocked"|null`, `last_run_error`, `last_run_found`,
  `last_run_saved`, `active_jobs`). `admin-service.ts`: `getJobSources()`,
  `updateJobSource(id, {is_enabled})` (a strict bool, `extra=forbid`),
  `startJobRun()`. `use-admin.ts`: key `["admin", "job-sources"]`
  (`ADMIN_JOB_SOURCES_KEY`).
- The ui-designer components are `components/admin/job-sources-table.tsx`
  (loading/error/empty/ready, one row per source: Source | On | Last run |
  Status | Found | Saved | Listed jobs | Last error, the table scrolling in its
  own focusable region), `job-run-controls.tsx` (`JobSourcesHeader`: h1, Run
  now, the always-mounted notice live region) and `job-sources-copy.ts` (every
  string, `formatJobLastRun` in UTC, the outcome words "OK"/"Failed"/
  "Blocked"/"Not run yet"). Row hook:
  `tr[data-slot="job-source-row"][data-source-code][data-enabled]`; outcome
  hook `[data-slot="job-source-outcome"][data-status]`. "OK" is also a
  substring of "RemoteOK" — use `exact: true` or the hooks.
- **The switch PATCH is optimistic** (`useUpdateAdminJobSource`): the cache
  flips at once, the switch is `aria-disabled`/`aria-busy` with a spinner
  while its own PATCH is in flight (the page tracks `pendingIds`), and a
  failure rolls back and toasts `getApiError`. A source that is off keeps its
  last outcome; there is no "Off" status.
- **Run now** (`useStartJobRun`, no toast in the hook): the page clears the
  notice BEFORE each POST (or the same words twice are not re-announced). 202
  → toast "Run started", the list refetches, and then refetches every 3 s for
  60 s (`JOB_RUN_POLL_*`) — the API has no "running" state or end signal. 409
  → an info notice with the server's `detail` ("A run is already in
  progress"); 503 and anything else → an error notice with the `detail`
  ("Background service unavailable"), or "Could not start a run. Try again."
  when there is no string `detail`. Pending uses the KODI-048 pattern
  (`aria-disabled` + `aria-busy`, focus stays).

### Job board (`src/components/jobs/`, PRD 0012)

Ported from Ían Muliterno's `job_scrapping` branch (`e670914`, his job-card,
job-filters, job-list, job-detail-sheet, types, service and hook) onto the
KODI-047 contract. Every commit porting his logic ends with the trailer
`Co-authored-by: Ían Muliterno <iannimuliterno@gmail.com>` (R-003).

- **Routes.** `/jobs` (`jobs-page.tsx`) and `/jobs/view?id=`
  (`job-view-page.tsx`), each a Suspense shell. A 404 on `GET /jobs/{id}` (or
  no `id`) renders `JobNotListed` — its own h1 "This job is no longer listed"
  and "Back to jobs".
- **Filters live in the URL** with the SAME keys `GET /jobs` takes (`search`,
  `source`, repeated `tags`, `min_fit`, `posted_within_days`, `sort`,
  `include_dismissed`, plus `page`). `job-filters-url.ts` is the single pure
  translation: `filtersFromSearchParams` (garbage reads as the default,
  numbers clamp to the server's ranges, tags trim/dedupe/cap at 10 x 100),
  `filtersToSearchParams` (defaults OMITTED, so `/jobs` is the default view and
  a saved search normalises to its shortest URL), `sameJobFilters`,
  `normalizeJobFilters`. The page reads with `useSearchParams` and writes with
  `window.history.pushState` (a page past the end: `replaceState` to the last
  one) — never `router.replace`, a no-op here (see **Profile** below).
- **The tags TRAP.** axios serialises an array as `tags[]=a&tags[]=b`, a key
  the API ignores, so the tag filter would silently do nothing.
  `JobService.list` builds the query string itself (`jobListQuery`) from
  `filtersToSearchParams`: repeated `tags=` keys, `page`, `per_page=25`.
  `job-service.test.ts` pins the exact string.
- **Query keys** (`hooks/use-jobs.ts`): `["jobs", filters, page]`
  (`keepPreviousData`, so a filter change does not flash the skeleton) and
  `["job", id]`. `useDismissJob`/`useRestoreJob` are OPTIMISTIC: a list without
  dismissed jobs drops the job at once (total - 1), a "Show dismissed" list
  marks it, the detail flips; rollback + `getApiError` toast on failure;
  invalidate `["jobs"]` and `["job", id]` on settle.
  `useStartApplicationFromJob` invalidates `["jobs"]`, `["job"]` and
  `["application-drafts"]` and toasts nothing. `use-job-searches.ts` owns
  `["job-searches"]`; its mutations toast nothing either (the menu shows a 409
  inline). **`useCreateBaseCv`/`useUpdateBaseCv`/`useDeleteBaseCv` also
  invalidate `["jobs"]` and `["job"]`** (R-016, Plan corrections 14): a fit
  depends on the master CVs.
- **Fit words.** `FitBadge` reads `Fit 72%` (rounded, clamped 0..100) and
  never colour alone; bands strong >= 70, partial >= 40, low (neutral) below.
  The list item shows NO badge when `best_fit` is null; the detail lists one
  row per master CV, best first, and a CV missing from `fits` reads "No fit
  yet". The list shows the STORED score and the detail the LIVE one; they may
  differ until the worker recomputes. Do not "fix" that in the UI. A user with
  no master CV (`useBaseCvs()` loaded empty) gets `MasterCvInvitation`
  ("Create a master CV to see how well you fit each job", `/cvs/new`), no fit
  anywhere (the page strips `best_fit`) and a disabled "Minimum fit".
- **Draft / Applied.** `JobStatusBadge` links "Draft" to
  `/applications/new-with-cv?id=<id>` and "Applied" to
  `/applications?focus=<id>` (`jobApplicationHref`). "Start application" is
  rendered ALWAYS, beside the badge (orchestrator decision, KODI-048):
  starting again is how AC8's "offers to open the one that exists" is
  reached.
- **The start flow.** `StartApplicationFlow` (`start-application-flow.tsx`)
  is the data half of `StartApplicationDialog`, mounted once per page: master
  CVs from `useBaseCvs`, fit labels and `canTailor` from `useJob(job.id)` —
  `JobSummary` has no `description_text`, so the dialog MUST read the detail.
  "Verbatim copy" is preselected; "Tailor by keywords" is NOT RENDERED for a
  blank description (R-026), never just disabled. No CV picked sends
  `{job_id}`; a CV sends `{job_id, base_cv_id, tailoring}`; both always add
  `application_date: localCalendarDay()` (KODI-050), so the draft carries the
  user's local day, never the server's UTC one. Success
  `router.push("/applications/new-with-cv?id=<id>&step=cv")` and the dialog
  stays pending until the page changes. A 404/422 `detail` shows INLINE
  (`data-slot="start-application-error"`, e.g. "This job has no title to start
  from"); a 409 refetches the job and offers "Open draft" / "Open
  application". The success signal — Start, "Tailor by keywords", "Create
  draft" = 3 clicks after the CV is picked — is counted in
  `jobs-page.test.tsx`.
- **Saved searches** (`SavedSearchesMenu`, R-031/R-032): apply pushes the
  saved filters through `normalizeJobFilters` (the server returns them FULL,
  defaults included); save sends `normalizeJobFilters(current)` — only
  `JobFilters` keys, never `page` (an unknown key is a 422). At 10 "Save
  current search" is disabled with "You can keep up to 10 saved searches". A
  4xx `detail` resolves into the dialog inline. No notification control
  exists anywhere, by design (R-032).
- **Sources.** No user route lists them: `JOB_SOURCES` in
  `services/types/jobs.ts` fixes Himalayas and RemoteOK (Plan corrections 18).
- **Accessible-name collisions** for e2e (substring match): "Dismiss" /
  "Dismissed", "Draft" / "Open draft", nav "Jobs" / "Back to jobs", "Rename" /
  "Rename <name>". Use `exact: true`. A dialog has its own sr-only "Close", so
  the conflict panel's "Close" is not unique by name.

### Date Inputs

**`DatePickerInput` for a day; `MonthYearInput` for a CV month+year, which never
has a day.**

**Always use `<DatePickerInput>` from `src/components/ui/date-picker.tsx`** — never `<input type="date">`.

The component avoids browser timezone off-by-one issues by parsing dates as local time. It accepts `value` as a `Date | string | undefined` and returns a `Date` via `onChange`.

**`<MonthYearInput>`** (`src/components/ui/month-year-input.tsx`) is the CV
period control. It is a MASKED TEXT input, not a calendar and not a pair of
selects: `MM/yyyy` on screen, ISO `YYYY-MM` through a value-callback
`onChange`, `""` while the value is empty, partial or impossible. One `<input>`
is deliberate — `getByLabel("Start").fill("02/2023")` has to drive it — and no
`Date` is ever constructed, so there is no timezone off-by-one. A half-typed
value is held on screen verbatim while it emits `""`; the draft/prop sync is
guarded on BOTH conditions, and simplifying it to one either wipes the draft or
loops on an unparseable stored value.

### UI Components

Built on shadcn/ui (Radix UI + Tailwind, `new-york` style, the unified `radix-ui`
package). Components live in `src/components/ui/`. Use `cn()` from `src/lib/utils`
for conditional class merging.

Tailwind 4 is CSS-first: every token lives in `@theme` in `src/app/globals.css`.
There is no `tailwind.config.ts`.

**`cn()` and custom utilities.** `shadow-card` and `shadow-elevated` are custom
`@utility` rules, so stock tailwind-merge does not know they are shadows and
would keep BOTH sides of an override — leaving the loser to win on stylesheet
order. `src/lib/utils.ts` registers them in the `shadow` group via
`extendTailwindMerge`. **Any new custom `@utility` that competes with a built-in
Tailwind group must be registered there too**, or overriding it will silently do
nothing.

`h-viewport`, `min-h-viewport`, `max-h-scrollport` and
`max-h-editor-scrollport` (see **Stacking contract**) are registered the same
way, in the `h`, `min-h` and `max-h` groups. The last two are SIBLINGS in one
group on purpose: leave either out and `cn("max-h-scrollport",
"max-h-editor-scrollport")` keeps both, and the winner is whichever `@utility`
`globals.css` declares last rather than the one the caller wrote last.

Registering a utility in one group also takes it OUT of the group it was falling
through to. `shadow-card`/`shadow-elevated` used to land in `shadow-color`, so a
`shadow-<color>` class no longer conflicts with them. Nothing in `src/` uses a
shadow-color class today; if one is ever added, a later `shadow-card` will not
override it.

**`SheetContent` props (applika-only, kept across the new-york regeneration):**

- `hideClose` — suppress the default X button when the panel owns its own
  Cancel/Submit footer.
- `size?: "form" | "wide" | "nav"` — the width/padding preset, default
  `"form"`. `"form"` is `w-full p-6 sm:max-w-2xl`, the wide form panel most
  sheets in the app use; `"wide"` (KODI-036, AC6, R-039) is the same panel up
  to `sm:max-w-4xl` — today only the application create/edit sheet
  (`application-form-sheet.tsx`) asks for it; `"nav"` is
  `w-[17rem] gap-0 p-0 sm:max-w-[17rem]`, the mobile navigation panel. The
  preset is applied AFTER `className`, so a caller cannot widen or pad a sheet
  from the outside — add a preset here instead.
- **A sheet's title can be shown larger than the default** by passing a class
  straight to `SheetTitle` (it forwards `className`, unlike the width preset
  above) — `application-form-sheet.tsx` passes `font-display text-xl` (KODI-036,
  AC7, R-040) on top of the base `font-semibold`. The words themselves ("New
  Application" / "Edit Application") are unchanged — `e2e/cv-builder.spec.ts`'s
  "Edit Application" assertion still matches them.

**`components/ui/radio-group.tsx`** (KODI-048) is the shadcn `new-york`
RadioGroup with ONE applika-only change: the unchecked ring is
`border-muted-foreground`, because the stock `border-input` is 1.3:1 against
the card and fails the 3:1 non-text contrast. Keep it when regenerating. Its
`RadioGroupItem` takes its name from `aria-labelledby` in the job start
dialog; drive it with a click or `.check()` in Playwright (arrow keys move
focus but do not check a Radix radio there).

**`components/ui/tabs.tsx`** is the shadcn `new-york` Tabs, unmodified from the
registry except for one applika-only `variant` on `TabsList`/`TabsTrigger`:
`"line"` — a full-width bar on a hairline (`border-b border-border`) with the
active tab's underline covering it, instead of the default `"default"`'s
pill-shaped `bg-muted` group. `applications-page.tsx`'s Applications | Drafts
tabs (see **Application drafts** above) is `variant="line"`'s first caller;
default a new caller to it unless it specifically wants the pill look
`VisibilityFilter` (a hand-rolled segmented control, not this component) uses.

**Fonts.** `font-display` is the heading family (Inter, self-hosted via
`next/font`); `font-numeric` is the `@utility` in `globals.css` that switches a
run of digits to JetBrains Mono with tabular, slashed-zero figures. Use
`font-numeric` for headline metrics, counts and table numbers so columns line
up; use `font-display` for headings and titles. Never mix the two on one element.

**An `overflow: hidden` on a STATIC ancestor clips nothing.** An absolutely
positioned element whose containing block lies outside that ancestor escapes
the clip entirely — it is left out of `body`'s scrollable overflow, counted in
`<html>`'s, and stretches the DOCUMENT to its own offset. That is a second
scrollbar over a page of dead background, and it is why the shell root
(`app-shell.tsx`) and `CvSelectField`'s wrapper carry `relative`: **Radix
`Select` renders a visually hidden native `<select>` at `position: absolute`**
beside every trigger, and nothing positioned it. `position: relative` with
`z-index: auto` creates NO stacking context, so the table below is untouched —
but a `z-*`, `isolate`, `transform` or `filter` on the shell root WOULD create
one and trap the `z-50` portal layer under the shell. Any new full-viewport
shell needs the same `relative`.

**Stacking contract.** Layers, lowest first. Keep new chrome inside it:

| z      | layer                               | members                                                               |
| ------ | ----------------------------------- | --------------------------------------------------------------------- |
| `z-30` | in-column sticky chrome             | the shell `Header`, `CvEditorFooter`                                  |
| `z-40` | fixed/sticky page chrome, no portal | `LandingHeader`, `CookieConsent`                                      |
| `z-50` | the Radix portal layer              | Sheet overlay/content, Dialog, DropdownMenu, Popover, Tooltip, Sonner |

`CookieConsent` MUST stay at `z-40`. It is rendered after `children` in
`root-providers.tsx`, so at `z-50` it ties with the sheet and wins on document
order — which floated it over the open mobile navigation menu.
`e2e/shell-responsive.spec.ts` hit-tests this with real geometry.

**`CookieConsent` reserves space instead of floating.** It is a FULL-WIDTH bar
pinned to the bottom of the viewport. While it is mounted it publishes its
MEASURED height (a `ResizeObserver`, so a three-line wrap at 320px still fits)
to `--cookie-notice-height` on `<html>`, and it REMOVES the property when it
unmounts — a dismissed notice reserves nothing. `globals.css` spends that
property in two places: `body` takes it as `padding-bottom` and
`scroll-padding-bottom`, so a flowing document ends above the bar; and the
`h-viewport` / `min-h-viewport` / `max-h-scrollport` /
`max-h-editor-scrollport` utilities subtract it.
**Use those instead of `h-dvh`, `h-screen` or `min-h-screen` on any
full-viewport shell** — the padding and the subtraction add up to exactly one
viewport, so reserving space never introduces a scrollbar. The consequence, and
the reason the notice stopped being a bottom-right card: it can NO LONGER cover
an in-page `sticky bottom-0` footer — the CV editor's submit row — at any
breakpoint. The `z-50` nav sheet is `fixed inset-y-0`, so it still overlaps the
bar's strip and still paints over it.

**`h-viewport` is the shell; `max-h-scrollport` is the `<main>` inside it.**
They differ by `--app-header-height`, because the shell `Header` is `main`'s
SIBLING and sits above it. Anything sized to fill the SCROLLING region takes
`max-h-scrollport` — **unless it shares that scrollport with a `sticky
bottom-0` footer, in which case it takes `max-h-editor-scrollport`; see the
paragraph below, and note that the CV editors' sticky preview pane is that
case.** Reaching for
`100dvh` there measures the wrong box, overshoots by exactly the header, and
ends in a hand-tuned constant subtracting the difference back off; that is the
bug KODI-009 fixed in the CV preview. `--app-header-height` is declared once in
`globals.css` and `header.tsx` sizes itself from it, so the two cannot drift.
It is only true at `md` and up, where the header is one row — which is also the
only place anything sticks.

**`max-h-editor-scrollport` is the scrollport minus the CV editor's own submit
row**, and it is what a column sharing a scrollport with a `sticky bottom-0`
footer must take. `CvEditorFooter` (`base-cvs/cv-editor-footer.tsx`) is that
row — shared by `BaseCvEditor` and `TailoredCvEditor` so the two cannot drift —
and it is the SECOND bottom-anchored element in the app that reserves its own
height. Like `CookieConsent` it measures itself with a `ResizeObserver`,
publishes `--cv-editor-footer-height` on `<html>` while mounted, and REMOVES the
property on unmount — an editor off screen reserves nothing, and a read-only CV
copy with no `actions` mounts no footer and reserves nothing either. Measured
rather than hardcoded because the row is `flex-wrap` and its `actions` slot
varies by caller; every width the e2e suite exercises lands on one 61px row, so
the wrap is a capacity of the layout rather than something the suite
demonstrates — which is the point, since a constant would be right until the
first caller that wraps.

**It assumes ONE mounted editor.** `--cv-editor-footer-height` is a single
global slot with last-writer-wins and first-unmounter-clears semantics, so two
`CvEditorFooter`s on screen at once would leave it wrong or cleared while one is
still visible. That is unreachable today — one editor per route, and
`TailoredCvEditor`'s two branches are mutually exclusive — but unlike
`CookieConsent`, which is a singleton by construction, this is a shared
component anyone could drop in twice. Keep it to one per screen.

**The two reservations compose; they do not double-count.**
`--cookie-notice-height` is chrome pinned to the VIEWPORT, OUTSIDE `main`, and
is already reserved by `body`'s `padding-bottom`. `--cv-editor-footer-height` is
chrome pinned INSIDE `main`, which `body` knows nothing about. They subtract
different things, so `max-h-editor-scrollport` takes both, once each, and
collapses to exactly `max-h-scrollport` when no editor is mounted (the property
is unset and the `0px` fallback applies). Drop either subtraction and something
lands under something: without the cookie one the pane runs past the bar,
without the footer one the pane's last band — the preview's `<figcaption>`,
carrying the layout notice — ends UNDER the submit row. That was the KODI-009
defect and it was total at `md` and up: on `/cvs/editor?id=` the export button's
own copy of the notice survived in the footer, but `/cvs/new` has no export
button, so the caption was the ONLY copy on screen and none of it was visible.
`e2e/cv-builder.spec.ts` hit-tests the caption's own centre on BOTH routes with
`elementFromPoint` — jsdom reports every height as zero, so the geometry is not
provable anywhere else.

### App shell

Every signed-in page renders inside `AppShell`
(`src/components/layout/app-shell.tsx`), which owns the mobile-menu and feedback
state and hoists a SINGLE `FeedbackDialog`. It renders `CliPromoBanner` and the
content container itself, so no page component renders one — including the
pages that do NOT want it.

- **The width opt-out lives in `src/components/layout/content-width.ts`**, not
  as a prop, and comes in TWO forms. The container carries
  `data-slot="app-content"` and `data-width="full"|"reading"` — assert on
  that, never on the classes.
  - **By PATH**, for a route that is full width in every state:
    `isFullWidthPath(activePath)` checks `FULL_WIDTH_PATHS`, today
    `/cvs/new` and `/cvs/editor` — the owner: "also, use the full page width
    for this page" (KODI-008). Matched on the same `activePath` the nav is
    matched on, tolerates the trailing slash the static export serves, and is
    deliberately kept OUT of `nav.ts`: these are not nav entries, and
    `PRIMARY_NAV` is pinned at eight by `e2e/shell-responsive.spec.ts`.
  - **By CONTENT**, for a route that is full width only while one surface is
    on screen: `/applications/cv` left `FULL_WIDTH_PATHS` with KODI-017 — the
    owner: "only full width when we have a cv copy to the application" — and
    the page instead renders `<FullWidthContent />` (a component that renders
    `null`) from the SAME branch as the surface that wants the width, so the
    two mount and unmount together. `AppShell` provides a
    `FullWidthRequestProvider`; `FullWidthContent` asks it, in a
    `useLayoutEffect` so the shell re-renders BEFORE paint — the surface never
    shows a frame in the reading column. The request is COUNTED, not a
    boolean (`useFullWidthRequests`): React Strict Mode remounts every effect,
    and one marker leaving must not release the width another still holds.
    `application-cv-page.tsx` renders it ONLY in its editor branch (both the
    editable and the read-only editor — `readOnlyReason` does not branch the
    `return` there, so one marker covers both); the picker, in every one of
    its states (loading, error, empty, list, read-only), and every state
    before it (no application, loading, error) stay in the reading column.
    `FullWidthContent` is a no-op — renders `null`, requests nothing — when
    mounted outside `AppShell`.
  - `isFullWidthPath` and `FullWidthContent` compose: `isFullWidth =
isFullWidthPath(activePath) || fullWidth.requested`.
- The opt-out only works because the container is rendered HERE. A page that
  rendered its own would cap the width again from the inside.

- Nav entries live in `src/components/layout/nav.ts`. `navItemsFor(isAdmin)`
  appends the `/admin` entry, which is deliberately kept OUT of `PRIMARY_NAV` so
  a non-admin render can never leak it. `isNavItemActive` matches `exact` items
  on the pathname only, and everything else on `href` or `href + "/"` — the
  trailing slash is what stops `/reports` lighting up a `/report` entry.
- The ACTIVE entry is marked with `aria-current="page"` and nothing else.
  Assert on that, never on a class.
- **`md` (48rem) is the only breakpoint.** At or above it: a fixed `w-60` rail
  and a one-row `h-14` header, with the account menu in the rail footer
  (`variant="card"`). Below it: the rail is hidden, the nav opens in a
  `Sheet side="left" size="nav"` named "Navigation", and the header wraps to two
  rows with the account menu in it (`variant="avatar"`).
- `AppShell` has a `matchMedia("(min-width: 48rem)")` effect that force-closes
  the sheet on a resize past `md`. Do not remove it: without it Radix keeps focus
  trapped and body scroll locked behind an `md:hidden` panel.
- Below `md` the account menu is mounted TWICE (header and sheet). Scope test
  locators by container or Playwright's strict mode will fail.
- Accessible names the tests depend on: `Open navigation menu`,
  `Close navigation menu`, `Applika.dev home`, the `Primary` navigation
  landmark, and `Open account menu` — which the `card` variant extends to
  `Open account menu for <username>`, because the username is its VISIBLE label
  and WCAG 2.5.3 requires the accessible name to contain it. Playwright's
  `getByRole(..., { name })` is a substring match, so both variants match
  `"Open account menu"`; Testing Library's is exact, so a vitest locator needs
  the full string or a regex.
- The group divider (`System`) is NOT `aria-hidden`: with the old amber
  treatment gone it is the only thing marking the Admin entry as privileged.
  Grouped entries point at it with `aria-describedby`, which describes without
  renaming — `admin-gating.spec.ts` asserts the name is exactly `Admin`.

---

## Key Files

| File                                              | Purpose                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/services/services.ts`                        | Service DI container (single import point for all API calls)                          |
| `src/lib/api-client.ts`                           | Axios instance with cookie auth (`withCredentials`)                                   |
| `src/lib/query-client.ts`                         | React Query configuration                                                             |
| `src/contexts/auth-context.tsx`                   | Auth state + polling-based token refresh                                              |
| `src/contexts/supports-context.tsx`               | Shared lookup data (platforms only — steps/feedbacks removed, R-021)                  |
| `src/components/layout/root-providers.tsx`        | Root-level providers (QueryClient, Theme, Auth, Tooltip, Sonner)                      |
| `src/components/layout/protected-providers.tsx`   | Protected-route providers (nested AuthProvider)                                       |
| `src/components/layout/app-shell.tsx`             | Signed-in shell: rail, header, mobile sheet, feedback dialog                          |
| `src/components/layout/nav.ts`                    | Nav entries, `navItemsFor()` admin filter, `isNavItemActive()`                        |
| `src/components/layout/sidebar.tsx`               | Rail body: brand, nav, account menu (rail AND mobile sheet)                           |
| `src/components/layout/sidebar-nav.tsx`           | Nav entry list; owns `aria-current="page"`                                            |
| `src/components/layout/header.tsx`                | Shell header: menu trigger, cycle selector, agenda, theme                             |
| `src/components/layout/user-menu.tsx`             | Account menu (`card` in the rail, `avatar` in the header)                             |
| `src/app/globals.css`                             | ALL design tokens (`@theme`) and `@utility` definitions                               |
| `src/hooks/use-applications.ts`                   | Application list, client-side filtering, CRUD mutations                               |
| `src/hooks/use-base-cvs.ts`                       | Master CV list + the `base-cvs` cache key every write invalidates                     |
| `src/components/base-cvs/types.ts`                | Master CV vocabulary (`BaseCv`, `CvFormValues`, `BASE_CVS_MAX`)                       |
| `src/components/base-cvs/cv-document-blocks.tsx`  | The typeset CV's leaves, its pure helpers and `buildCvDocumentBlocks`                 |
| `src/components/base-cvs/cv-page-sheet.tsx`       | A4 geometry, the page-indicator words, `CvPageStack` / `CvPageSheet`                  |
| `src/components/base-cvs/use-cv-page-flow.ts`     | `distributeCvBlocks` (pure) and the only code that measures the preview               |
| `src/components/layout/content-width.ts`          | `FULL_WIDTH_PATHS` (by path) + `FullWidthContent`/`useFullWidthRequests` (by content) |
| `src/components/base-cvs/base-cv-schema.ts`       | Master CV zod schema and the form/wire translations                                   |
| `src/components/tailored-cvs/types.ts`            | CV copy vocabulary and its on-screen copy constants                                   |
| `src/hooks/use-tailored-cv.ts`                    | CV copy query + the `tailored-cvs` key every write invalidates                        |
| `src/components/base-cvs/export-cv-button.tsx`    | The PDF export affordance + the "not the final layout" notice                         |
| `src/components/base-cvs/cv-editor-footer.tsx`    | The editors' sticky submit row; owns `--cv-editor-footer-height`                      |
| `src/lib/pdf-download.ts`                         | `downloadBlob`, and the slug rule mirrored from the server                            |
| `src/lib/blob-error.ts`                           | `getBlobApiError` — `getApiError` for a `responseType: "blob"`                        |
| `src/components/ui/date-picker.tsx`               | Timezone-safe date picker (use instead of `<input type="date">`)                      |
| `src/components/ui/month-year-input.tsx`          | Masked CV month+year field (`MM/yyyy` in, ISO `YYYY-MM` out)                          |
| `src/lib/month-year.ts`                           | The one ISO `YYYY-MM` <-> `MM/yyyy` conversion and the mask                           |
| `src/components/timeline/timeline-types.ts`       | Timeline vocabulary: event/interview types, 20 currencies, periods                    |
| `src/components/timeline/timeline-options.ts`     | Presentation config, `TIMELINE_STAGES`, `stageLabel()`/`stageShortLabel()`            |
| `src/components/timeline/timeline-section.tsx`    | Data-wired timeline region mounted in `application-item.tsx`                          |
| `src/hooks/use-timeline.ts`                       | Timeline query key factory + `useTimeline(applicationId)`                             |
| `src/components/applications/finalize-dialog.tsx` | Close-application outcome picker (R-032), reversible confirmation                     |

---

## Docker

The frontend is built as a static export and served via Nginx:

- **Dockerfile**: `docker/Dockerfile` — multi-stage build (Node 22 + Nginx 1.27, non-root user)
- **Nginx config**: `docker/nginx.conf` — SPA routing, gzip, static asset caching
- **Build arg**: `API_BASE_URL` is baked into the JS bundle at build time via `NEXT_PUBLIC_API_BASE_URL`

```bash
docker compose up --build
```

The `docker-compose.yml` defaults `API_BASE_URL` to `http://127.0.0.1/api` if not set in the environment.

---

## Tooling

- **Git**: plain `git` via the shell. There is no Git MCP in this workspace.
  Commit after each logical unit of work using conventional commits with the
  ticket key after the scope: `feat(frontend): KODI-004 ...`. Branch from
  `develop` and open the PR against `develop`
  (`.claude/rules/branches-and-commits.md`).
- **shadcn/ui**: add or compose primitives through the CLI and fetch the
  canonical docs before using a pattern. Do not hand-roll what the registry has.
- **Context7 MCP** (when available): look up docs for Next.js, React Query, Zod,
  react-hook-form and shadcn/ui before guessing API signatures.

---

## Backend Context

The backend is a FastAPI app in `../backend/` with its own `CLAUDE.md`. It runs on port 8000. Auth uses HTTP-only JWT cookies (`__access`). GitHub OAuth is the only login method. See `../backend/CLAUDE.md` for backend-specific guidance.
