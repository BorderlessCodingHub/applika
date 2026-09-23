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

**`/applications/cv?id=` is the reading column while it shows the picker, and
full width only once it shows the editor (KODI-017)** — see **App shell**
below for the mechanism. `/cvs/new` and `/cvs/editor` stay full width in every
state, path-based, unchanged.

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
- **Supports data**: `SupportsContext` — shared lookup data (platforms only, since PRD 0008/ADR 0012: step and feedback definitions are gone, R-021) available via `useSupports()`
- **Feature state**: custom hooks in `src/hooks/` (e.g., `useApplications`, `useTimeline`)

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
- `was_ai_generated` and `adjustments` exist on the wire type and render
  NOWHERE. Nothing in this product generates a CV, and no UI may suggest it
  will.

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
    `PRIMARY_NAV` is pinned at seven by `e2e/shell-responsive.spec.ts`.
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
