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

`pnpm lint` currently emits warnings on pre-existing files (React Compiler vs.
`react-hook-form`'s `watch()`, and an unused local in `step-form-dialog.tsx`).
Warnings do not fail the gate; errors do. Do not add new ones.

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

`?id=` is the APPLICATION's id, never the copy's. There is no nav entry: the
route is reached from the CV link on an application row, and
`e2e/shell-responsive.spec.ts` pins `PRIMARY_NAV` at seven entries.

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

### State Management

- **Server state**: TanStack React Query with a 5-minute stale time and `retry: false`
- **Auth state**: `AuthContext` (wraps the entire app via `RootProviders`)
- **Supports data**: `SupportsContext` — shared lookup data (platforms, step definitions, feedback definitions) available via `useSupports()`
- **Feature state**: custom hooks in `src/hooks/` (e.g., `useApplications`, `useApplicationSteps`)

Mutations always call `queryClient.invalidateQueries()` on success and show a `sonner` toast on error.

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
- The preview pane caps its own height at `md` and up with an inline
  `calc(100dvh - var(--cookie-notice-height,0px) - 12rem)` — the same
  expression `h-viewport` uses, so the cookie bar's strip is subtracted here
  too. There is **no `max-h-viewport` utility**; adding one is a design-system
  change (`globals.css` + the tailwind-merge registration), not a drive-by.
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

- `export-cv-button.tsx` is the whole affordance and is PRESENTATIONAL: no hook,
  no service, no axios. It takes `onExport` and `isExporting` and it has NO
  `disabled` prop — only a render already in flight locks it, so no caller can
  take the download away from a finalized or archived CV copy, or from a copy
  whose master CV was deleted.
- It mounts in the editors' `actions` slot: `/cvs/editor?id=` (never `/cvs/new`
  — the server typesets the STORED CV, so there is nothing to render until it
  has been saved once) and `/applications/cv?id=` in BOTH modes.
- The layout notice (`CV_PDF_LAYOUT_NOTICE` in `base-cvs/types.ts`) is said
  TWICE on every CV screen: `CvDocumentPreview` is a `<figure>` whose
  `<figcaption>` carries it, and the button carries its own copy wired with
  `aria-describedby`. Do NOT add a third at a call site. Assert the WORDS.
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

The module mirrors `base-cvs/` rather than forking it:

- `types.ts` is the vocabulary (`TailoredCv`, `BaseCvOption`,
  `TailoredCvReadOnlyReason`) and owns the on-screen copy constants
  (`TAILORED_CV_READ_ONLY_COPY`, `TAILORED_CV_SOURCE_DELETED`). Assert the
  WORDS, never the classes. `src/services/types/tailored-cv.ts` re-exports it.
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
- `was_ai_generated` and `adjustments` exist on the wire type and render
  NOWHERE. Nothing in this product generates a CV, and no UI may suggest it
  will.

**Read-only is the application's state, never the copy's.** The page derives
`readOnlyReason` as `application.finalized ? "finalized" : isViewingPastCycle ?
"archived" : null` and both the picker and the editor take it: the banner goes
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

`h-viewport` and `min-h-viewport` (see **Stacking contract**) are registered the
same way, in the `h` and `min-h` groups.

Registering a utility in one group also takes it OUT of the group it was falling
through to. `shadow-card`/`shadow-elevated` used to land in `shadow-color`, so a
`shadow-<color>` class no longer conflicts with them. Nothing in `src/` uses a
shadow-color class today; if one is ever added, a later `shadow-card` will not
override it.

**`SheetContent` props (applika-only, kept across the new-york regeneration):**

- `hideClose` — suppress the default X button when the panel owns its own
  Cancel/Submit footer.
- `size?: "form" | "nav"` — the width/padding preset, default `"form"`.
  `"form"` is `w-full p-6 sm:max-w-2xl`, the wide form panel every sheet in the
  app uses; `"nav"` is `w-[17rem] gap-0 p-0 sm:max-w-[17rem]`, the mobile
  navigation panel. The preset is applied AFTER `className`, so a caller cannot
  widen or pad a sheet from the outside — add a preset here instead.

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
| `z-30` | in-column sticky chrome             | the shell `Header`                                                    |
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
`h-viewport` / `min-h-viewport` utilities subtract it. **Use those two instead
of `h-dvh`, `h-screen` or `min-h-screen` on any full-viewport shell** — the
padding and the subtraction add up to exactly one viewport, so reserving space
never introduces a scrollbar. The consequence, and the reason the notice stopped
being a bottom-right card: it can NO LONGER cover an in-page `sticky bottom-0`
footer — the CV editor's submit row — at any breakpoint. The `z-50` nav sheet is
`fixed inset-y-0`, so it still overlaps the bar's strip and still paints over
it.

### App shell

Every signed-in page renders inside `AppShell`
(`src/components/layout/app-shell.tsx`), which owns the mobile-menu and feedback
state and hoists a SINGLE `FeedbackDialog`. It renders `CliPromoBanner` and the
content container itself, so no page component renders one — including the
pages that do NOT want it.

- **The width opt-out lives in `src/components/layout/content-width.ts`**, not
  as a prop. `isFullWidthPath(activePath)` picks `w-full` over
  `mx-auto max-w-6xl`, and `FULL_WIDTH_PATHS` is the CV editing routes
  (`/cvs/new`, `/cvs/editor`, `/applications/cv`) — the owner: "also, use the
  full page width for this page". It is matched on the same `activePath` the
  nav is matched on, tolerates the trailing slash the static export serves, and
  is deliberately kept OUT of `nav.ts`: these are not nav entries, and
  `PRIMARY_NAV` is pinned at seven by `e2e/shell-responsive.spec.ts`.
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

| File                                             | Purpose                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/services/services.ts`                       | Service DI container (single import point for all API calls)            |
| `src/lib/api-client.ts`                          | Axios instance with cookie auth (`withCredentials`)                     |
| `src/lib/query-client.ts`                        | React Query configuration                                               |
| `src/contexts/auth-context.tsx`                  | Auth state + polling-based token refresh                                |
| `src/contexts/supports-context.tsx`              | Shared lookup data (platforms, steps, feedbacks)                        |
| `src/components/layout/root-providers.tsx`       | Root-level providers (QueryClient, Theme, Auth, Tooltip, Sonner)        |
| `src/components/layout/protected-providers.tsx`  | Protected-route providers (nested AuthProvider)                         |
| `src/components/layout/app-shell.tsx`            | Signed-in shell: rail, header, mobile sheet, feedback dialog            |
| `src/components/layout/nav.ts`                   | Nav entries, `navItemsFor()` admin filter, `isNavItemActive()`          |
| `src/components/layout/sidebar.tsx`              | Rail body: brand, nav, account menu (rail AND mobile sheet)             |
| `src/components/layout/sidebar-nav.tsx`          | Nav entry list; owns `aria-current="page"`                              |
| `src/components/layout/header.tsx`               | Shell header: menu trigger, cycle selector, agenda, theme               |
| `src/components/layout/user-menu.tsx`            | Account menu (`card` in the rail, `avatar` in the header)               |
| `src/app/globals.css`                            | ALL design tokens (`@theme`) and `@utility` definitions                 |
| `src/hooks/use-applications.ts`                  | Application list, client-side filtering, CRUD mutations                 |
| `src/hooks/use-base-cvs.ts`                      | Master CV list + the `base-cvs` cache key every write invalidates       |
| `src/components/base-cvs/types.ts`               | Master CV vocabulary (`BaseCv`, `CvFormValues`, `BASE_CVS_MAX`)         |
| `src/components/base-cvs/cv-document-blocks.tsx` | The typeset CV's leaves, its pure helpers and `buildCvDocumentBlocks`   |
| `src/components/base-cvs/cv-page-sheet.tsx`      | A4 geometry, the page-indicator words, `CvPageStack` / `CvPageSheet`    |
| `src/components/base-cvs/use-cv-page-flow.ts`    | `distributeCvBlocks` (pure) and the only code that measures the preview |
| `src/components/layout/content-width.ts`         | `FULL_WIDTH_PATHS` — which routes skip the reading column               |
| `src/components/base-cvs/base-cv-schema.ts`      | Master CV zod schema and the form/wire translations                     |
| `src/components/tailored-cvs/types.ts`           | CV copy vocabulary and its on-screen copy constants                     |
| `src/hooks/use-tailored-cv.ts`                   | CV copy query + the `tailored-cvs` key every write invalidates          |
| `src/components/base-cvs/export-cv-button.tsx`   | The PDF export affordance + the "not the final layout" notice           |
| `src/lib/pdf-download.ts`                        | `downloadBlob`, and the slug rule mirrored from the server              |
| `src/lib/blob-error.ts`                          | `getBlobApiError` — `getApiError` for a `responseType: "blob"`          |
| `src/components/ui/date-picker.tsx`              | Timezone-safe date picker (use instead of `<input type="date">`)        |
| `src/components/ui/month-year-input.tsx`         | Masked CV month+year field (`MM/yyyy` in, ISO `YYYY-MM` out)            |
| `src/lib/month-year.ts`                          | The one ISO `YYYY-MM` <-> `MM/yyyy` conversion and the mask             |

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
