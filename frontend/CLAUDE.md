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
new form (see the timeline event form below for the pattern).

### E2E

Playwright drives the REAL stack — the built API image, the built static
frontend behind nginx, a real Postgres migrated with `alembic upgrade head` and
a real Redis. Nothing is mocked, and there is no `webServer` block.

```bash
./scripts/e2e.sh                           # from frontend/: up -> seed -> test -> down
./scripts/e2e.sh e2e/smoke.spec.ts         # args are forwarded to `playwright test`
KEEP_STACK=1 ./scripts/e2e.sh              # leave the stack up to debug
```

A failed run saves the API and fake Borderless logs to
`test-results/e2e-stack.log` before teardown (CI uploads `test-results/` on
failure) and prints the last API lines.

`pnpm e2e` on its own will NOT work: `e2e/support/auth.ts` needs the `E2E_*`
variables that `frontend/scripts/e2e.sh` exports after seeding the real users. The suite
runs serially (`workers: 1`) against one shared real database, so specs must be
read-only or clean up after themselves.

**Languages in E2E.** Every spec runs in an `en-US` browser
(`playwright.config.ts`); `e2e/language.spec.ts` (serial) is the only one
with `test.use({ locale: "pt-BR" })`. It proves: a pt browser gets Portuguese
with `html[lang="pt-BR"]` and no cookie written; the switcher on `/`,
`/cookie-policy` (and its `NEXT_LOCALE` row), `/login`, `/cli/code`; EN writes
`NEXT_LOCALE=en` (`Path=/`, `SameSite=Lax`, about one year) and survives a
reload and `loginAs`; BR in the header switches `/applications` in place (same
URL, no `framenavigated`, a `window` marker and a half-typed search survive);
JOB-1004 and JOB-1003 (`params.max`) in Portuguese in the saved-search
dialog (it tops e2e-user up to 10 saved searches through the API while the
dialog is open, and deletes every `lang-e2e*` search before, after and in
`afterAll`); `/admin` and `/admin/features` in Portuguese; a garbage cookie
loses to the browser language (pt and en); no sideways scroll at 320px on
landing, login and signed-in pages, both languages. **The pt-BR sweep** reads
`smoke.spec.ts`'s `PAGES` rows from the file (a route added there is swept
with no edit) and opens each in a pt context as its first visitor; it polls
until no visible text node, and no visible `aria-label`/`placeholder`/
`title`/`alt`, equals an `en` message whose `pt-BR` twin differs. Excluded:
messages with ICU arguments or tags, words that are also a `pt-BR` value,
brand names and endonyms, and elements under a non-Portuguese `lang` (the
"English" radio), and every string of the page's 2xx JSON API answers (data
is shown as sent and can equal a message: a job's `location_text` "Europe"
is the `en` timezone region; 4xx bodies are never excluded, so a raw `detail`
on screen still fails; the legacy `steps`/`feedbacks` lists of `/supports`,
which the web never shows, are not collected).

**Devices in E2E.** The seed also opens a `cli_device` session for
`e2e-user` named "e2e-cli"; `frontend/scripts/e2e.sh` exports its tokens as
`E2E_CLI_ACCESS_TOKEN` / `E2E_CLI_REFRESH_TOKEN`, and
`e2e/support/auth.ts`'s `cliBearerHeader()` is the `Authorization: Bearer`
value the CLI would send. `e2e/devices.spec.ts` (serial): the Devices tab
lists "This device" and "e2e-cli", Revoke (Cancel first) moves it to Ended and
the same Bearer then gets 401 from `GET /users/me` — so **"e2e-cli" is dead
for the rest of the run**; nothing after it may use `cliBearerHeader()`. It
never revokes e2e-user's web session (every later spec signs in with it);
its "Sign out all other devices" step runs only once "e2e-cli" is gone, so
the one other active session it ends is the device grant it made itself. Then
`POST /auth/device/code` → `verification_uri_complete` (`:8180/device?code=`)
→ Approve → the device grant on `POST /auth/token` is 200 after waiting out
`interval` (polling sooner is `slow_down`) and the row is listed; a signed-out
`/device?code=` → `/login` → `loginAs` + `/dashboard` lands back on `/device`
with the code filled in; "Sign out all other devices" ends the granted
session (its Bearer gets 401) and keeps "This device"; `/cli/code?code=&state=`
shows `code#state` (in its desktop tree); last, at 390×844, a new code
walks the DeviceSignIn board: code → request with its warning note →
Approve in the action bar → the outcome and "See your devices". That code
is never redeemed, so it opens no session.

**The job board in E2E.** `docker-compose.e2e.yml` also runs
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

**Beta features in E2E.** `e2e/beta-features.spec.ts` (serial)
drives `/admin/features` against the real beta features API and the `jobs` gate,
with two browser sessions (`e2e-admin` and `e2e-discord`, a second
`browser.newContext()`): the features row (count, "Yes, as an admin"); the
admin turns `jobs` off for themselves (rail 8 entries with Admin, `/jobs`
"Oops! Page not found", `GET /jobs` 404, `/admin/jobs` still opens, `e2e-user`
unaffected) and back on; `e2e-discord`'s rail is 6 links with no Jobs (it
has no `cvs` either; the admin's counts include CVs, as an admin), the
admin adds them by username and a RELOAD shows Jobs + "Beta" — that step is
timed and asserted under 60 s (AC7) — then removes them; release (Cancel
first, then confirm) gives everyone Jobs without "Beta" while the admin's
stored opt-out shows locked, the list stays editable, and move back to beta
(the "lose access" sentence asserted) hides it again with the list unchanged
and the opt-out counting again; an admin on the list keeps it after opting
out (AC11). The seed resets the state every run (`seed_e2e.py`
`reset_beta_features`: `jobs` in beta with `released_at` NULL, `e2e-user`
listed, `e2e-discord` off the list, no `e2e-admin` opt-out), and the spec's
`afterAll` (runs even after a failure) PATCHes `beta`, DELETEs `e2e-discord`
and `e2e-admin` from the list and DELETEs the admin's opt-out. The feature's
NAME is "Job board" (migration `641001baff09`); its rail entry is "Jobs".

**CVs behind `cvs` in E2E (PRD 0015).** `e2e/cvs-beta.spec.ts` (serial,
`e2e-admin` and `e2e-discord` in two contexts): without `cvs`, e2e-discord's
rail is 6 links with no CVs, `/cvs`, `/cvs/new`, `/cvs/editor`,
`/applications/cv` and `/applications/new-with-cv` are "Oops! Page not found",
`/applications` has no tabs and no "New with CV", `GET /base-cvs` and
`GET /applications/drafts` are 404 and the browser sends no CV or draft
request. The admin adds e2e-discord at `/admin/features/view?key=cvs` (the
feature's NAME is "CV builder", migration `f28e3d9705dd`): a reload shows CVs
and "Beta" and `/cvs` opens with the badge beside its h1; e2e-discord then
makes a master CV, an application with its CV copy and a draft through the
API. With
`jobs` added (a collection run first if the board is empty) and `cvs` removed:
the browser's own `GET /jobs` carries `best_fit: null` everywhere, the board
shows no fit, no "Start application", no invitation and no Sort, the job page
no "Your fit", and `POST /applications/drafts/from-job` is 404. The data is
404 but kept; re-added, `GET` returns it unchanged, then removed again it
hides on reload. `e2e-user` (on the list from the seed) sees CVs and "Beta".
The seed resets `cvs` like `jobs` (beta, `e2e-user` listed, `e2e-discord`
off, no admin opt-out); `beforeAll`/`afterAll` delete e2e-discord's CVs,
drafts and applications (enrolling it for the wipe) and put that state back.

**Borderless sign-in in E2E (ADR-0026).** The stack runs `borderless-fake`
(`backend/tests/fixtures/borderless/fake_oidc.py` on its OWN test-only image
`applika-e2e-borderless-fake`, built from that folder's `Dockerfile` with
the synthetic `accounts.json` baked in; never on the API image, which holds
no fake code. The image's entrypoint runs the fake, so `command:` holds
flags only: `--issuer http://borderless-fake:8081/api/auth --public-url
http://127.0.0.1:8181 --access-ttl 2`. Published on `127.0.0.1:8181`; the
healthcheck reads `/health` at its root with the image's `python`, as the
image has no curl or wget). The API's env names
that issuer, the SYNTHETIC client of `accounts.json`
(`applika-fake-client`, `applika-fake-client-secret-not-real`) and
`BORDERLESS_REDIRECT_URI=http://127.0.0.1:8100/api/auth/borderless/callback`;
nobody calls the real Borderless or GitHub. Every provider endpoint sits
under the issuer's path: the browser opens the sign-in page at
`:8181/api/auth/oauth2/authorize`, the API reaches the rest in-stack. The
controls sit at the fake's ROOT: `POST /__fake/accounts/{sub}`
(`{membership?, email_verified?, deny?}`), `POST /__fake/grants/{sub}/revoke`,
`GET /__fake/log` (`authorize` params, `grants` by sub, `revokes`; never a
secret or a token), `POST /__fake/clock`, `POST /__fake/reset`.
`frontend/scripts/e2e.sh` waits for `:8181/health`, POSTs `/__fake/reset`
BEFORE the seed (it re-arms every `seedRefreshToken`; the first membership
check rotates it), exports `E2E_BORDERLESS_URL`, and keeps the api and fake
logs on failure. **A spec never POSTs `/__fake/reset`**: the fake would
forget the seeded users' rotated refresh tokens and their next refresh would
end their web sessions. The seed binds the three seeded users to their fake
accounts every run (`e2e-user` PSP, `e2e-admin` and `e2e-discord` BASE — so
every seeded rail has Reports — e2e-user with a GitHub identity, every prompt
answered); `loginAs` still installs real cookies. With `--access-ttl 2`
almost every session refresh and report request refreshes at the fake.
`e2e/support/auth.ts`: `BORDERLESS_ACCOUNTS` mirrors the fake's accounts
(`sub`, `email`, `password`: `user` (seeded, never through the web),
`free`, `starter`, `unverified`, `revoke`, `logout`), `borderlessUrl(path)`,
`signInWithBorderlessButton(page)` (the CTA of the tree the viewport shows,
named "Continue with Borderless", `exact: true`, at every width) and `signInWithFake(page, email)`
(`/login` → the button → the fake's page → that account's one-click button
named by its email → back on the web origin; only in a context with NO fake
session — with one the fake answers straight back and its page never shows).
`e2e/borderless-signin.spec.ts` (serial; `beforeAll` AND `afterAll` delete
`e2e-free`, `e2e-starter`, `e2e-revoke`, `e2e-logout` through
`DELETE /users/me`, so a retry starts from new accounts; `afterAll` puts
`e2e-logout` back to PSP): `/login` has one button and no input; e2e-logout
through the fake's Email + Password form → `/welcome` → Start fresh → PSP
chip; the last `authorize` in `/__fake/log` has S256, a 43-char challenge, a
state, a nonce and no `prompt`; no web URL carried a code, state or token,
and script-readable storage and `document.cookie` hold none; logout of the
last session → exactly one `revokes` entry (`refresh_token`); signing in
again is one click (no fake page committed) with a new state;
e2e-logout PSP → BASE through the control → 2.5 s → reload → BASE chip, a
`refresh_token` grant logged → logout → one more revoke; e2e-free → `/welcome`
once → no chip, no Reports, `GET /reports` 403 `RPT-1001`; e2e-starter → no
chip; the profile restore aborted at `github.com` (`scope=read:user`, a
`state`) and its outcome notice; e2e-unverified → `/login?error=AUTH-1005`
(nothing else in the URL) with its words; seeded e2e-user's PSP chip;
a new account's welcome choice at 390×844 (STARTER deleted and signed in
again: the "How to start" radiogroup, Start fresh → the phone dashboard);
`/api/auth/cli/authorize` (PKCE) → the fake's page despite its session
(`prompt=login` logged) → the API callback's 307 to the CLI's loopback
`http://127.0.0.1:<port>/callback` with exactly `code` and `state` (the
CLI's own state echoed). NOTHING listens there: the port is found closed by
connecting, never by listening, and the hop is read as the browser's own
request (Playwright raises one per redirect hop; a route never sees a
redirect target): `page.waitForRequest` on that origin, its
`redirectedFrom()` the callback's 307, itself from the fake; the navigation
then fails `net::ERR_CONNECTION_REFUSED` (asserted), and the dashboard
check opens a new tab of the same context. The browser's
`__access`/`__refresh` stay the same → the code redeemed at
`POST /auth/token` by the CLI's request context; e2e-revoke signed in again →
`/__fake/grants/{sub}/revoke` → 2.5 s → reload → `/auth/refresh` 401
AUTH-1049 → `/login?error=AUTH-1049` words; the CLI `refresh_token` grant 200,
its Bearer `GET /reports` 403 AUTH-1050, its `GET /users/me/sessions` lists
every web row `revoked`; the button again (one click) → PSP chip → the CLI's
`GET /reports` 200 → `POST /auth/revoke` 204. It never signs a seeded user in
through the web (that would add a web session `devices.spec.ts` lists).
Its last describe is read-only and signed out: option C's states at
390×844 (`/login` ready — the phone h1, the decoded badge image, the CTA
focused —, `?error=AUTH-1046`, `?cli=1`, `?error=AUTH-1046&cli=1`), C at 390
and 320 with the Borderless logo in its CTA (and in Portuguese, light), and
option A at 1280: the card, the tiles, focus on the CTA, the sign-up link, the
pair at top 20 / right 24, the fit at 768 and at 812×375 (the card below the
pair, the page scrolls to the button), the card centred with nothing to
scroll at 1280×450, Portuguese light, AUTH-1047, `cli=1`; pending at 1280
and at 390, recorded in the page the moment it renders (a
`MutationObserver` writing to `sessionStorage`, no stub; the real API
answers, then the fake's page), then Back brings the page back ready.
**`e2e/headers.spec.ts`** (serial): the phone header of `/` and `/cli` from
320 to 430 wide, signed out (the page) and signed in (a second context with
`loginAs`), English dark then Portuguese light switched from the flags: one
row, the order home (the icon, named "Applika.dev home", no words), theme,
English, Português, then the button ("Sign in" / "Entrar" → `/login`,
"Dashboard" / "Painel" → `/dashboard`), the button's words the only ones
drawn (no "applika.dev", "EN" or "BR"), every box 44×44 inside the
viewport, the floors (7 on `/`, 13 on `/cli`), no sideways scroll at 320,
the header's button the page's one Sign in or Dashboard link, and both
targets clicked; the pair of `/login` and `/cli/code` at 390 and 1280 and
of `/cookie-policy`'s phone bar at 390 (theme, then language, in the DOM and
on screen; the back link at its left below md; `/login`'s at top 20 / right
24 at md and up); at 1280 the public header's order on `/`, `/cli` and
`/cookie-policy` (logo, theme, language, Sign in or Dashboard) and the
signed-in app header's (the cycle selector at the left; the agenda, the
theme and the language at the right).
`e2e/admin-report-webhooks.spec.ts`
(serial): add with BASE + PSP (both chips), masked row, the token never in
`page.content()`, narrow to PSP without resending the URL, delete as its own
cleanup.

**Phone in E2E (PRD 0021, ADR-0027).** No phone project: `playwright.config.ts`
keeps one Desktop Chrome project, and a phone case sets the viewport itself
(`test.use({ viewport: PHONE })` or `page.setViewportSize`), so the serial
order and `--project` stay as they are. `e2e/support/phone.ts` has `PHONE`
(390×844), `expectPhoneTargets(page, atLeast, exclude?)` (every rendered
control's box at least 44×44, and a floor on how many were measured;
`exclude` is a named, commented selector list of today's desktop components a
board reuses at their desktop size, never a loose filter) and
`expectNoSidewaysScroll` (the document AND, as a guard, the phone shell's
one `<main>`) and `expectDocumentScrolls` (`<main>` is no scroll
container, a tall page scrolls the document, the tab bar stays 14px off
the viewport's bottom; Today and Cycles, where the back bar is also
`sticky`). `e2e/phone.spec.ts` at 390×844: the public screens
(signed out, read-only; `/cli` is the v3 board, its Copy says "Copied", and
a refused clipboard says nothing; the header of `/` and `/cli` holds the
home link, the theme toggle, the flags and Sign in, the page's one sign-in
link; on every public screen the theme toggle sits left of the language
toggle); as `e2e-user`, Today → Add → the quick add → the
Application screen → the row under Applied on the Pipeline, the Agenda,
Insights, then the initials → the Account hub (Jobs and CVs, no Admin, Theme
above Language), Light
(held on `/cycles`) and back to Dark, Português (BR) (the hub, the tab bar's
"Hoje"/"Funil", `/cycles`' "Ciclos") and back to English, then 44px and no
sideways scroll at 360 and 320; one read-only check per account-area, job and
CV board — Profile (Edit, then Cancel), Devices (This device; Sign out's sheet
opened and cancelled, NEVER confirmed: every later spec signs in with that
session), Cycles, Reports and the current report day (never submitted; on day
1 in edit mode its date picker is opened and closed), Jobs, a job (Your fit, the Start application
sheet cancelled, no draft), the draft's step 1 (More details holds the
application date; nothing typed, no draft), CVs (Delete's sheet cancelled) and
the CV editor (one row open at a time, the PDF downloaded, no `cv-document`,
nothing saved), the new master CV (back "CVs" and Beta, Identity open, the
Live preview card, Cancel back to `/cvs`; nothing created), an application's
CV copy (the picker creates it with Tailor by keywords, the editor is read
and its PDF downloaded, Show changes draws today's markers, back
"Application" to `?focus=<id>`, then read-only once the application is
closed; its 44px checks exclude, by name and only where they show,
`[data-slot="cv-keywords-input"]` (`KEYWORD_CHIPS`, today's keyword chips)
with Skills open and `[data-slot="cv-diff-changed"]` beside a change), `/cli`
signed in offering Dashboard, and `/admin` sending e2e-user back to Today.
An added CV list item's move and remove buttons are measured, never
excluded: `expectItemActions44(scope, atLeast)` (in `phone.spec.ts`) checks
every `[data-slot="cv-item-actions"] > button` at 44×44 on `/cvs/editor`
(the seeded skill category, then a link added and never saved), `/cvs/new`
(a link added) and `/applications/cv` (Skills open); `/cvs/editor`'s 44px
checks also leave out v2/CVEditor's 32px "Add …" control (`EDITOR_ADD`).
`cv-builder.spec.ts` proves the same buttons stay 32×32 at 1280. Today also
shows a quiet open application whose latest event is a denial staying off
Needs your attention (still under Closed, stale, on the Pipeline). Below md
the applika-cli banner is on Today only, so no other phone screen's floor
counts its two controls; as `e2e-admin`, the
Account hub's Admin row → seven chips, the Dashboard and Jobs (source cards)
boards under "Admin Console", then the v3 boards, each under its own h1:
Report webhooks (the masked address only; Edit's sheet cancelled, one
webhook added through the sheet and deleted through the delete sheet), Users
(the sort chips and a user's details sheet; the administrator toggle is
never pressed), Companies and Platforms (the Private filter, Add cancelled,
Delete unavailable on a used row), an administrator approving a private
company through the phone sheet with no sideways scroll while the sheet is
open and after, a refused Delete said once inside its sheet with no Sonner
toast (a company an application starts using after the list loaded: 409
"Cannot delete: 1 application(s) reference this company"; a webhook deleted
through the API under the open list: 404 "Report webhook not found"),
Features (one card per feature; the jobs card opens its
page) and a feature (back "Features" and the System pill, no chips; Your
access, the beta list, Add user searched then Done, the stage sheet
cancelled; Your access, Add and a stage confirm are never pressed), and its
own `jobs` opt-out (the Jobs row gone on reload, `/jobs` "Oops! Page not found", the opt-out deleted in a
`finally` and in `afterAll`). Its data: the applications the quick add and
Log update create are deleted in `afterAll`; one master CV is made through
the API in `beforeAll` and deleted in `afterAll`; an empty job board gets the
admin's collection run first (the `cvs-beta.spec.ts` shape; the jobs stay,
as `jobs.spec.ts`'s do); the one report webhook it lists is made and deleted
through the API, and the one the sheet adds is deleted through the delete
sheet and again in `afterAll`, both with a synthetic `discord.com` address
(`e2e-dummy-…-not-real`); the CV copy's application (a job description
naming PostgreSQL but not Python or FastAPI) is made through the API and
deleted, its copy with it, in `afterAll`; the two private companies (one
approved on the phone, one used by an application) are made by `e2e-user`
through the API in `beforeAll` and deleted with that application in
`afterAll`. **Logout ends
the session it runs in, so it never runs as a seeded user**: the disposable
fake account `e2e-free` (no membership, so no grant or badge state to put
back) is deleted in `beforeAll` AND `afterAll` (`deleteAccount` in
`e2e/support/auth.ts`, which `borderless-signin.spec.ts` shares), signs in
through the fake in its own 390×844 context, answers `/welcome` with Start
fresh, sees only Cycles in Workspace and the closed Reports (`none`, no
report request sent), then Account → Logout lands on `/` and its
`GET /users/me` is 401. **Below-md cases elsewhere follow the phone boards**:
`jobs.spec.ts` at 375 (`sourceRow` is `[data-slot="job-source-row"]` with no
tag — a `tr` at md and up, an `li` card below; `/jobs` cards are still
articles named by their titles; `/jobs/view`'s "Your fit" is still a
`section` with a heading per master CV, visually hidden in its tab's panel;
the draft's step 2 still shows `[data-slot="cv-fit-panel"]` and is measured
at 44px with that panel excluded — today's `CvFitPanel`, desktop sized),
`application-with-cv.spec.ts` (the draft's step 1 at 390 opens "More details"
before `getByLabel(/application date/i)`), `cv-builder.spec.ts` (`/cvs/editor`
at 390 is the phone board: nine `cv-acc` rows, one open, "Download PDF", no
`cv-document`, no layout notice, no Markdown; `/cvs/new` at 390 is v3/CVNew:
the rows, then the Live preview card after the last row, its sheet 210px
wide and A4 tall, the page indicator outside the sheet's `scale()` at 12px,
the notice said once, never wider than the phone; the stacked-halves proof
runs there too, rows first).

---

## Architecture

This is a **Next.js 16 App Router** frontend (static export) for Applika.dev — a job application tracker. It communicates with a FastAPI backend running on port 8000.

### Routing

Route groups control access:

- `src/app/(public)/` — Unauthenticated pages (home, login)
- `src/app/(protected)/` — Auth-guarded pages (dashboard, applications, profile, admin)

Each protected route has a thin `page.tsx` shell that renders a `*-page.tsx` component containing the actual logic.

`/login` lives at `src/app/login/`, OUTSIDE the `(public)` group, so it renders no landing header or footer. It is sign-in option A at md and up and option C below md, one "Continue with Borderless" button each, behind a Suspense shell (it reads `?error=` and `?cli=1`); `/welcome` is the one-time choice of a new account (see **Sign-in, welcome, membership badge**).

CLI sign-in routes (ADR-0019):

| Route                    | Shell                                    | Component                                                   |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------- |
| `/device?code=`          | `(protected)/device/page.tsx` (Suspense) | `device-page.tsx` — code, request card, approve/deny        |
| `/cli/code?code=&state=` | `cli/code/page.tsx` (Suspense)           | `cli-code-page.tsx` — `code#state` read-only, Copy, no auth |

`/cli` (`(public)/cli/`, `cli-page.tsx`) is the public applika-cli page under
the landing layout: install, sign-in modes, examples, `applika skill`. The
rail's footer links to it above the account card (`sidebar.tsx`); its PyPI
links read `APP_CONFIG.cli.url` (`APPLIKA_CLI` build arg). It switches by CSS
like the other public screens: below md v3/Cli (`PhoneCli`,
`[data-slot="cli-phone"]`, under `PhoneLandingHeader`), at md and up today's
page in `[data-slot="cli-desktop"]` (`hidden md:contents`). Both trees copy
the commands `cli-page.tsx` exports (`INSTALL`, `SIGN_IN`, `TRACK`, `SKILL`,
with `COPIED_MS`); see **Phone shell**.

Phone-only routes (ADR-0027, PRD 0021):

| Route       | Shell                           | Component                                                      |
| ----------- | ------------------------------- | -------------------------------------------------------------- |
| `/insights` | `(protected)/insights/page.tsx` | `insights-page.tsx` — the fourth tab; md and up → `/dashboard` |
| `/account`  | `(protected)/account/page.tsx`  | `account-page.tsx` — the Account hub; md and up → `/profile`   |

They are the only addresses the phone layout adds; every other screen keeps
its address at both widths. At md and up each page `router.replace`s
(`useLeaveAtDesktop` in `hooks/use-is-phone.ts`: read from `matchMedia` in an
effect, never from the server snapshot, and again when the width crosses md
while the page is open) and renders nothing meanwhile.

`/cli/code` sits OUTSIDE the groups like `/login` (no shell, no session): the
API 307s there when the CLI cannot reach its local callback. `/device` reads
`?code=` once into a lazy `useState` (normalized `XXXX-XXXX`) and never
auto-submits. **Return-to.** A signed-out visit to `/device` makes
`(protected)/layout.tsx` store path + query in
`sessionStorage["applika:return-to"]` before `router.replace("/login")`; the
first authenticated protected render consumes it ONCE (removed before
navigating) and `router.replace`s to it — unless the sign-in page already
consumed it, or the account still owes its `/welcome` answer (then `/welcome`
consumes it). Only a same-origin path is followed
(`/x`, never `//host` or `/\host`). `src/lib/return-to.ts` owns the key, the
allowed paths (`/device` only) and the check; add a path there, not in the
layout.

**Search params under static export.** `output: "export"` FAILS THE BUILD on a
page that reads `useSearchParams()` outside a `<Suspense>` boundary. The shell
`page.tsx` owns the boundary and the `*-page.tsx` component reads the params —
see `src/app/(protected)/cvs/editor/`, which is the precedent for any future
`?query=` route.

Master CV routes:

| Route             | Shell                             | Component                            |
| ----------------- | --------------------------------- | ------------------------------------ |
| `/cvs`            | `(protected)/cvs/page.tsx`        | `cvs-page.tsx` — the gallery, delete |
| `/cvs/new`        | `(protected)/cvs/new/page.tsx`    | `new-cv-page.tsx` — create           |
| `/cvs/editor?id=` | `(protected)/cvs/editor/page.tsx` | `cv-editor-page.tsx` — edit          |

Application CV copy route:

| Route                  | Shell                                  | Component                                     |
| ---------------------- | -------------------------------------- | --------------------------------------------- |
| `/applications/cv?id=` | `(protected)/applications/cv/page.tsx` | `application-cv-page.tsx` — picker AND editor |

New application with CV, i.e. a draft (PRD 0010):

| Route                                 | Shell                                           | Component                                                         |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `/applications/new-with-cv?id=&step=` | `(protected)/applications/new-with-cv/page.tsx` | `new-with-cv-page.tsx` — both steps, owns both forms and autosave |

Job board (PRD 0012) — see **Job board** below:

| Route            | Shell                            | Component                                         |
| ---------------- | -------------------------------- | ------------------------------------------------- |
| `/jobs`          | `(protected)/jobs/page.tsx`      | `jobs-page.tsx` — list, filters in the URL, marks |
| `/jobs/view?id=` | `(protected)/jobs/view/page.tsx` | `job-view-page.tsx` — description, fit per CV     |

`?id=` is the APPLICATION's id, never the copy's. There is no nav entry: the
route is reached from the CV link on an application row, and
`e2e/shell-responsive.spec.ts` pins `PRIMARY_NAV` at eight entries for a user
with `jobs` (Jobs right after Applications since PRD 0012; seven without it
since PRD 0013 — see **Beta features**).
Since PRD 0015 the eight need `cvs` too: seven with one of the two features,
six with neither.

**Every CV route is gated on `cvs` (PRD 0015):** `/cvs`, `/cvs/new`,
`/cvs/editor`, `/applications/cv` and `/applications/new-with-cv` each export
a `FeatureGate feature="cvs"` wrapper over an inner component, so without it
they render the app's "page not found" and send no CV or draft request. The
inner `jobs` checks on the last two stay.

**`/applications/cv?id=` is the reading column while it shows the picker, and
full width only once it shows the editor** — see **App shell**
below for the mechanism. `/cvs/new` and `/cvs/editor` stay full width in every
state, path-based, unchanged. Below md `/applications/cv?id=` is
v3/ApplicationCV, and its back bar "Application" returns to that
application, `/applications?focus=<id>` (`PhoneBackHref`; see **Phone
shell** and **Tailored CVs**).

**`/applications?focus=<application_id>` (R-011)** is how the
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

**Below md `?focus=<id>` is the Application screen's address (PRD 0021).**
`ApplicationsPage` returns `PhoneApplicationsPage` below md and today's page
(`ApplicationsDesktopPage`, unchanged) at md and up; crossing md remounts
the other. The phone does NOT read `?focus=` once: it reads it on every
render through `useSearchParams` (the `jobs-page.tsx` precedent; Next keeps
it in sync with the History API) and mirrors it in state with the "adjust
state when a prop changes" pattern, so the back gesture works. A Pipeline
row's plain tap `pushState`s `?focus=<id>` (the row is a real link to that
address for a new tab); "Pipeline" goes `history.back()` when that tap
pushed it, else `replaceState(null, "", "/applications")` (opened from
Today, the Agenda or a link). Never `router.replace`/`router.push` on the
same path (a no-op here). The quick add opens a new application the same
way: `pushState` on `/applications`, `router.push` from anywhere else. The
list's scroll and the focus on the opened row come back with it. An id the
viewed cycle does not hold shows "This application is not in the cycle you
are viewing." as the screen's own card, not a toast; the URL keeps it.

### Providers

Providers are split into two layers:

- **`RootProviders`** (`src/components/layout/root-providers.tsx`) — wraps the entire app in the root layout. Includes QueryClientProvider, `LocaleProvider` (inside the query client, above everything else, so Sonner toasts translate; see **i18n**), ThemeProvider, AuthProvider, TooltipProvider, and Sonner.
- **`ProtectedProviders`** (`src/components/layout/protected-providers.tsx`) — wraps protected routes only. Adds a nested AuthProvider for protected-scope auth state.

The `(protected)/layout.tsx` wraps children with `ProtectedProviders` + `SupportsProvider` + `CycleProvider`, redirects unauthenticated users to `/login`, and renders everything inside `<AppShell>` (see **App shell** below).

### i18n (ADR-0025, plan 0019)

Two languages, `en` (default) and `pt-BR`. **`next-intl` 4** (`^4.14.9`,
supports Next 16 and React 19), used client-side only: `NextIntlClientProvider`,
`useTranslations`, `useFormatter`, `createTranslator`. No next-intl plugin,
routing or middleware (the site is `output: "export"`); no locale in the URL.

- **`src/i18n/config.ts`**: `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`
  (`NEXT_LOCALE`), one-year max age, `isLocale`.
- **`src/i18n/resolve-locale.ts`** (pure): a `NEXT_LOCALE` cookie of exactly
  `en` or `pt-BR` wins; any other value is ignored; else any
  `navigator.languages` entry `pt`, `pt-*` gives `pt-BR`; else `en`.
  `localeCookieString` = `NEXT_LOCALE=<locale>; Path=/; Max-Age=31536000;
SameSite=Lax` (not HttpOnly; JS writes it).
- **`src/i18n/locale-provider.tsx`** `LocaleProvider` + `useLocaleSwitch()`
  (`{locale, setLocale, toggleLocale, isPending}`). Every page renders `en`
  first (the static HTML), so hydration always matches; the language resolves
  in an effect after mount (English flash for pt visitors, accepted). A pick
  writes the cookie (on pick only, never on resolve), swaps the messages in a
  `useTransition` (`isPending`), sets `<html lang>` and points the translator
  at the same language. No navigation: the tree stays mounted, typed values
  stay. Cookies blocked: the pick holds for the page view. `timeZone` is UTC
  on the prerender and the browser's after hydration.
- **`src/i18n/load-messages.ts`**: `en.json` is in the main bundle, `pt-BR.json`
  a lazy chunk fetched once.
- **`src/i18n/translator.ts`**: a module store for code outside React
  (`translate`, `hasMessage`); only `LocaleProvider` writes it. It is `en`
  until the provider resolves, and in tests.
- **`src/i18n/messages/en.json`, `pt-BR.json`**: same keys, same ICU arguments
  and rich-text tags (`src/i18n/messages.test.ts`). **`en` values are today's
  exact English words**, so word-asserting tests and e2e stay green. Portuguese
  follows the `## Glossary` of `docs/plan/0019-language-switcher-and-error-codes.md`;
  brand names (Applika, Borderless, GitHub, LinkedIn, BASE, PSP) never change.
  Namespaces so far: `common` (shared primitives), `header`, `icons`, `auth`,
  `cookies`, `errors`; the screens add theirs.
- **Errors by code**: `src/lib/api-error-message.ts` is the one place an API
  error body becomes words: `errors.<code>` with `params` (ICU) → else the
  string `detail` (an unknown code, an old API) → else the caller's fallback,
  by default `errors.unknown`. GEN-1003 (every validation 422) is one line; a
  `detail` array never reaches the screen. `getApiError`, `getBlobApiError`,
  `rateLimitNotice` (GEN-1004 with `params.seconds`, else `Retry-After`)
  and every former direct `.detail` read (`jobApiDetail`, `safeErrorMessage`,
  `deviceErrorText`, the admin pages' `serverDetail` / `serverErrorFrom`)
  go through it, with their signatures unchanged. They read the active
  language at call time, so a request answering after a switch shows the new
  language. **Never read `response.data.detail` directly.**
- **A new error** = an `ErrorCode` member in `backend/app/core/error_codes.py`,
  plus its row in `docs/error-codes.md`, plus `errors.<CODE>` in both message
  files (params as ICU args). `messages.test.ts` fails until all three agree.
- **Render-time text must subscribe**: words computed through the module
  translator during render do not refresh on a switch on their own. A
  component that renders them also calls `useTranslations` or `useLocale`
  (better: use `useTranslations` directly); the error helpers are for event
  handlers and toasts.
- **Server components cannot translate**: anything that renders words must be
  under the client provider (`"use client"`). Page `metadata` stays English.
- **The switcher**: `components/language-toggle.tsx` `LanguageToggle({ variant:
"default" | "landing" })`, the Borderless platform's switcher ported whole
  (raw `RadioGroup` from `radix-ui`, every class in exported constants, flags
  in `components/icons/flag-us.tsx`, `flag-br.tsx`); `LanguageToggleView` is the
  presentational half. Ungated (ADR-0025 beta exception): no `FeatureKey`,
  `useHasFeature` or `FeatureGate`. Mount it outside any `<form>`; in
  Playwright use `.click()`/`.check()`, not arrow keys.
- **Where it mounts: six files, `variant="default"` in all of them**, in
  both themes, no portal (it renders inline in its host's layer of the
  **Stacking contract**), one mount per file and ONE switcher on screen at
  any width. Every mount reads the theme toggle first, then the language
  (the owner's order), with no exception:
  - the signed-in `Header` (right after `ThemeToggle`, so every protected
    page at md and up, `/welcome` and `/device` included; below md a
    signed-in page has no header and the Account hub's "Language" radiogroup
    is the switch, see **Phone shell**);
  - `LandingHeader`, md and up only (`(public)/layout.tsx` hides it below
    md): after `ThemeToggle` and before the CTA, for `/`, `/cookie-policy`
    and `/cli`;
  - below md, `PhoneLandingHeader`, the public phone header of `/`
    (`PhoneLanding`) and `/cli` (`PhoneCli`), in
    `components/phone/landing/phone-landing-header.tsx`, after the theme
    toggle, before Sign in / Dashboard, and with `flagsOnly` (the only
    mount that passes it), and
    `PhonePublicBar`, the "Home" back bar of `/cookie-policy`, in
    `components/phone/phone-public-bar.tsx`, after the theme toggle;
  - `SignInScreen` (`/login`) and `CliCodeScreen` (`/cli/code`): one mount
    laid out for both widths, outside both trees and outside `<main>`,
    after the theme toggle. On `/login` it is `[data-slot="sign-in-bar"]`:
    below md the C_Mobile top bar (back "Back to home" → `/` on the left,
    the pair on the right), at md and up `absolute top-5 right-6 z-10`; on
    `/cli/code` the `absolute top-4 right-4 z-10` box at both widths.

  Below md the pair sits in a `.ph-pair` wrapper: `phone.css` gives its
  radios a 44px height and the theme button a 44×44 box under
  `@media (max-width: 47.99rem)`, so `LanguageToggle`'s own classes stay
  exactly today's and md and up renders as before. The `landing` look is
  ported but mounted NOWHERE. `language-toggle-mounts.test.tsx` scans
  `src/**/*.tsx` for `<LanguageToggle` and expects exactly these six files,
  each with one `<LanguageToggle variant="default" />` (`PhoneLandingHeader`'s
  is `<LanguageToggle variant="default" flagsOnly />`): a new mount is
  added to its list. `flagsOnly` drops the EN / BR text and sets
  `data-flags-only` on the group; `phone.css` makes each radio a 44px square
  with its flag centred (`.ph-pair [data-flags-only] [role="radio"]`).

- **Locators for the switcher.** The group is a `radiogroup` named "Toggle
  language" ("Alternar idioma" in Portuguese); its radios are NAMED by their
  endonyms "English" and "Português" (each with its own `lang`) and their
  visible TEXT is "EN" / "BR" (the phone landing header's flags-only radios
  have no visible text and keep those names). Use `getByRole("radio", { name: "English" })`,
  never `getByText("English")` (a CV language row can say "English" too). Every
  protected page now carries those two radios, so a page-level
  `getByRole("radio")` counts them: scope radio locators to the owning group or
  dialog, and scope the switcher itself to the header (`getByRole("banner")`)
  inside the shell (the cv-builder picker lesson). The public screens mount
  both widths' trees but one pair: Playwright's role queries skip the
  `display: none` tree, so `getByRole("radiogroup", { name: "Toggle
language" })` finds exactly one at any width; in vitest (no CSS) it is one
  too, because the pair sits outside the trees. Substring pairs to anchor
  after switching back to English: Cancel/Cancelar, Client/Cliente,
  Confirm/Confirmar, Edit/Editar, Revert/Reverter.
- **Counts**: Portuguese files 0 under `one`, so every `pt-BR` plural
  with a `one` form also has `=0` with the plural words
  (`{count, plural, =0 {# candidaturas} one {# candidatura} other {# candidaturas}}`:
  "0 candidaturas · 0 ofertas", never "0 candidatura"); every `en` plural
  has a `one` or `=1` form ("1 user", never "1 users"). `messages.test.ts`
  ("messages: counts") fails a message that breaks either.
- **Dates**: `i18n/date-locale.ts` `dateFnsLocale(locale)`; `ui/date-picker.tsx`
  and `ui/calendar.tsx` follow `useLocale()`. A date-picker's value keeps its
  `pattern`, language-free; only the display changes.
- **Tests**: `src/test/setup.ts` wraps every `render`/`renderHook` in an
  `en` `NextIntlClientProvider` (a test's own `wrapper` sits inside it) and
  resets the translator to `en` after each test. To test Portuguese, wrap in
  `NextIntlClientProvider locale="pt-BR"` or call
  `setTranslatorLocale("pt-BR", await loadMessages("pt-BR"))`. A screen that
  holds the switcher needs `LocaleProvider`: `renderInPortuguese(ui, {
localeSwitch: true })` (`src/test/portuguese.tsx`) for Portuguese,
  `render(ui, { wrapper: LocaleProvider })` for English. `LocaleProvider` is
  NOT in `setup.ts` (its after-mount effect would reset tests that set the
  translator to pt-BR). `playwright.config.ts` pins `use.locale: "en-US"`;
  only `language.spec.ts` runs Portuguese contexts.
- **`react/jsx-no-literals` is an `error`** on `src/**/*.tsx` minus tests
  (`*.test.tsx`, `src/test/**`), with `ignoreProps: true` (attributes are not
  checked; review and the e2e sweep cover `aria-label`/`placeholder`). JSX text
  must come from the message files; the `allowedStrings` in
  `eslint.config.mjs` are only symbols and punctuation (`—`, `·`, `•`, `*`,
  `:`, `,`, `%`, `+`, `@`, quotes…), brand names (Applika, applika,
  `.dev`, Borderless, GitHub, LinkedIn, BASE, PSP, applika-cli, Discord) and
  the endonyms (English, Português, EN, BR). A literal in braces
  (`{"words"}`) is not caught: do not use it to dodge the rule. No file-level
  override exists; the CV preview (`cv-document-blocks.tsx`) passes because its
  English words are data or constants, not JSX text.
- **The language E2E** is `e2e/language.spec.ts` (see **E2E**).

### Service Layer & DI

All HTTP calls go through typed service classes in `src/services/implementations/`. A singleton container at `src/services/services.ts` exposes them:

```typescript
import { services } from "@/services/services";
services.applications.getApplications();
services.companies.search(name);
```

The Axios instance in `src/lib/api-client.ts` handles cookie-based auth with `withCredentials: true`.

### Auth & Token Refresh

Sign-in is Borderless's own OpenID Connect sign-in, started by the
"Continue with Borderless" button at `/login` (ADR-0026; see **Sign-in,
welcome, membership badge**); there is no GitHub sign-in and no password anywhere in
the web. Authentication uses HTTP-only JWT cookies that the API's callback
sets; the web never sees a code, a state or a token. Token refresh is handled via **polling in AuthContext** (not via Axios interceptor):

- Polls `services.auth.refresh()` using React Query's `refetchInterval`
- **10-minute interval** when authenticated
- **30-second interval** on failure (for reconnection)
- Polls in background (`refetchIntervalInBackground: true`)

User profile is fetched separately via `useUserProfile()` only after auth succeeds.

**A 429 on either query is temporary, never a sign-out (R-019/R-024).**
The backend rate-limiter answers a refused request with `429` +
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

**A 503 is temporary too (ADR-0019 "fail closed").** When the API
cannot reach Redis it refuses every signed-in request (and `/auth/refresh`)
with `503 {"detail":"Session service unavailable"}` + `Retry-After: 5`. That
is the session STORE being down, not the session ending, so it must never
sign the web out. `isTemporary(error)` (429 or 503) is what both queries
retry on; `retryAfterMs` reads `Retry-After` for both, falling back to 60s
for a 429 and 5s for a 503. `isRateLimited`/`rateLimitNotice` stay 429-only.
In the 401 interceptor, a refresh that answers 503 rejects the original call
with that 503 (a temporary error to every caller), never a sign-out; only a
401 from `/auth/refresh` really ends the session. Other queries show the
503's `detail` through `getApiError`. The interceptor skips `/auth/*` on a
401 (a failed refresh must not refresh) EXCEPT `/auth/device/*` and
`/auth/github/restore`, ordinary signed-in calls that refresh and replay like
any other.

**AUTH-1049: Borderless refused applika's grant (ADR-0026).** The API then
ends every web session of the user and answers that session's
`GET /auth/refresh` with `401 {"code": "AUTH-1049"}`, clearing both cookies.
Two places can see that refusal: `AuthContext`'s poll (its query error) and
the 401 interceptor (a request answered 401, then the refresh it tried).
`src/lib/session-ended.ts` is the one place that reads it:
`grantEndedCode(error)` (a 401 with code AUTH-1049, else `null`),
`recordRefusedRefresh(error)` (the interceptor's catch; anything but
AUTH-1049 is ignored) and a tiny external store (`refusedRefresh()`:
`{code, at}` or `null`) that `AuthProvider` reads with
`useSyncExternalStore`. `useAuth().sessionEndedCode` is that code from either
path; while it is set the session is not authenticated and not loading, and
`(protected)/layout.tsx` sends the page to `signInPathFor(code)` —
`/login?error=AUTH-1049` — so the sign-in page shows the words. Every other
signed-out visit keeps the plain `/login`: the user's OTHER web sessions get
AUTH-1002, then AUTH-1015 on refresh (a dead refresh value names no
session, so the API cannot say why). A full page load starts with an empty
store, and `AuthProvider` ignores the recorded refusal once a refresh
succeeds after its `at` (the user signed in again in another tab).
`useAuth().logout(redirectTo = "/")` ends this session and navigates there;
"Sign in again" passes `/login`.

### State Management

- **Server state**: TanStack React Query with a 5-minute stale time and
  `retry: false` — **except** the auth refresh query and `useUserProfile()`,
  which retry a 429 or a 503 only (`isTemporary`, see above)
- **Auth state**: `AuthContext` (wraps the entire app via `RootProviders`)
- **Supports data**: `SupportsContext` — shared lookup data (platforms only, since PRD 0008/ADR 0012: step and feedback definitions are gone, R-021) available via `useSupports()`
- **Feature state**: custom hooks in `src/hooks/` (e.g., `useApplications`, `useTimeline`)

Mutations always call `queryClient.invalidateQueries()` on success and show a
`sonner` toast on error — except where the screen already says it: the admin
catalog and report-webhook mutations take `{ toastError }`
(`AdminMutationOptions` in `hooks/use-admin.ts`), and the pages pass
`toastError: !isPhone`, because below md their sheets show the refusal in
place (said once). A mutation with a fixed error message shows the 429's
own retry text instead, when there is one: `toast.error(rateLimitNotice(error)
?? "Failed to …")` (R-025) — every toast already showing
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
- **`BaseCvList`/`CvCard` carry an optional `selection` variant**,
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
- The cap is told on screen by `NewCvCard`, whose default `NEW_CV_COPY.limitReason`
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
  with PRD 0007 once nothing rendered it, because the whole pinned parity table
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

**The live preview is real A4 pagination.** The owner: "if possible,
make the preview during CV creation create pages if the document become too
large, use A4 dimensions". Three files, one seam:

- `cv-page-sheet.tsx` owns the A4 geometry at 96dpi (`CV_PAGE_WIDTH_PX`,
  `CV_PAGE_HEIGHT_PX`, `CV_PAGE_PADDING_PX`, `CV_PAGE_CONTENT_HEIGHT_PX`), the
  words (`cvPageIndicator`, `cvPageIndicatorLabel`, `CV_PREVIEW_COPY.overflowNote`,
  `cvPreviewPageCount`), the `CvPageLayout` contract and the presentational
  `CvPageStack` / `CvPageSheet`. Pure: props in, markup out.
- `use-cv-page-flow.ts` is the only thing that measures. `distributeCvBlocks`
  is PURE and takes a height lookup, which is the only way the arithmetic can
  be tested honestly — **jsdom reports every height as zero**. The hook reads
  `offsetHeight` (never `getBoundingClientRect().height`: the sheet is inside a
  `transform: scale()`) IN PLACE, in a layout effect, with no off-screen
  measuring container — one would duplicate the CV's text in the DOM and, if
  absolutely positioned, stretch `<html>` and regress the no-page-scroll AC7.
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
  `md:top-20` sticky offset, and the aside's own label and caption. PRD 0007
  measured the result at 720px — the first sheet 104px below the top of the
  scrollport at every scroll position, which is the gap the owner reported.
  `max-h-editor-scrollport` replaces the first two; flexbox replaces the third.
- **`CvSectionCard` has no header action slot, and its whole header toggles.**
  The owner: "remove the button to insert a new link/category/etc
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
  that: Typst owns the real layout. `CV_EXPORT_COPY.layoutNotice` therefore stays
  exactly where and as it is. Now that the preview LOOKS like paginated A4 that
  notice does MORE work, not less.

**Skills are CATEGORIES, and education is a section.** The owner:
"skills isn't simply a section where i put "tags" or just "keywords" it's a
section where i can create a category and inside this caregory add keywords".

- `CvSkillCategory` is `{ id, category, keywords: string[] }` and
  `CvEducation` is `{ id, institution, degree, area?, start, end? }`. There is
  no `skills: string[]` back-compat: the column never existed on any database.
- `CvSkillsSection` is the categorised editor (a `CvRepeatableSection` of
  categories, each wrapping a `CvKeywordsInput`). Keyword reorder is
  KEYBOARD-ONLY (`Alt`+arrow) — a wrapping chip row has no room for two
  buttons per chip — and the keys are told in words once per field via
  `CV_KEYWORDS_COPY.hint` and per chip via `aria-keyshortcuts`. The keywords block
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

**A CV date is a month and a year.** The owner: "instead of a bare
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

**The PDF is rendered on the SERVER** (`docs/adr/0011`, Accepted):
RenderCV/Typst, one fixed theme named `applika`, no theme parameter, no user
choice. **Never add `html2pdf`, a `cv-pdf.ts` or any client-side rasteriser.**
So is its Markdown twin — RenderCV's own Markdown renderer,
the same reason: no client-side Markdown generation either.

- `export-cv-button.tsx` is the whole affordance and is PRESENTATIONAL: no hook,
  no service, no axios. It takes `onExport` and `isExporting` and it has NO
  `disabled` prop — only a render already in flight locks it, so no caller can
  take the download away from a finalized or archived CV copy, or from a copy
  whose master CV was deleted. It ALSO takes the optional
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
- **The layout notice (`CV_EXPORT_COPY.layoutNotice` in `base-cvs/types.ts`) is said
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
  swaps to a spinner and `CV_EXPORT_COPY.pdfPending` fills an always-mounted
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

**On a phone (PRD 0021).** Below md `/cvs` is v2/CVs (`CvsScreen`: cards
with headline, last update, every keyword, counts, Edit and Delete behind a
`PhoneConfirmSheet`, the new-CV tile with the slots left) and `/cvs/editor`
is v2/CVEditor on the page's own form, save and PDF export: the sections are
`PhoneCvSections` rows over `CvFormSections` (through `CvSectionFrame`, see
**Phone shell**), no live preview, no Markdown, one bar. `/cvs/new` is
v3/CVNew (PRD 0022): `new-cv-page.tsx` calls `useIsPhone()` after every hook
and returns `CvNewScreenView` (`components/phone/screens/cv-new-screen.tsx`)
on the same form and create mutation: back "CVs", the Beta pill, the h1 and
its lead, a skeleton until the CV count is known, at three master CVs the
limit card (`[data-slot="cv-new-limit"]`: today's sentence and "Back to
CVs", no form), else the `PhoneCvSections` rows with each section's
description as the subline (`subline="description"`) and Identity open, the
"Live preview" card (`[data-slot="cv-new-preview"]`: today's
`CvDocumentPreview` at 210px, its page count, the layout notice said once
as the caption) and the bar, Cancel and Create CV (both pending while the CV
is created). Crossing md reseeds the editor from the stored CV: an unsaved
edit is lost (no autosave); on `/cvs/new` the unsaved new CV is lost.

### Tailored CVs (`src/components/tailored-cvs/`)

A **tailored CV** is an application's own COPY of a master CV, edited for that
job. The vocabulary is deliberate and worth keeping straight:

- a **master CV** (`base-cvs/`, `/base-cvs`) belongs to the USER, and there are
  at most three;
- a **CV copy** (`tailored-cvs/`, `/applications/{id}/cv`) belongs to an
  APPLICATION, and there is at most one;
- the copy is a full snapshot. Editing or deleting the master CV never touches
  it. Deleting the master only clears the copy's `base_cv_id`, and the editor
  then shows the words `source CV deleted` (`TAILORED_CV_SOURCE_COPY.deleted`).

**There is no default master CV.** The user picks one per application, every
time. `BaseCvPicker` is the only way to create a copy, and its one shortcut is
`preselectedBaseCvId(options)`: with exactly ONE master CV it returns that id
and the picker reports it through `onValueChange`, so the PAGE stays the single
source of truth for the selection. With none, the picker becomes an invitation
to write a master CV first.

**The picker IS the `/cvs` gallery.** The owner: "basically just use
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
(`cvs.list.emptyTitle`/`emptyBody`/`emptyCta` in `base-cvs/base-cv-list.tsx`), not a
picker-specific invitation. **Read-only renders no cards at all** — just the
`TailoredCvReadOnlyBanner` and `BASE_CV_PICKER_COPY.lockedBody`, no list, no
create, exactly as before this slice.

The module mirrors `base-cvs/` rather than forking it:

- `types.ts` is the vocabulary (`TailoredCv`, `TailoredCvReadOnlyReason`) and
  owns the on-screen copy constants (`TAILORED_CV_READ_ONLY_COPY`,
  `TAILORED_CV_SOURCE_COPY`). Assert the WORDS, never the classes.
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
  PRD 0012 — see "Tailor by keywords" below.

**"Tailor by keywords" and the CV fit (PRD 0012, R-025/R-026/R-028,
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
  `cv-diff.ts`, `applika/backend/tests/fixtures/cv-diff/` and the server diff are UNCHANGED
  (AC6): skill-category and keyword reorders show ONLY through
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
truth for "closed" everywhere (PRD 0008, ADR 0012).** It replaced a
step/feedback-driven "finalize" with a real application TIMELINE. Both fields
are set together server-side, but every read-only derivation on the web keys
on `finalized_at != null` — including the tailored-CV `readOnlyReason` above,
which was `application.finalized ? "finalized" : …` before this slice.

**The copy editor is 50/50 at every width from `md`, with the job description
above Identity and contact.** The owner: "instead of showing
the job description in the right side just above cv preview, move to the
left above identity and contact" — and drop the `2xl` cap `BaseCvEditor` never
had either, so the two editors match at every width, not just up to `2xl`
(the earlier note on the cap is superseded). `TailoredCvEditor`'s form column is
now `JobDescriptionPanel`, then the diff `diffSummary` slot, then
`CvFormSections`, in DOM order — which is also the mobile stacking order. The
preview column is unchanged: sticky, `max-h-editor-scrollport`, the same
layout-notice rules as `BaseCvEditor`. Because `JobDescriptionPanel` is a
`CvSectionCard`, it carries its own `h2` — the copy editor's field body now has
TEN level-2 headings where the master CV editor has nine; any test asserting
that list has to count the job description first.

**The copy's diff against its baseline is computed TWICE, independently, on
the web and on the server, from one PINNED shared contract.** Baseline
resolution: `cv.base_snapshot` (the master CV's content,
captured once at copy-creation time, `TailoredCvSnapshot` in `types.ts`) when
present, else the CURRENT master CV fetched via `base_cv_id`, else no diff UI
at all — the `source CV deleted` note stays exactly as it was. Neither is ever
written by the client: `base_snapshot` rides on `GET`/`POST`/`PUT` responses
only, and `toTailoredCvPayload` never emits it (the API's `extra=forbid` would
422 it anyway).

- `cv-diff.ts` is the pure engine, no React, no I/O.
  `computeCvDiff(baseline, current)` returns the rich internal shape
  (`CvDiffDetail`) `use-cv-diff.tsx` reads to build markers: per-field
  before/after, added items, removed items WITH their baseline position
  (`at`, for `Restore`), and skill-keyword add/remove sets.
  `diffCv(baseline, current)` is
  `computeCvDiff(...).canonical` — the flat `{total, sections, changes[]}`
  shape the slice brief PINS, identical in field names and semantics to the
  server's own diff. Matching is by the client-generated item `id`, never by
  position — a pure reorder is zero changes. `null`/`undefined`/`""` compare
  equal; bullets compare as ONE whole-value change; skill keywords compare as
  a SET per category, so each added/removed keyword is its own change.
  `cv-diff.fixtures.test.ts` loads every file in
  `applika/backend/tests/fixtures/cv-diff/*.json` (backend-owned, the backend
  suite reads the same folder) and asserts `diffCv()` matches the server's
  `expected` output; it fails, naming the path, when the folder is missing or
  empty — it never skips itself.
- `use-cv-diff.tsx` is the ONLY thing that watches the form (`useWatch`) and
  turns a `CvDiffDetail` into `TailoredCvEditor`'s `diffSummary` (a
  `CvDiffSummaryBar`) and `diff` (`CvFormDiffSlots`) props, live — a Revert or
  an edit recomputes on the next keystroke. It owns the "Show changes" toggle
  state (default OFF, no persistence) and every `form.setValue`/`getValues`
  call behind Revert and Restore. Read-only passes `onRevert`/`onRestore` as
  `undefined` rather than omitting the marker — markers and badges still show
  on a locked copy, only the actions that would write to it are gone.
- The marker components (`ui-designer`-delivered, PRD 0007 spec) are
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
- **"Download changes"** (`cv-diff-download-row.tsx`, `CvDiffDownloadRow`)
  sits under `CvDiffSummaryBar` in the same `diffSummary`
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
  (`onExportMarkdown`/`isExportingMarkdown`): every surface
  that renders the PDF button renders both — `/cvs` tiles, `/cvs/editor`, the
  picker's `CvCard`s and the copy editor. Same pending/live-region pattern,
  one shared layout notice. `src/lib/pdf-download.ts` gained
  `cvMarkdownFilename`/`cvDiffMarkdownFilename`/`cvDiffPdfFilename` beside
  `cvPdfFilename`, and the services gained `exportMarkdown` (both
  `IBaseCvService`/`ITailoredCvService`) plus `exportDiffMarkdown`/
  `exportDiffPdf` (`ITailoredCvService` only) — all `GET` with
  `responseType: "blob"`, unlike the `POST` PDF routes.

**On a phone (PRD 0022).** Below md `/applications/cv?id=` is
v3/ApplicationCV: `application-cv-page.tsx` keeps every hook, mutation and
derived state and returns `ApplicationCvScreenView`
(`components/phone/screens/application-cv-screen.tsx`). The back bar is
"Application" → `/applications?focus=<id>` (`PhoneBackHref`, mounted
whenever `?id=` is there), then the Beta pill, the h1 "Application CV" and
"role · company".

- **Picker.** The master CVs are native radios named by the CV name and
  described by date and headline (visually hidden: the 44px label row is the
  target and carries the focus ring), each with "Download PDF of <name>",
  "Download Markdown of <name>", "Edit <name>" and "Delete <name>" beside it
  (Delete in a sheet); the new-CV tile, or today's limit sentence at three;
  "Tailor by keywords" only with `jobs` and a non-blank job description, off
  by default (today's `jobTools`); Create stays `aria-disabled` until a pick.
- **Editor.** The source pill ("Copied from …", or the deleted source in the
  warning tone), the job description clamped to four lines with Show more,
  the fit card (the board's look, `cv-fit-panel` slots kept), Changes with
  Show changes (today's `CvChangedMarker`s inside the rows), "Reordered by job
  match" (one `li[data-section]` per adjustment with the translated section
  title, the server's sentence for an unknown section; "Reordered" said once
  per row), every `PhoneCvSections` row closed (`firstOpen={null}`, with
  `diff` and `reordered`), Download PDF and Markdown, the diff downloads
  with today's names (`aria-disabled` with the reason on a 409 or an
  unresolved baseline), Delete copy, Save. No live preview and no layout
  notice, as on `/cvs/editor`.
- **Read-only.** A closed or archived application shows the banner (Lock
  when closed, Archive when archived) and the downloads, no Save; with no
  copy yet, the banner and today's locked sentence in a dashed card, no
  choices, tile or bar. With no job description: no Tailor, no fit request,
  and "Add a job description" opens today's `ApplicationFormSheet`.
- Hooks: `data-slot` `phone-application-cv`, `cv-copy-picker`, `cv-choices`,
  `cv-choice`, `tailor-by-keywords`, `cv-copy-editor`, `cv-copy-source`,
  `cv-copy-job-description`, `cv-copy-changes`, `cv-diff-adjustments`,
  `cv-copy-downloads`, `cv-copy-read-only`, `cv-copy-locked`,
  `application-cv-message`; `data-action` `create-cv-copy`,
  `toggle-job-description`, `add-job-description`, `save-cv-copy`,
  `delete-cv-copy`, `download-pdf`, `download-markdown`,
  `download-changes-pdf`, `download-changes-markdown`.

### Application Timeline (`src/components/timeline/`)

16 component files plus a service layer, hooks and `lib/timeline-view.ts`;
`interview_type` and the R-030/R-032 behaviour below sit on top of that base.
When porting from a NAMED source into this area, port it WHOLE (a
prose-subset port cost a 40% deviation on a prior feature) and extend it,
rather than reimplementing from scratch.

- **Vocabulary.** `timeline-types.ts` is the single vocabulary: the hardcoded
  3-value `event_type` (`interview | offer | denied`, NOT a DB catalog — R-021
  removed the old step/feedback definition catalogs entirely; PRD 0015 /
  ADR 0020 removed `note` and `feedback`: the API refuses them with 422 and
  stored ones read as interviews of type unknown), the hardcoded
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
  offer form and its close mode) is therefore the same 20/3 list, and
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
  applika's `Application` carries no per-row `cycle_id` on the wire.
- **R-030 (at most one initial-screening interview).** `TimelineEventForm`
  takes `otherEvents` (every event but the one being edited) and disables
  `initial_screening` in `InterviewTypeSelect` — disabled, not hidden, with
  `TIMELINE_COPY.initialScreeningTaken` under the trigger — whenever another event is
  already `interview`/`initial_screening`. The API 409s the same rule
  server-side; its detail reaches the user through the mutation's toast
  (`getApiError`).
- **A new event opens as an interview of type unknown (PRD 0015).**
  `emptyTimelineEventValues()` seeds `event_type: "interview"` and
  `interview_type: "unknown"`; `EventTypeSelector` shows the three types in
  one row at every width (`grid-cols-3`, the close dialog's shape too).
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
  `monthly | annually`), and the edit form renders `TIMELINE_COPY.legacyHourlyOffer`
  under it — the user must actively repick a period before the edit can save.
  Never default a legacy hourly offer to monthly/annually silently.
- **Closing is the event dialog in close mode (PRD 0016).** The owner: "Just
  one component for both uses". The row's flag opens
  `TimelineEventForm purpose="close"` (mounted by `applications-page.tsx`
  under its `"finalize"` action) — there is no separate close dialog and no
  close `alertdialog`. Close mode is a `dialog` named "Close application"
  (`TimelineEventDialog mode="close"`), offering `CLOSE_TYPE_OPTIONS` — None,
  Offer, Denied, never Interview — with the picked choice explained under
  the chips (`EventTypeSelector showHint`, `FINALIZE_OUTCOME_COPY`, wired as
  the group's description). It opens on None (`emptyCloseValues()` on every
  open), shows no checkbox and always closes. None shows no other field (the
  form passes `null` for the date and notes slots; the zod `none` branch
  validates nothing, so a stale note never blocks it) and sends a bodyless
  `POST /applications/{id}/finalize`. Offer/Denied show exactly Add event's
  fields and send the outcome body (`toFinalizeOutcomePayload`): the server
  writes the event and closes in one commit, so both happen or neither does.
  A save that closes caps the date at today (`DatePickerInput maxDate` plus
  the schema's "Pick today or an earlier date to close the application",
  keyed on Offer/Denied + `close_application`, which is `true` in close mode,
  `true` on every Add event open (the box below) and `false` for Edit event).
  Toasts: "Application closed";
  `getApiError` (fallback "Could not close it", the dialog stays open — a 409
  reopen message reaches the user this way); "Please fix the highlighted
  fields before closing". The description always contains the word
  "reversible" (`APPLICATION_CLOSE_COPY.reversible`) beside a muted `RotateCcw`,
  because `useReopenApplication` makes the promise real.
  `useFinalizeApplication` takes an OPTIONAL payload
  (`{applicationId, payload?}`) and invalidates `["applications"]`,
  `["statistics"]` and that application's timeline key (an outcome lands as
  a new event).
- **Add event closes with an Offer or Denied unless the box is unticked
  (PRD 0016).** The owner: "i want a checkbox - that is checked by default -
  this checkbox tells that opon creation this this event type, the job
  application will be closed automatically, the user can uncheck this
  checkbox to keep the application open". In create mode only, an Offer or
  Denied renders the `close_application` `FormField` with `ui/checkbox.tsx`
  FIRST in the dialog's footer, before Cancel: label "Close the application",
  `FormDescription` "You can reopen it later." (no `FormMessage`; a date
  error stays on the date field). `basis-full` below `sm` puts it on its own
  row above Cancel and "Add event"; `sm:basis-auto sm:mr-auto` keeps it left
  on the same row from `sm`. Because the footer sits OUTSIDE the `<form>`,
  `<Form {...form}>` wraps the whole `TimelineEventDialog`, not just the
  form — keep it lifted, or the footer `FormField` loses its context.
  `emptyTimelineEventValues()` seeds `close_application: true` and the
  open-effect's `form.reset` re-ticks it on every open; the field is
  UNMOUNTED for Interview but RHF keeps its value (no `shouldUnregister`), so
  Offer, untick, Interview, Offer shows it still unticked. Ticked, the save
  is ONE `POST /applications/{id}/finalize` with `toFinalizeOutcomePayload`
  — never a create then a finalize — toasting "Application closed" (an error
  toasts `getApiError` and the dialog stays open); unticked, or an Interview,
  it is `POST /applications/{id}/timeline` as before ("Event added"). Ticked
  also caps the date at today (`maxDate` + the closing message), and
  unticking lifts the cap. The submit stays "Add event"; `isSaving` (create,
  update or finalize) disables the box too. Edit event never shows the box
  and never finalizes (`timelineEventToFormValues` sets `false`, and the
  submit and `maxDate` both check `mode === "create"`). Tests toggle it by
  `getByRole("checkbox", { name: "Close the application" })`; Playwright's
  `.uncheck()` works on the Radix checkbox. Any e2e that adds an Offer or
  Denied to an application that must stay open unticks it first.
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
- **On a phone (PRD 0021).** The Application screen
  (`/applications?focus=<id>` below md) and Today's "Needs your attention"
  mount this module's `TimelineEventForm` through
  `components/phone/phone-timeline-dialog.tsx`: "Log update" is Add event
  (it reads the application's events for R-030), "Close it" / "Close" is
  close mode. A closed application (`finalized_at`) shows Reopen only
  (`useReopenApplication`), an archived cycle nothing to write. The history
  reads the timeline itself (`lib/application-history.ts`): a future event
  is "scheduled", a past interview followed by a later event "passed",
  anything else past "done"; the stage reached is the furthest of the
  events (`reachedStage`).
- **jsdom polyfills for Radix in `src/test/setup.ts`.** `hasPointerCapture` /
  `setPointerCapture` / `releasePointerCapture` / `scrollIntoView` and a
  `ResizeObserver` stub were added here — jsdom implements none of
  them, and Radix `Select`/`RadioGroup` (the interview type select, the event
  type selector and its close-mode chips, the salary period toggle) reach
  for all of them when opening or measuring. Any future test that opens a
  Radix `Select` needs nothing extra; these are global.
- **The event dialog is `max-w-3xl`, top-anchored, only its body
  scrolls.** `timeline-event-dialog.tsx`'s `DialogContent` is
  `top-4 translate-y-0 … sm:top-[8dvh] sm:max-h-[84dvh] sm:max-w-3xl` with
  `flex flex-col gap-0 p-0`; the header and footer are fixed `px-6` bands and
  only the middle `overflow-y-auto` div scrolls. Picking an event type grows
  or shrinks the form (schedule group, offer salary group, denied-reason box)
  without moving the footer's submit button off screen. Any other dialog whose
  body can grow tall should copy this shape rather than centring + `max-h` on
  the whole `DialogContent`.
- **A type-specific field group is UNMOUNTED, never CSS-hidden, and its
  payload is nulled or omitted from the wire side, not just left
  unfilled.** The interview-only schedule
  (start/end/`TimezoneSelect`) and the denied-only `DeniedReasonSelect`
  follow the same shape as the offer salary group before them:
  `TimelineEventFormFields` takes an
  `isInterview`/`isDenied`/`isOffer` flag and render the group or `null`, so a
  value the user typed before switching types never sits in an invisible
  control. **A non-interview event never sends a schedule, on CREATE or
  EDIT, whatever was stored.** `toTimelineEventPayload` takes only
  the form values — no `original`/stored-event argument any more — and reads
  the CURRENT `event_type`: for `interview` it sends `start_time`/`end_time`/
  `timezone` (nulling `timezone` whenever `start_time` is blank, because
  `TimezoneSelect` cannot be cleared and always holds a real zone); for every
  other type it OMITS the three keys from the payload ENTIRELY — not `null`,
  ABSENT — even when editing an event that already carries a legacy stored
  schedule. This replaces an earlier interim rule, which kept an already
  non-interview event's stored schedule unchanged on an edit that left the
  type alone; the owner's final call (2026-09-18) is that a non-interview
  event is blocked from ever carrying a schedule, full stop, so there is
  nothing left to preserve. `toFinalizeOutcomePayload` is unaffected: it never had a
  stored-schedule case.
- **The response mirrors the rule: `start_time`/`end_time`/`timezone` are
  ABSENT (not `null`) on a non-interview `TimelineEvent`, never REQUIRED
  fields.** `services/types/timeline.ts`'s `TimelineEvent` marks
  all three optional (`?:`); `toHourMinute` in `lib/timeline-view.ts` passes
  `undefined` through unchanged rather than crashing or coercing it to
  `null`, and `timelineEventToFormValues`'s `event.startTime ?? ""` /
  `event.timezone || browserTimeZone()` already tolerate a missing key the
  same way they tolerate `null`. Nothing may crash or render the string
  `"undefined"` when the keys are absent — see
  `timeline-event-card.test.tsx` and `lib/timeline-view.test.ts`.
- **A card shows the zone READABLE, exactly like
  `TimezoneSelect`.** `formatTimeRange` (`timeline-format.ts`) renders the zone
  through `timeZoneLabel` from `timezone-options.ts` — the SAME formatter the
  select's trigger and options use (underscores as spaces, e.g.
  `America/Sao Paulo`) — never the raw IANA id and never a second
  implementation of the same substitution. The STORED and SENT value is
  always the raw id (`America/Sao_Paulo`); only the on-screen label is
  reformatted.
- **`TimezoneSelect` (`timezone-select.tsx`) and `timezone-options.ts`**
  are the pattern for any future searchable single-choice
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
- **`DeniedReasonSelect`/`DeniedReasonBadge`** are the
  `denied_reason` counterpart of `InterviewTypeSelect`/`InterviewTypeBadge`:
  a plain Radix `Select` (not a combobox — only 10 fixed values), grouped
  Unknown | the 8 named reasons | Other, defaulting to `unknown`
  (`DEFAULT_DENIED_REASON`) via the same "seed on the effect that flips
  `isDenied`" pattern `interview_type` already used. The card badge reads
  `null`/absent as `unknown` and carries a `sr-only` `"Reason: "` prefix —
  assert on `/reason:\s*<label>/i`, never an exact string, the same convention
  `InterviewTypeBadge` already set.

### Agenda (`src/components/agenda/`, `app/(protected)/agenda/agenda-page.tsx`)

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
    R-012) — loaded on open, read-only (no `renderActions`, no
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
- **Below md the page is the Schedule board** (`AgendaPage` returns
  `screens/agenda-screen.tsx` `AgendaScreen`; the desktop body is
  `AgendaDesktopPage`, unchanged). It reuses this module's primitives:
  `agenda-view.ts` now also exports `agendaStartInstant(step, localTz)` (a
  timed step's start in its own zone, an untimed one's local midnight),
  `calendarDayIn` and `getUserTimezone`; `isStepPast` decides "Done" and
  the bell (timed upcoming only), `getDisplayTime` the local times. The
  window is the shown week plus 60 days (`useAgenda({from_date, to_date})`,
  so the phone's request differs from the desktop's ±30 days default).

### Application drafts (`src/components/application-drafts/`, PRD 0010)

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
- **The draft carries a date from the moment step 1 exists (AC1,
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
  job link, side by side (AC3/AC4, R-037) — same `ROW2` grid both
  fields before it use, not a full-width row of its own any more.
- **Card-free, flat sections (AC10-AC16, R-043..R-049).**
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
- **Step 1's bottom row is Cancel + Continue to CV (AC15).**
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
  **Unmounting sends the save still waiting out its delay** (leaving the
  page, or crossing md, which remounts it), with the last value: nothing
  when no save waits (no change, or not ready), and a change queued behind
  the request in flight goes once that request settles, never two at once.
  After unmount `onSave` is the last rendered one and no state is set; the
  effect marks itself mounted again on Strict Mode's second mount. A draft
  created by such a save takes its `?id=` only while the address is still
  `/applications/new-with-cv` (a remount across md), never after the user
  left. The page that mounts next seeded from the cache, so it shows a LATER
  save it did not make (`savedAt`: `updated_at`, else `created_at`) while its
  form still holds what it last seeded or saved, for the application form and
  the CV copy alike; a stale refetch is never later, so it never stomps an
  edit.
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
- **Applications | Drafts tabs (AC8/AC9, R-041/R-042).** On the
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
  link (`applications.page.newWithCv`, the component subscribes through `useTranslations`) instead of `null` — including
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
- **On a phone (PRD 0021).** Below md the page renders v2/Draft
  (`DraftScreen`) from the SAME state, after all its hooks ran: both forms,
  both autosave loops, Finish and the beforeunload guard are unchanged. Step
  1 puts the board's six fields first and the rest (the application date
  included) under "More details"; step 2 summarises the copy as the board's
  rows and edits it in place ("Edit the CV copy"), see **Phone shell**.
  Crossing md remounts the page: the phone page sends the change typed in
  the last second as it unmounts, and the desktop page shows it once the
  server has it (and the reverse).

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

**Below md** (PRD 0022) `/admin/companies` and `/admin/platforms` are
v3/AdminCompanies and v3/AdminPlatforms, one view (`CatalogScreenView`,
`components/phone/screens/admin-catalog-screen.tsx`) on each page's own
query, forms, schema and mutations: search, the All / Public / Private chips,
a card per row (the name with a Private pill, the address without its
scheme, who added it and how many applications use it; Companies adds the
status pill and switch), `PhonePager`, and Add, Edit, Approve and Delete in
sheets. A refused Add, Edit or Delete is said once, inside its sheet
(`[data-slot="catalog-form-error"]`, `[data-slot="catalog-delete-error"]`):
the pages pass `toastError: !isPhone` to the shared mutations, so no toast
repeats it; the desktop keeps today's toast. The company status switch has
no sheet, so its refusal stays a toast (a per-call `onError` on the phone).
Approve shows "Approve" and is named "Approve <name>"; its sheet (an
`alertdialog` with the row's address) keeps a 409 `detail` VERBATIM inside
it (`[data-slot="approve-catalog-error"]`). A used row's Delete is
`aria-disabled` on a phone, still focusable and described by its reason
(`[data-slot="catalog-delete-reason"]`); the desktop table keeps `disabled`.

### Company picker = platform picker; a three-section application form; a paginated admin Platforms page (PRD 0010)

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
- **`components/applications/form-section.tsx`** (`FormSection`) is the Card
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

### Sign-in, welcome, membership badge (ADR-0024, ADR-0026)

The owner (PRD 0018): "As an applika user who belongs to the Borderless
community, I want to sign in to applika with my Borderless email and password
instead of GitHub, so that my BASE or PSP membership shows up as a badge on my
account and gives me access to the biweekly reports." Since ADR-0026 and
PRD 0020 the sign-in is Borderless's own OpenID Connect sign-in, applika a
confidential client from its server: the web shows one button and never asks
for, holds or sends a password, a code, a state or a token. GitHub sign-in
and Discord linking are gone; nothing in `src/` calls `/auth/github/login` or
`/auth/link/discord`. Not behind a beta gate (ADR-0024 §9, ADR-0026).

- **`/login`** (`app/login/page.tsx` Suspense shell, `login-page.tsx`) is the
  ui-designer's `SignInScreen` (`components/auth/sign-in-screen.tsx`):
  **option A at md and up and option C below md** (the owner: "mudar a tela
  de login do desktop de como é hoje para a opção A do artefato v3, apenas a
  versão de desktop, a verão mobile se mantem como na opção C, apenas
  adicione o icone da borderless no botão "continue with borderless" como
  exemplifica na opção A"; option A is `signin/A_Desktop` of the frozen V2
  artifact). Both trees are mounted and CSS shows one (`md:hidden` /
  `hidden md:flex`), so there is no hydration mismatch.
  `main[data-slot="sign-in-phone"]` is `signin/C_Mobile` (the glow, the
  Applika app icon 104 with the Borderless badge
  `[data-slot="sign-in-badge"]`, which is in this tree only, eyebrow
  "applika × Borderless", h1 "One account for your whole job search", lead
  "Sign in with Borderless. It confirms it's you and sends you back here.",
  the CTA h56 "Continue with Borderless" (its mark at 20px), and the account link "I don't have a Borderless
  account" at the bottom). `[data-slot="sign-in-desktop"]` is A_Desktop
  whole: the mesh (`.ph-a-mesh`) and the dots (`.ph-dots`) fill the root,
  `main.ph-a-main` centres one 448px card (`.ph-a-card`: padding 40,
  radius 24) holding the Applika tile, the dashed link mark and the
  Borderless tile (`[data-slot="sign-in-tiles"]`, `.ph-a-tile`,
  `.ph-a-link`, decorative), h1 "Sign in to applika" (`.ph-a-h1`, always,
  even with `&cli=1`), the lead "Use your Borderless account. Borderless
  confirms it's you and sends you back here." (`optionA.lead`), the states,
  the 48px CTA "Continue with Borderless" (`.ph-a-cta`), a `Separator`, and
  "No account yet? Create a Borderless account" (`.ph-a-foot`,
  the link `.ph-a-signup`; `optionA.noAccount` with a `<link>` tag). Below
  828px (`@media (max-width: 51.74rem)`, 2 × (224 + the pair's 166 + 24)),
  where the pair can stand over the card, `.ph-a-main` gets `padding-block:
  76px` (pair top 20 + 36 + 20, symmetric, so the card stays centred and a
  phone in landscape, 812×375, scrolls to the button); from 828 up the
  board's centring holds (1280×450 does not scroll). Equal to the board at
  1440×900. Gone with C_Desktop: `AppIconWithBadge large`, `.ph-c-side*`,
  `.ph-feat`, `.ph-c-main`, `.ph-c-headline`, the `clamp()` block,
  `optionC.about` / `feat*` and `PhoneNewspaperC`. `ph-` classes style both
  trees (`.ph-app` on the root); the theme + language pair is mounted once
  outside both (see **i18n**). The Applika mark is `role="img"` "Applika";
  the Borderless images are `public/borderless-logo.png`
  (`BORDERLESS_BADGE_SRC`, the Borderless mark on a transparent ground,
  128×128) through `next/image` `unoptimized`: the phone badge `alt` "with
  Borderless" (`.ph-c-badge`: the tile's `--background`, 8px inset, no
  border), A's tile `alt` "Borderless" (14px inset), and the CTA's logo
  (`img[data-slot="sign-in-logo"]`, 18px on A, 20px on C via `.ph-c-logo`)
  `alt=""`, decorative. Both CTAs are Career Forge's outline button,
  `.ph-btn.ph-bl` (the `--background` fill, a 1px `--border`, the
  foreground words at weight 500, a 12px gap, `--muted` on hover), never
  `.ph-pri`.
  Each tree's lead describes its CTA (`aria-describedby`, an id per tree).
  The CTA is `[data-action="sign-in-borderless"]`, one per tree; the
  sign-up link (`[data-slot="create-borderless-account"]`, one per tree)
  opens `APP_CONFIG.borderless.signUpUrl` in a new tab (`rel="noopener
noreferrer"`, described by the sr-only "Opens in a new tab."). The button
  does `window.location.assign(services.auth.borderlessLoginUrl())`
  (`{apiBaseURL}/auth/borderless/login`, a top-level navigation: the API 307s
  to Borderless with PKCE S256, state and nonce, no `prompt`). It stays
  pending (`aria-disabled` + `aria-busy`, focus kept, opacity .75, the
  spinner in the logo's place and the label "Opening Borderless…" in both
  trees, plus ONE
  sr-only `role="status"` `[data-slot="sign-in-pending-status"]` with the
  same words) until the browser leaves;
  `login-page.tsx` resets it on `pageshow` with `event.persisted` (Back
  from Borderless restores the page from the bfcache). No `input` and no
  `form` on the page. `SignInLink` (`components/auth-buttons.tsx`) is a plain
  link to `/login`.
- **The callback comes back to `/login`** (`WEB_SIGNIN_URI`): signed in (the
  cookies are set; the page moves on with `router.replace`, `/welcome` while
  `user.github_restore.prompt` — the return-to waits — else
  `consumeReturnTo() ?? "/dashboard"`, `signedInLandingFor`) or with
  `?error=<code>` (`&cli=1` on a CLI attempt). The screen resolves
  `errors.<code>` itself through `useTranslations("errors")`, so the words
  follow a language switch; `en` is the API's `detail`, word for word.
  `SIGN_IN_ERROR_CODES` is an ALLOWLIST (AUTH-1003, 1005..1008, 1017..1019,
  1046..1049, GEN-1005, all free of ICU arguments): a code from the URL
  never puts an arbitrary catalog sentence on screen, and anything else reads
  `errors.unknown` (`signInErrorKey`). A new code the API sends to `?error=`
  is added there. **The five states** sit under the lead in each tree:
  ready; pending; refused (the alert `.ph-signin-alert`, its code's words);
  from the command line (`&cli=1`: the hint `.ph-signin-hint` with a
  terminal icon); refused from the command line (the alert, with the cli
  line inside it). Each tree has its own `[data-slot="sign-in-error"]`,
  always mounted with `role="alert"` and `data-code` (the shown key), and
  its own `[data-slot="sign-in-cli-hint"]` "Return to your terminal and run
  `applika login` again." (the command in `<code>`). **Focus on load lands
  in the VISIBLE tree** (`matchMedia(PHONE_QUERY)` picks it, never the
  hidden one): its alert box (`tabindex="-1"`) when there is an error, else
  its CTA. Tests scope every query to a tree's `data-slot` (vitest renders
  both; Playwright's role queries see the visible one, but a `data-slot`
  locator matches both — name the tree, e.g.
  `[data-slot="sign-in-phone"] [data-slot="sign-in-error"]`). A refused CLI attempt
  stays on screen even for a signed-in browser; a stale WEB error with a live
  session moves on. "Sign in" is in the h1, the button and the AUTH-1049
  words: Playwright needs `exact: true`, and never `getByRole("alert")`
  (Next's route announcer is one too).
- **`applika login` never shows an applika page**: `/auth/cli/authorize` and
  `/auth/cli/login/{id}` 307 straight to Borderless with `prompt=login`, and
  the callback 307s to the CLI's loopback (or `/cli/code`). Only a refusal
  lands on `/login?error=<code>&cli=1`. `/login?cli=1` without an error has
  no flow today (the screen shows the hint as a grey note).
- **`/welcome`** (`(protected)/welcome/welcome-page.tsx`, `WelcomeScreen`) is
  the one-time choice of a new account: "Restore your data from GitHub"
  (`POST /auth/github/restore` → `window.location.assign(authorize_url)`; the
  server marks the prompt seen) or "Start fresh"
  (`POST /users/me/github-restore/dismiss`, the cached user drops `prompt`,
  then `consumeReturnTo() ?? "/dashboard"`). `(protected)/layout.tsx` sends
  every other page to `/welcome` while `user.github_restore.prompt`, and
  consumes no return-to meanwhile. An account that answered is sent from
  `/welcome` to the dashboard.
- **`user.borderless`** is `null` or
  `{status: "active" | "needs_reconnect", email, checked_at}` (`checked_at`:
  the last membership read). The API re-reads the membership at every
  sign-in and whenever its Redis access token is gone (about once an hour;
  at session refresh and at member-gated requests); the web just shows the
  result.
- **`membershipAccess(user)`** (`components/badges/membership-badge.tsx`) is
  the ONE rule: no recorded badge `none`; a badge counts (`held`) only while
  `borderless.status === "active"`, else `needs_reconnect` (Borderless refused
  applika's grant). `MembershipBadge` reads "BASE"/"PSP", `role="img"` named
  "Borderless BASE member" / "Borderless PSP member" (`purpose="label"` for a
  webhook's badge: plain text). Held, it shows in `user-menu.tsx` (the rail
  card beside the name, `sm`, wired to the trigger with `aria-describedby`;
  the menu label in both variants) and beside the profile h1 (`lg`, a
  sibling, never inside it). `needs_reconnect`: no chip, and the menu offers
  "Sign in again" (`[data-slot="sign-in-again-menu-item"]`, `onSignInAgain`,
  by default `useAuth().logout("/login")`).
- **Reports follow the badge.** `navItemsFor(isAdmin, features, {
hasReportsBadge })` lists Reports only with a recorded badge
  (`badges.length > 0`, held or not; administrators included).
  `badges/badge-gate.tsx` `BadgeGate` wraps `/reports` and `/reports/[day]`
  ABOVE the report hooks: `none` → "Reports are for Borderless BASE and PSP
  members" and why; `needs_reconnect` → h1 "Sign in again to open your
  reports", the API's AUTH-1050 words and a "Sign in again" button
  (`logout("/login")`), never a password form (the h1 takes focus when focus
  was lost); `held` → the reports. `hooks/use-repports.ts` queries are
  enabled only while held (`useHoldsReportsBadge`, a cache read of the user),
  and a report request answered **403 AUTH-1050** (list, detail or submit)
  runs `lockOnRefusedGrant`: the cached `["user","me"]` gets `borderless.status
  = "needs_reconnect"`, so the gate, the chip and the menu all flip at once.
  The API is the rule: 403 RPT-1001 (no live badge) / AUTH-1050 (a live badge
  while the grant is refused; RPT-1002 is retired).
- **Below md** `/reports` and `/reports/<day>` keep the same gate with
  `closed={renderReportsClosed}`: v2/Reports' closed layout (lock tile,
  today's words; `none` → "Visit Borderless" + "Sign in again",
  `needs_reconnect` → "Sign in again" alone). The gate stays above the
  report hooks: no report request without a held badge.

### Profile — GitHub restore and membership (`src/components/profile/`, ADR-0024)

- `GithubRestoreCard` ("Restore data from GitHub") renders only while
  `github_restore.available` (no GitHub identity on record);
  `hooks/use-github-restore.ts` `useStartGithubRestore` does the top-level
  navigation (409 → `getApiError` toast, 503 → "Restoring from GitHub is
  unavailable right now"). Its `pending` is `isPending || isSuccess` until the
  browser leaves.
- GitHub's callback 307s to `/profile?account=github&status=restored|
not_found|has_data|already_bound|error`. `profile-page.tsx` reads it once
  through a lazy `useState`, invalidates (everything on `restored`: the
  browser is now the OLD account; the user otherwise), and clears the URL
  with `window.history.replaceState(null, "", "/profile")` — never
  `router.replace()`, a no-op on the same path in this static export.
  `GithubRestoreNotice` words live in `github-restore-copy.ts`; `restored` is
  `role="status"`, the rest `role="alert"`.
- The held badge (a recorded badge while `borderless.status === "active"`)
  sits beside the profile h1. There is no confirm card and no password
  field: a `needs_reconnect` binding shows no chip, and the account menu
  offers "Sign in again".
- `UserProfileAvatar` uses the GitHub avatar only when `github_id` (a JSON
  number) is set; a Borderless-only account shows initials.
- Devices: `sign_in_method` `borderless` reads "Borderless in the browser";
  `github_web` stays for ended rows still listed.

### Profile — Devices (`src/components/profile/devices-*.tsx`, ADR-0019)

The owner: "a lost of devices connected and a section to revoke the access,
this must be displayed in a new tab inside user profile". `/profile` is now
two `Tabs` (`variant="line"`): "Profile" (today's content, the edit form and
the GitHub restore notice) and "Devices". `?tab=devices` (the `/device` page's "See
your devices") opens Devices once, through a lazy `useState`; switching tabs
is local state. **Not gated** (owner: "Gate nothing") — no `FeatureKey`, no
`FeatureGate`, no `useHasFeature`.

- `DevicesTab` / `DeviceRow` / `devices-copy.ts` are the ui-designer's
  presentational components; `ProfileDevices` in `profile-page.tsx` wires
  them, and Radix unmounting the inactive tab is what fetches the list only on
  first open. Hooks in `hooks/use-sessions.ts`: `useSessions` (key
  `["sessions"]`, `SESSIONS_QUERY_KEY`, server order kept: active by last use,
  then ended within 30 days), `useRevokeSession`, `useRevokeOtherSessions`;
  both invalidate on success and toast
  `rateLimitNotice(error) ?? "Failed to revoke device"`.
- A row: name (h3), "This device" on the current one, status in words
  (Active / Signed out / Revoked / Expired), Client, How it signed in, IP
  address (last, plus "Signed in from <ip>"), Granted, Last used ("Never"),
  then Expires (active) or Ended (`ended_at ?? expires_at`). Hooks:
  `li[data-slot="device-row"][data-session-id][data-status][data-current]`,
  `[data-slot="device-status"]`, `[data-slot="this-device"]`,
  `ul[data-slot="active-devices"|"ended-devices"]`,
  `[data-slot="sign-out-others"]`.
- Every action is behind a `ConfirmDialog`: "Revoke" → "Revoke access";
  the CURRENT row's "Sign out" → "Sign out" → `DELETE /users/me/sessions/{id}`
  (the server clears both cookies) → `window.location.assign("/login")` —
  NOT `useAuth().logout`, which goes to `/`. "Sign out all other devices" →
  `POST /users/me/sessions/revoke-others`, `aria-disabled` (still focusable,
  described by "No other device is signed in.") when nothing else is active.
- Name clashes for e2e (substring match): "Sign out" is inside "Sign out all
  other devices"; "Revoke" inside "Revoke access"; "Active" is the h2 and
  every badge; a web row's name equals its client label. Use `exact: true`,
  the data hooks, and scope confirms to `getByRole("alertdialog")`.
- **Below md** the tab is the Devices board (see **Phone shell**, the
  account area): `?tab=` is read live and the switch is two links; a card
  shows the name, "This device", how it signed in, IP address, Last used
  (relative) and Expires; each action confirms in a `PhoneConfirmSheet`
  (an `alertdialog` too, so the scoping above holds); zero other devices
  shows "No other device is signed in." instead of the button. The same
  hooks and calls.

### Admin — Report webhooks (`app/(protected)/admin/report-webhooks/`, ADR-0024)

The owner: "i must be able to configure a webhook for a pair of badges (1 or
more). Example, one webhook for "base" badge and another no "psp". Remove any
wording to Discord in admin area." A webhook holds one or more badges (BASE,
PSP or both); a report goes to every webhook holding a badge its author holds.
Nav tab "Report webhooks" (lucide `Webhook`) in `admin-nav.tsx`;
`admin/discord-webhooks/page.tsx` is a client `router.replace` to it (a saved
link still works; static export, no rewrite).

- `services/types/admin.ts` `AdminReportWebhook` (`id`, `label`, `badges`
  `("borderless_base"|"borderless_psp")[]` ordered base, psp — `[]` on a
  carried-over row, `webhook_url_masked`, `created_at`, `updated_at`);
  `CreateReportWebhook` (`badges` 1..2 distinct) / `UpdateReportWebhook`
  (optional `badges` REPLACES the set, never empty); there is no `badge`
  field. `admin-service.ts` CRUD on `/admin/report-webhooks`; `use-admin.ts`
  key `["admin","report-webhooks"]` (`ADMIN_REPORT_WEBHOOKS_KEY`).
  Create/update hooks raise no error toast: the page shows the 404/409/422
  `detail` verbatim in `[data-slot="report-webhook-form-error"]`; delete
  toasts its own.
- `components/admin/report-webhook-list.tsx` / `report-webhook-form-dialog.tsx`
  (four list states; one chip per badge, or "No badge, receives nothing";
  `li[data-slot="report-webhook-row"][data-webhook-id][data-badges]` with the
  keys space-separated or `none`, chips `[data-slot="report-webhook-badge"]`).
  The dialog's badges are a `role="group"` named "Badges" of two `ui/checkbox`
  (each named BASE / PSP, its one-line hint as description), kept in base, psp
  order by `toggleBadge`. `report-webhooks-page.tsx` owns the zod schema,
  mirroring `backend/app/application/validators/report_webhook.py` (the webhook
  URL regex, BIGINT as `BigInt`, label ≤ 100 code points) plus at least one
  badge ("Choose at least one badge: BASE or PSP", the API's words) on create
  AND edit — a carried-over row opens with none checked and Edit must pick one.
- The URL is a secret: the edit form reopens blank, a blank URL keeps the
  stored one, and only changed fields are sent (`badges` only when the set
  differs from the stored one). Only the masked form is ever shown.
- **Below md** the page draws v3/AdminWebhook (PRD 0022) under the admin
  header, which heads it "Report webhooks" with its lead (see **Phone
  shell**): one card per webhook (label, a pill per badge, the masked
  address, Edit and Delete with today's names), Delete confirmed in the
  board's `alertdialog` sheet, "Add webhook" after the cards, today's words
  in the empty and failed-load cards. The delete sheet stays open while the
  DELETE runs (Delete busy, Cancel and Escape refused, the card dimmed
  behind it) and shows a refusal inside it
  (`[data-slot="report-webhook-delete-error"]`, `.ph-notice.ph-wh-refusal`,
  `getApiError`'s words) with no toast; the page's phone `onDelete` resolves
  with those words, or nothing once deleted. At md and up delete toasts as
  today. Add and edit open
  `PhoneReportWebhookSheet` (`components/phone/phone-report-webhook-sheet.tsx`),
  which takes `ReportWebhookFormDialog`'s props, so the page swaps one for
  the other on the same form, zod schema, submit and server refusal: the URL
  field opens blank, the edit sheet shows "Current:" with the masked
  address, the badges are two `PhoneCheckOption`s (`role="checkbox"`, named
  BASE / PSP, described by their line) in a fieldset "Badges", field errors
  sit under their fields and the refusal
  (`[data-slot="report-webhook-form-error"]`) above the buttons. The same
  query and handlers. The row hooks
  (`li[data-slot="report-webhook-row"][data-webhook-id][data-badges]`,
  `[data-slot="report-webhook-badge"]`, `[data-slot="report-webhook-url"]`)
  are the same at both widths.
- **No Discord wording in the admin area** except the address field: its
  add-mode placeholder `https://discord.com/api/webhooks/…` and "Invalid
  Discord webhook URL" (the stored masked address naturally reads
  `discord.com` too). `report-webhooks-page.test.tsx` asserts it.
  Playwright: `.check()`/`.uncheck()` the checkboxes.

### Admin — Jobs (`app/(protected)/admin/jobs/`, PRD 0012, R-033..R-035)

`/admin/jobs` (`page.tsx` shell over `jobs-page.tsx`), nav tab "Jobs" (lucide
`Search`, after Platforms) in `admin-nav.tsx`. Pattern:
`admin/report-webhooks/`. The h1 is "Job sources".

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
- **Below md** the same page draws v2/Admin's Jobs under the admin header:
  one card per source (`li[data-slot="job-source-row"]` with the same
  `data-source-code`/`data-enabled`; `tr` at md and up, so a locator that
  must work at both widths drops the tag), a `PhoneSwitch` "Collect from
  <name>", Last run / Status / Listed jobs, the last error, then Run now and
  the same notice region. Same query, `pendingIds` and handlers.
- **Run now** (`useStartJobRun`, no toast in the hook): the page clears the
  notice BEFORE each POST (or the same words twice are not re-announced). 202
  → toast "Run started", the list refetches, and then refetches every 3 s for
  60 s (`JOB_RUN_POLL_*`) — the API has no "running" state or end signal. 409
  → an info notice with the server's `detail` ("A run is already in
  progress"); 503 and anything else → an error notice with the `detail`
  ("Background service unavailable"), or "Could not start a run. Try again."
  when there is no string `detail`. Pending uses the job board's pattern
  (`aria-disabled` + `aria-busy`, focus stays).

### Admin — Features (`app/(protected)/admin/features/`, PRD 0013)

The owner: "with the jobs featurw implemented i would like to block this
feature under beta features and release only to selected beta users". Nav
tab "Features" (lucide `FlaskConical`, after Jobs) in `admin-nav.tsx`.

| Route                       | Shell                                     | Component                                                               |
| --------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `/admin/features`           | `admin/features/page.tsx`                 | `features-page.tsx` — key, name, stage, beta users, released, You       |
| `/admin/features/view?key=` | `admin/features/view/page.tsx` (Suspense) | `feature-view-page.tsx` — header + stage action, Your access, beta list |

- **The rows have no `id`: `key` is the identity** in URLs, React keys and
  every `/admin/features/{key}*` call. Types in `services/types/features.ts`
  (`AdminFeature`, `AdminFeatureMe`, `AdminFeatureUser`,
  `AdminFeatureUsersPage`); calls in `admin-service.ts` (`getFeatures`,
  `getFeatureUsers`, `addFeatureUser`, `removeFeatureUser`, `setFeatureStage`,
  `optOutFeature`, `optInFeature`).
- **Keys** (`hooks/use-admin.ts`): `["admin","features"]`
  (`ADMIN_FEATURES_KEY`) and `["admin","feature-users",key,params]`
  (`keepPreviousData`, so the search input never unmounts). EVERY feature
  mutation invalidates both AND `["user","features"]` — a release, a list
  change or an opt-out can change the admin's own nav — and its `onSuccess`
  RETURNS that promise, so the mutation (and the switch's pending state)
  lasts until the new `me` is on screen. No toast in the list/stage hooks:
  the components show the server's `detail` in place. Only
  `useSetFeatureOptOut` toasts (`getApiError`), since the switch has no error
  slot.
- **The ui-designer components are `components/admin/feature-*.tsx` and
  `feature-copy.ts`** (every word, `formatFeatureDate`, `featureHref`). Their
  promise callbacks (`onConfirm`, `onRemove`, `onAdd`) resolve with nothing
  on success, with the server's string `detail` to show it verbatim, and
  reject for anything else (a generic message); `feature-view-page.tsx`'s
  `detailOrThrow` is that adapter.
- **Not found.** No `?key=`, a features list without the key, or a 404 on
  the beta-list GET renders `FeatureNotFound` (the 404 `detail` as its h1).
- **Beta list.** Search (username only, debounced 250 ms, back to page 1;
  a CLEARED search applies at once, so the cached full list shows without an
  "empty" flash), 25 per page, remove behind an AlertDialog. A page that
  emptied under the admin offers "Go to page N". Added / Added by fold into
  the username cell below `lg`, not `sm`: from `md` the rail takes 240px and
  Remove would scroll off. A failed features load shows only the header
  error — Your access and the list need the stage and name to word themselves.
- **"Add user" dialog** searches `GET /admin/users?search=` (username or
  email, `useAdminUserSearch`, 10 rows, debounced; idle when blank).
  `GET /admin/users` has no "already listed" flag, so `listedUserIds` is
  DERIVED: the beta list searched with the same text (`per_page=100`) plus
  the page on screen. A listed user found only by email can still show
  "Add" — harmless, the PUT is idempotent (AC3).
- **Stage.** `FeatureStageAction`: beta → "Release to everyone", general →
  "Move back to beta", each behind an AlertDialog; the move-back body says
  "Users who are neither on this list nor admins lose access." The list is
  kept and editable in both stages.
- **Your access** (`FeatureOwnAccess`): "Use this feature myself", on = no
  opt-out (`true` → `DELETE …/opt-out`, `false` → `PUT …/opt-out`), the
  reason from `me.via`/`me.opted_out`. LOCKED (`aria-disabled`, still
  focusable, still showing the STORED choice) in general and while the
  admin is on the beta list (Plan corrections 9), with the words "Released
  to everyone. Your choice applies again if it moves back to beta." / "You're
  on the beta list, so you keep access. Remove yourself from the list to
  hide it." Pending passes `pendingValue` (the asked-for value) with
  `aria-busy`; focus stays.
- **Disabled checks.** Every disabled control here is `aria-disabled`, never
  `disabled`: jest-dom's `toBeDisabled()` does not see it, assert
  `toHaveAttribute("aria-disabled","true")`.
- **Name clashes** for e2e (substring match): "Release to everyone" / "Move
  back to beta" are both trigger and confirm, "Remove" is inside "Remove
  <user>" — scope confirms to `getByRole("alertdialog")` and use
  `exact: true`; "Beta list" is inside "Add users to the beta list"; reason
  vs hint sentences ("…released to everyone." / "Released to everyone. …")
  — assert the full strings.
- **Below md** (PRD 0022): `/admin/features` is v3/AdminFeatures
  (`AdminFeaturesScreenView`, `components/phone/screens/admin-features-screen.tsx`)
  under the admin header, which heads it "Features" with its lead: one card
  per feature, a link to its page named by the feature name, the stage pill,
  Key / Beta users / Released and the "You" row; today's words in the empty
  and failed-load cards (`PhoneEmptyCard`, `PhoneAlertCard`, "Try again").
  `/admin/features/view?key=` is v3/AdminFeatureView
  (`AdminFeatureViewScreenView`) on the page's own queries, mutations,
  search and page state, the not-found rule included: back "Features" and
  the System pill (no chips), the h1 and the stage pill, Key / Released, the
  stage button with its confirm sheet (Move back to beta confirms with the
  primary button), Your access (locked as above, showing the stored choice),
  the beta list (count, search, Add user, Remove in a sheet, `PhonePager` at
  25), the Add user sheet (it focuses its search; "Add <user>", then "<user>
  is on the list"; Done) and the not-found card ("Back to features"). Every
  confirm sheet is an `alertdialog` with the server's `detail` in place.

### Job board (`src/components/jobs/`, PRD 0012)

Ported from Ían Muliterno's `job_scrapping` branch (`e670914`, his job-card,
job-filters, job-list, job-detail-sheet, types, service and hook) onto the
PRD 0012 contract. Every commit porting his logic ends with the trailer
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
  anywhere (the page strips `best_fit`) and a disabled "Minimum fit". Without
  `cvs` there is no fit at all, and no invitation: see **Beta features**.
- **Draft / Applied.** `JobStatusBadge` links "Draft" to
  `/applications/new-with-cv?id=<id>` and "Applied" to
  `/applications?focus=<id>` (`jobApplicationHref`). "Start application" is
  rendered ALWAYS, beside the badge (orchestrator decision):
  starting again is how AC8's "offers to open the one that exists" is
  reached.
  That holds with `cvs`; without it (PRD 0015) there is no Start and "Draft"
  is plain text (`linkDraft={false}`), while "Applied" always links.
- **The start flow.** `StartApplicationFlow` (`start-application-flow.tsx`)
  is the data half of `StartApplicationDialog`, mounted once per page: master
  CVs from `useBaseCvs`, fit labels and `canTailor` from `useJob(job.id)` —
  `JobSummary` has no `description_text`, so the dialog MUST read the detail.
  "Verbatim copy" is preselected; "Tailor by keywords" is NOT RENDERED for a
  blank description (R-026), never just disabled. No CV picked sends
  `{job_id}`; a CV sends `{job_id, base_cv_id, tailoring}`; both always add
  `application_date: localCalendarDay()`, so the draft carries the
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
- **On a phone (PRD 0021).** Below md `/jobs` is v2/Jobs and `/jobs/view`
  v2/JobDetail, inside the same `jobs` gate, on the same hooks and URL keys
  (`use-job-board.ts` holds the URL writing and the saved-search wiring both
  widths use); "Show more" replaces the pager and writes no `?page=`; a card
  shows its Draft/Applied mark or Dismiss, and Start application is the job
  page's, as the StartApplication sheet on `useStartApplicationFlow`. See
  **Phone shell** for the hooks and the locator traps.

### Beta features (PRD 0013)

The owner: "with the jobs featurw implemented i would like to block this
feature under beta features and release only to selected beta users, all mew
features in the feature will follow the same pattern, start as beta and then
release to everyone". The workspace rule is `.claude/rules/beta-features.md`
(at the workspace root, outside this repo): every new feature users who are
not admins can see starts in beta, gated the way `jobs` is below.

- **The API is the rule; the web only hides.** `GET /users/me/features`
  (`services.features.getMine()`, `services/types/features.ts`) answers the
  caller's own `{key, stage}` list; an absent key is no access, and the
  server already 404s every gated route without it. `FeatureKey` is the union
  of the keys the web gates on (`"jobs" | "cvs"` today) — a new feature adds
  its key there.
- **`hooks/use-features.ts`.** `useMyFeatures(enabled?)` (key
  `["user", "features"]`) has `staleTime: 0` and `refetchOnWindowFocus: true`
  — an admin's change reaches the screens on the next mount, page load or
  focus, with no deploy (AC2). A failed call is NO features (a web deployed
  before the migration gets a 500), keeping the last good answer if there is
  one; no toast. `useHasFeature(key)` returns `{has, stage, isLoading}`, and
  while loading `has` is `false`, so nothing gated flashes in.
- **Nav.** A `NavItem` with `feature` renders only with that key:
  `navItemsFor(isAdmin, features, access)` drops it, and marks it `beta` while the
  stage is `beta`. Reports also needs `access.hasReportsBadge` (ADR-0024). `(protected)/layout.tsx` passes `useMyFeatures(isAuthenticated)`.
  So the primary nav is 6 entries with neither `jobs` nor `cvs`, 7 with one
  and 8 with both (plus Admin for an admin). `SidebarNav` renders `BetaBadge` on a `beta` entry, `aria-hidden`
  and pointed at by `aria-describedby` — the link's accessible name stays
  exactly the label ("Jobs"), its description is "Beta", its TEXT is
  "Jobs Beta" (why `shell-responsive.spec.ts` pins Jobs with a regex).
- **`components/features/feature-gate.tsx`** (`<FeatureGate feature>`): the
  children with the feature, a `role="status"` spinner
  (`data-slot="feature-gate-loading"`) while loading, else
  `<NotFoundMessage variant="shell" />` — the SAME words as `app/not-found.tsx`
  (`components/layout/not-found-message.tsx`, h1 "404"), so a gated route
  never says the feature exists. Put the gate ABOVE the component that calls
  the feature's hooks: `jobs-page.tsx` and `job-view-page.tsx` export a
  `FeatureGate` wrapper over an inner component, so no job request goes out
  without `jobs`.
- **`components/features/beta-badge.tsx`** (`BetaBadge`, words in `features.beta`): the
  word "Beta", never colour alone; `size="sm"` in the nav, default beside an
  h1. Always a SIBLING of the h1, never inside it, so heading names stay
  exact (`jobs.spec.ts`). `JobDetailView` takes it through `titleBadge`.
- **Controls inside ungated screens.** "Tailor by keywords" and `CvFitPanel`
  on `application-cv-page.tsx` and `new-with-cv-page.tsx` (draft step 2)
  render only with `jobs`, and `useApplicationCvFit` is enabled only with it.
  NOT gated on `jobs`, by design: an existing keyword copy's "Reordered by job
  match" list, the Drafts tab, Finish, `/admin/jobs` and the admin-nav "Jobs"
  tab (admin-only screens are never gated). Losing a feature hides controls;
  it never deletes or alters what the user made with it.
- **`cvs` (PRD 0015)** gates the CV builder, the CV copies and the drafts.
  Without it: no CVs entry, the CV routes are "page not found" (see
  **Routing**), no CV link on an application row (`showCvLink`), no Drafts tab
  and no "New with CV" (`applications-page.tsx` takes the archived-cycle shape,
  `NewApplicationActions` `showNewWithCv`), and `useDrafts(enabled)` and
  `useBaseCvs()` (enabled only with `cvs`) send nothing. On the job board, fit,
  "Start application" (and its "Tailor by keywords"), the master CV invitation
  and the draft link need both `jobs` and `cvs`: without `cvs` the page strips
  `best_fit`, hides the Sort select and "Minimum fit" (`showFit`) and drops
  `min_fit` / `sort=fit` from the filters (a stale URL or saved search),
  shows `JOBS_COPY.subtitleNoCvs`, and the detail renders no fit column. The
  server sends no fit without `cvs` anyway.
- Tests seed `["user", "features"]` with `client.setQueryData` before render
  (plus a `services.features.getMine` mock) so the gate opens on the first
  frame; the cases written before PRD 0013 run with `jobs`, and those needing
  CVs, drafts or fit also seed `cvs`.

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

**The palette is the original teal one (ADR-0022, amending ADR-0006).** The
colour tokens in `globals.css`'s first `@layer base` (`:root` light, `.dark`
dark; dark is the default theme) are the palette of commit `9661a38`, written
in oklch: each original HSL value converted per CSS Color 4. Tokens with no
twin there follow fixed rules: `--surface` = card, `--surface-elevated` =
popover, `--primary-muted` = primary `/ 0.12`, `--info` = primary,
`--chart-1..5` = primary, success, warning, destructive, muted-foreground, and
`--border-strong` is its own pinned value. The dark shadows, `--shadow-glow`
and the `gradient-mesh` stops are the original ones too.
`src/app/globals-palette.test.ts` pins all of it — every token, light and
dark, within 1.5/255 per sRGB channel, plus the browser `themeColor` in
`layout.tsx` — and its `canonicalOklch()` is the only source of the oklch
numbers: never convert by hand. A value changes only with an ADR. The CV
preview's print colours (`neutral-*`/`blue-700`) and the categorical colours
(seniority badges, admin charts, agenda urgency) are not tokens and stay.

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
  sheets in the app use; `"wide"` (AC6, R-039) is the same panel up
  to `sm:max-w-4xl` — today only the application create/edit sheet
  (`application-form-sheet.tsx`) asks for it; `"nav"` is
  `w-[17rem] gap-0 p-0 sm:max-w-[17rem]`, the mobile navigation panel. The
  preset is applied AFTER `className`, so a caller cannot widen or pad a sheet
  from the outside — add a preset here instead.
- **A sheet's title can be shown larger than the default** by passing a class
  straight to `SheetTitle` (it forwards `className`, unlike the width preset
  above) — `application-form-sheet.tsx` passes `font-display text-xl` (AC7,
  R-040) on top of the base `font-semibold`. The words themselves ("New
  Application" / "Edit Application") are unchanged — `e2e/cv-builder.spec.ts`'s
  "Edit Application" assertion still matches them.

**`components/ui/radio-group.tsx`** is the shadcn `new-york`
RadioGroup with ONE applika-only change: the unchecked ring is
`border-muted-foreground`, because the stock `border-input` is 1.3:1 against
the card and fails the 3:1 non-text contrast. Keep it when regenerating. Its
`RadioGroupItem` takes its name from `aria-labelledby` in the job start
dialog; drive it with a click or `.check()` in Playwright (arrow keys move
focus but do not check a Radix radio there).

**`components/ui/checkbox.tsx`** is the shadcn `new-york` Checkbox with the
same ONE applika-only change as `radio-group.tsx`: the unchecked border is
`border-muted-foreground` (3:1 on the dialog/card background, WCAG 1.4.11)
instead of the stock `border-input`. Keep it when regenerating. `ui/label`
dims through `peer-disabled`, so put the label as a LATER SIBLING of the box
(a `grid-cols-[auto_1fr]` `FormItem`: box, label, description in
`col-start-2`), never wrapped apart from it. Outside a `<form>` Radix renders
no hidden input, so the value must live in react-hook-form through a
`FormField`; `onCheckedChange` yields a `CheckedState`, coerce with
`checked === true`.

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

| z      | layer                               | members                                                                                         |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `z-30` | in-column sticky chrome             | the shell `Header`, `CvEditorFooter`                                                            |
| `z-40` | fixed/sticky page chrome, no portal | `LandingHeader`, `CookieConsent`; below md the phone tab bar, the FAB and `.ph-bar` (phone.css) |
| `z-50` | the Radix portal layer              | Sheet overlay/content, Dialog, DropdownMenu, Popover, Tooltip, Sonner, `PhoneSheet` (scrim too) |

Below md the phone chrome sits in the `z-40` layer with `CookieConsent`, which
is rendered after it and so covers the tab bar until "Got it" (the owner's
choice: the notice floats on purpose). Phone sheets are Radix Dialogs in the
portal layer, above every bar. `PhoneShell`'s root is `relative` with no
`z-*`, `isolate` or `transform`, exactly as `AppShell`'s.

`CookieConsent` MUST stay at `z-40`. It is rendered after `children` in
`root-providers.tsx`, so at `z-50` it ties with the sheet and wins on document
order — which floated it over the open mobile navigation menu.
`e2e/shell-responsive.spec.ts` hit-tests this with real geometry.

**`CookieConsent` floats over the page, on purpose.** It is a bottom-right
card (`fixed right-4 bottom-4`) and reserves no space: the owner's decision
over the earlier full-width bar. Until the user clicks "Got it" it covers
whatever sits in that corner — an in-page `sticky bottom-0` footer included —
because the user is meant to see it and consent. Do not "fix" that by
reserving space or moving it out of the way. Nothing writes
`--cookie-notice-height`, so it is always `0px` and the `h-viewport` /
`min-h-viewport` / `max-h-scrollport` / `max-h-editor-scrollport` utilities
reduce to their `100dvh` arithmetic; keep using them instead of `h-dvh`,
`h-screen` or `min-h-screen` on a full-viewport shell.

**In E2E every context starts with the notice acknowledged**
(`e2e/support/cookie-notice.ts` `COOKIE_NOTICE_ACKNOWLEDGED`, the config's
`storageState`), like a user who already consented. A context made with
`browser.newContext()` passes it too. A test about the notice calls
`showCookieNotice(page)` before its first navigation
(`shell-responsive.spec.ts`).

**`h-viewport` is the shell; `max-h-scrollport` is the `<main>` inside it.**
They differ by `--app-header-height`, because the shell `Header` is `main`'s
SIBLING and sits above it. Anything sized to fill the SCROLLING region takes
`max-h-scrollport` — **unless it shares that scrollport with a `sticky
bottom-0` footer, in which case it takes `max-h-editor-scrollport`; see the
paragraph below, and note that the CV editors' sticky preview pane is that
case.** Reaching for
`100dvh` there measures the wrong box, overshoots by exactly the header, and
ends in a hand-tuned constant subtracting the difference back off; that is the
bug PRD 0007 fixed in the CV preview. `--app-header-height` is declared once in
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
carrying the layout notice — ends UNDER the submit row. That was the PRD 0007
defect and it was total at `md` and up: on `/cvs/editor?id=` the export button's
own copy of the notice survived in the footer, but `/cvs/new` has no export
button, so the caption was the ONLY copy on screen and none of it was visible.
`e2e/cv-builder.spec.ts` hit-tests the caption's own centre on BOTH routes with
`elementFromPoint` — jsdom reports every height as zero, so the geometry is not
provable anywhere else.

### App shell

Every signed-in page renders inside `AppShell`
(`src/components/layout/app-shell.tsx`). At md and up it is the rail shell
below, which owns the mobile-menu and feedback state and hoists a SINGLE
`FeedbackDialog`. Below md it returns `PhoneShell` instead (ADR-0027; see
**Phone shell** below). Either way it renders `CliPromoBanner` and the content
container itself, so no page component renders one — including the pages that
do NOT want it. At md and up the banner is on every page; below md on Today
only (`CLI_BANNER_PATH`, `/dashboard`). The md-and-up `Header` holds the
`leading` slot at the left (the cycle selector, `AppShell`'s) and, at the
right, the page's `actions`, the agenda button, the theme toggle, the
language toggle, then the `md:hidden` `UserMenu`.

- **The width opt-out lives in `src/components/layout/content-width.ts`**, not
  as a prop, and comes in TWO forms. The container carries
  `data-slot="app-content"` and `data-width="full"|"reading"` — assert on
  that, never on the classes.
  - **By PATH**, for a route that is full width in every state:
    `isFullWidthPath(activePath)` checks `FULL_WIDTH_PATHS`, today
    `/cvs/new` and `/cvs/editor` — the owner: "also, use the full page width
    for this page". Matched on the same `activePath` the nav is
    matched on, tolerates the trailing slash the static export serves, and is
    deliberately kept OUT of `nav.ts`: these are not nav entries, and
    `PRIMARY_NAV` is pinned at eight (with `jobs` and `cvs`) by
    `e2e/shell-responsive.spec.ts`.
  - **By CONTENT**, for a route that is full width only while one surface is
    on screen: `/applications/cv` left `FULL_WIDTH_PATHS` (PRD 0007) — the
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

- Nav entries live in `src/components/layout/nav.ts`.
  `navItemsFor(isAdmin, features, { hasReportsBadge })` drops an entry whose
  `feature` key the caller lacks, drops Reports without a recorded membership
  badge (see **Beta features**) and appends the `/admin` entry, which is deliberately kept OUT of `PRIMARY_NAV` so
  a non-admin render can never leak it. `isNavItemActive` matches `exact` items
  on the pathname only, and everything else on `href` or `href + "/"` — the
  trailing slash is what stops `/reports` lighting up a `/report` entry.
- The ACTIVE entry is marked with `aria-current="page"` and nothing else.
  Assert on that, never on a class.
- **`md` (48rem) is the only breakpoint.** At or above it: a fixed `w-60` rail
  and a one-row `h-14` header, with the account menu in the rail footer
  (`variant="card"`). Below it the phone shell renders instead (next section);
  the rail shell's narrow layout — the nav in a `Sheet side="left" size="nav"`
  named "Navigation" and the wrapping header — is still in `AppShell` and its
  CSS, but no signed-in page reaches it any more, because `AppShell` branches
  on the width first.
- `AppShell` has a `matchMedia("(min-width: 48rem)")` effect that force-closes
  that sheet on a resize past `md`. Keep it with the sheet.
- Accessible names the md-and-up tests depend on: `Applika.dev home`, the
  `Primary` navigation landmark, and `Open account menu` — which the `card`
  variant extends to `Open account menu for <username>`, because the username
  is its VISIBLE label and WCAG 2.5.3 requires the accessible name to contain
  it. Playwright's `getByRole(..., { name })` is a substring match, so both
  variants match `"Open account menu"`; Testing Library's is exact, so a
  vitest locator needs the full string or a regex.
- The group divider (`System`) is NOT `aria-hidden`: with the old amber
  treatment gone it is the only thing marking the Admin entry as privileged.
  Grouped entries point at it with `aria-describedby`, which describes without
  renaming — `admin-gating.spec.ts` asserts the name is exactly `Admin`.

### Phone shell (below md, ADR-0027, PRD 0021)

The owner: "all futures components and pages needs also to be designed for
mobile as well". **A new page or component ships its phone layout below md,
from its own design** (PRD 0021 Q4: "new screens gets its own artifact"), the
same way the V2 boards drive today's phone screens; desktop stays as it is.

- **The switch.** `hooks/use-is-phone.ts` `useIsPhone()` is
  `useSyncExternalStore` over `matchMedia(PHONE_QUERY)`
  (`"(max-width: 47.99rem)"`, so 768px is desktop), server snapshot `false`.
  The width alone decides: never the user agent, never the account. Protected
  pages render after auth, so nothing flashes. `AppShell` calls it after its
  own hooks and returns `<PhoneShell/>` below md: the desktop branch is
  untouched. Crossing md remounts the page (a half-filled quick add is lost;
  a draft keeps every edit, since `useDebouncedAutosave` sends the change
  still waiting out its delay as the page unmounts; the master CV editor has
  no autosave, so its unsaved edits are lost). `hooks/use-mobile.ts` (shadcn)
  is unused and is not the switch.
- **`components/layout/phone-shell.tsx`** `PhoneShell`: a `relative
min-h-viewport overflow-clip` column (no rail, no navigation sheet, no
  `Header`). **The DOCUMENT scrolls, never `<main>`**: Edge and Safari on
  iOS collapse their toolbars only on a document scroll, so a scrolling box
  kept them on screen on every signed-in page. Never put a height or
  `overflow-hidden`/`auto` back on the root or `<main>` (`clip` opens no
  scroll container). The back bar is `sticky top-0 z-30`, ABOVE exactly ONE
  `<main>`, holding
  `data-slot="app-content"` with, on Today only, `CliPromoBanner` first
  (in the board's `px-5 pt-5` margins), then the page; the
  tab bar after `<main>`; the FAB; ONE hoisted `FeedbackDialog`.
  `usePhoneShell()` gives a screen inside it `{navItems, openFeedback,
openQuickAdd}` (the Account hub's rows, its Send feedback, the Pipeline's
  "Create your first application"); `useOptionalPhoneShell()` is the same or
  `null` outside the shell (a screen rendered alone in a test).
  `<PhoneChromeless />` (renders `null`) hides the tab bar, the FAB and their
  bottom reservation while it is mounted: the Application screen renders it
  (v2/Application draws neither and owns its sticky header and fixed bar).
  It is COUNTED in a layout effect, the `FullWidthContent` shape, and a
  no-op outside the shell.
- **`components/layout/phone-nav.ts`** is the map, one place: `TAB_ROOTS`
  (`/dashboard` Today, `/applications` Pipeline, `/agenda` Agenda,
  `/insights` Insights), `FAB_PATHS` (`/dashboard`, `/applications`),
  `phoneBackFor(pathname)` (the back bar: tab roots and `/welcome` none;
  `/account` "Back" → `/dashboard`; `/jobs` `/cvs` `/cycles` `/reports`
  `/profile` `/device` `/admin` and `/admin/*` "Account" → `/account`;
  `BOARD_PARENTS`, the back bars the boards draw: `/jobs/view` "Jobs",
  `/cvs/editor` and `/cvs/new` "CVs", `/applications/new-with-cv`
  "Applications", `/applications/cv` "Application" (the screen's
  `PhoneBackHref` makes it `/applications?focus=<id>`),
  `/admin/features/view` "Features"; `/reports/<day>` "Reports";
  `PHONE_PARENTS` for the two addresses with no board, the redirects
  `/admin/supports` and `/admin/discord-webhooks` "Admin"; any other address
  (the tests use `/somewhere/new`) "Back" → `/dashboard`),
  `PHONE_SCREEN_PATHS` (screens rendered from their board, which own the
  board's padding: `/dashboard`, `/applications`, `/agenda`, `/account`,
  `/insights`, `/welcome`, `/device`, `/profile`, `/cycles`, `/reports`,
  `/admin`, `/jobs`, `/jobs/view`, `/cvs`, `/cvs/editor`, `/cvs/new`,
  `/applications/new-with-cv`, `/applications/cv` — add a route when its
  board lands) plus
  `PHONE_SCREEN_PREFIXES` (`/reports/` every report day, `/admin/` every
  admin section; `isPhoneScreen` checks both) and `accountRows(navItems)`.
  Words are getters over `word()`, so the shell also calls `useTranslations`.
- **The back bar's right-hand item** (a board's Edit, "System" pill, status
  pill): `<PhoneTopBarEnd>` (`phone-shell.tsx`) portals its children into
  the shell's bar (`[data-slot="phone-top-bar-end"]`, after the back link,
  before `<main>`), so the back link stays the shell's and the bar keeps
  exactly one link. It renders nothing on a screen with no back bar (a tab
  root) and in place outside the shell (a screen tested alone). A status
  item gets `role="status"` itself.
- **The back bar's address** (PRD 0022): `<PhoneBackHref href />`
  (`phone-shell.tsx`, renders `null`) sends the back bar to `href` instead of
  the map's address while it is mounted, keeping the map's label: a hold set
  in a layout effect, as `PhoneChromeless`; the last one mounted wins and
  unmounting it gives the map's address back. A no-op outside the shell and
  on a screen with no back bar. `/applications/cv` mounts it whenever `?id=`
  is there: back "Application" → `/applications?focus=<id>`.
- **Confirmations** on a phone screen are `PhoneConfirmSheet`
  (`components/phone/phone-confirm-sheet.tsx`): an `alertdialog` sheet,
  Cancel first and focused, then the action (`tone` `danger` or
  `primary`); both `aria-disabled` while `pending`; `fallbackFocus` takes
  focus when the opener left (a revoked card, a deleted row). The caller
  owns `open`: close it in `onConfirm`, or keep it open while `pending`
  (a cycle's delete, as today's dialog does). Desktop keeps its dialogs.
- **Padding.** A route not yet ported keeps today's content inside the phone
  layout with `px-4 pt-6` and a bottom reservation for the fixed chrome:
  `calc(170px + env(safe-area-inset-bottom, 0px))` with tab bar and FAB,
  `110px + …` with the tab bar alone, `40px` otherwise. A ported screen
  (`PHONE_SCREEN_PATHS`) gets no padding from the shell and reserves its own
  (`170px + …` on Today and the Pipeline, `110px + …` on the Agenda and
  Insights, `120px + …` above a `.ph-bar` or the Application bar). Each tab
  root's board header carries the avatar (the interim avatar row is gone).
  The root's `data-reserve` (`tab-and-fab` / `tab`, absent otherwise) and
  `data-back-bar` become the DOCUMENT's `scroll-padding-bottom` (170px /
  110px + the inset) and `scroll-padding-top` (56px) in `phone.css`
  (`html:has(.ph-shell[…])`), so a focused control is scrolled clear of the
  fixed chrome and the sticky bar (WCAG 2.4.11). A screen that saves and
  restores its scroll reads `document.scrollingElement` (the Pipeline);
  `scrollIntoContainer` falls back to the document and honours its
  `scroll-padding-top`. **Edge and Chrome on iOS** hide their bottom
  toolbar on that scroll but leave `position: fixed; bottom` where its top
  edge was: `PhoneShell` mounts `useFixedChromeShift`
  (`lib/fixed-chrome-shift.ts`), which measures the gap between a hidden
  `bottom: 0` probe and `visualViewport`'s bottom and writes it to
  `--ph-chrome-shift` on `<html>` (never negative, 0 while zoomed, removed
  when 0). `.ph-tabbar`, `.ph-fab`, `.ph-bar`, `div.ph-ap-bar` and
  `.ph-sheet` take `translate: 0 var(--ph-chrome-shift, 0px)` and
  `.ph-scrim` extends its `bottom` by it; Safari and every desktop measure 0. A new fixed bottom element on a phone screen takes the same
  `translate`. `e2e/support/phone.ts` `expectDocumentScrolls`
  proves it on the real stack. The FAB comes
  before the tab bar in the DOM, as on the boards.
- **Tab bar** (`PhoneTabBar`): `nav` named "Primary", four links, the current
  one `aria-current="page"` (assert on that only), labels truncate. Below md
  it is the only "Primary" landmark; at md and up the rail's nav has the same
  name, so a test crossing md looks for `[data-slot="phone-tab-bar"]`.
- **FAB** ("Add", `aria-haspopup="dialog"`) on `/dashboard` and
  `/applications` only, and not on an archived cycle's Pipeline (read-only,
  as the desktop hides "New application"; Today keeps it). It opens the
  quick-add sheet (`screens/quick-add-sheet.tsx` `QuickAddSheet`, v2/QuickAdd
  on `PhoneSheetFrame`), mounted in the shell on the first press, so the
  closed sheet fetches nothing before and crossing md unmounts a half-filled
  one (it is not autosaved). Company is `CompanySelect`, Role, "Where did you
  apply?" is up to three platform chips (the ones the user's current-cycle
  applications use most, then by name; the first is picked) plus "Other"
  (`PlatformSelect`), "Applied on" is Today / Yesterday / Pick a date
  (`DatePickerInput`, `maxDate` today; days are LOCAL calendar days, never
  `toISOString`), and "More details" folds the link, the work mode and the
  salary (from/to sent as `salary_range_min/max` in the PROFILE's
  `salary_currency`/`salary_period`; without both a salary is refused with
  "Set your salary currency and period in your profile first, or leave the
  salary empty"). "Add to pipeline" creates with `mode: "active"` through
  `useApplicationMutate` (its `onSuccess` now receives the saved row), puts
  the app back on the current cycle (`setSelectedCycleId(null)`) and opens
  `/applications?focus=<id>`. "Start with a CV instead" (`/applications/new-with-cv`)
  only with `cvs`.
- **Avatar** (`PhoneAvatar`): the initials (`lib/phone-format.ts`
  `initials()`: first + last name's first letters, else the username's first
  two, uppercased — the desktop avatar's rule) in a link named "Account" to
  `/account`. `displayName()` is "first last", else the username.
- **The Account hub** (`/account`, `components/phone/screens/account-screen.tsx`
  `AccountScreen` over the designer's `AccountScreenView`): name, initials,
  one pill per held badge, View profile; Workspace (Jobs, CVs, Reports,
  Cycles) and Account (Profile, Devices & CLI, Sign in a device, Admin) rows
  from `accountRows(navItems)` — the rail's own entries, so feature keys, the
  Reports badge and `is_admin` decide exactly as on desktop and a feature
  taken away drops its row on the next load; metas from today's hooks
  (`useReports` only while the badge is held, `useSessions`, `useCycles` +
  the viewed cycle), nothing while loading or failed; Theme (`radiogroup`
  "Theme", Light / Dark, next-themes), then Language (`radiogroup`
  "Language", `useLocaleSwitch`); Send feedback (the shell's dialog); "Sign in again"
  while a badge waits for a sign-in (`logout("/login")`); Logout; the cookie
  policy. This is where the theme and language controls live on a signed-in
  phone page: below md there is no header.
- **The pattern sheet** is `src/styles/phone.css` (imported by `globals.css`):
  the V2 boards' shared classes ported whole with the `ph-` prefix, then the
  app's adaptations. Every selector needs a `ph-` class, so nothing matches
  at md and up (`styles/phone-css.test.ts`). Put `.ph-app` on the phone chrome
  and on a ported screen's root, never around today's content. The only token
  it added to `globals.css` is `--destructive-text`; `--ph-glow` is local.
  The v3 boards (PRD 0022) add no token: their shared modifiers
  (`.ph-h1-26`, `.ph-dl-*`, `.ph-box`, `.ph-opt[aria-checked]`, `.ph-pick`,
  `.ph-req`, `.ph-tag.ph-miss`, `aria-disabled` on `.ph-btn` and
  `.ph-iconbtn`, the pager and the state cards) follow the V2 classes, then
  one board-only prefix per board: `ph-au-` (Users), `ph-cat-` (Companies,
  Platforms), `ph-af-` (Features), `ph-fv-` (a feature), `ph-wh-` (Report
  webhooks), `ph-clp-` (`/cli`), `ph-cn-` (`/cvs/new`) and `ph-acv-`
  (`/applications/cv`). `phone-css.test.ts` pins every one.
- **44px.** Every control on a phone screen has a box of at least 44×44
  (`getBoundingClientRect`), its visible shape the board's size: `.ph-hit`, or
  the `::before` shape of `.ph-btn.ph-sm`, `.ph-chip`, `.ph-seg > *`,
  `.ph-switch`. `CliPromoBanner` and `CookieConsent` get `max-md:` 44px boxes.
  An added CV list item's move and remove buttons (`CvRepeatableSection`,
  `[data-slot="cv-item-actions"]`) are 44px wide and, through
  `margin-block: -6px`, 44px tall with the item's header row kept at 32px,
  inside `.ph-ce-panel` only (`/cvs/editor`, `/cvs/new`, `/applications/cv`
  and the draft's CV step); at md and up they stay 32px.
- **Primitives** in `components/phone/` (thin wrappers over `ph-*`, words by
  props): top bar, tab bar, FAB, avatar, heading, sheet (Radix Dialog, closes
  itself when `PHONE_QUERY` stops matching), segmented, option, switch, pill, chip,
  group/row, field, action bar, stat grid; icons in `phone-icons.ts`. The v3
  boards added `PhonePager` (`phone-pager.tsx`: Previous, "Page N of M",
  Next; nothing with one page; the ends `aria-disabled`, so focus stays),
  `PhoneCheckOption` (`phone-check-option.tsx`: a `role="checkbox"` option
  named by its label, described by its line), `PhoneEmptyCard` and
  `PhoneAlertCard` (`phone-state-card.tsx`: a board's empty and failed-load
  cards) and `PhoneLoadable`'s optional `error` render (the board's own
  failed-load card, its retry the section's).
- **The core screens (v2/Today, v2/Pipeline, v2/QuickAdd,
  v2/Application, v2/Schedule, v2/Insights).** Each `*-page.tsx` is a
  wrapper: `useIsPhone() ? <XScreen/> : <XDesktopPage/>`, the desktop body
  renamed and unchanged, so hook order never changes. Each screen file holds
  the designer's `XScreenView` (props in, board out) and the wired `XScreen`
  on today's hooks; pure logic is in `src/lib`: `pipeline.ts`
  (`pipelineStage` from `last_step` — closed once `finalized_at`, none →
  Applied, "Initial Screen" → Screening, "Offer" → Offer, "Denied" → Closed,
  any other → Technical; `lastUpdate`, `STALE_DAYS = 14`, `isStale` more
  than 14 days, `ago`, `groupByStage`, `attentionList` — the stale ones,
  minus an open application whose latest event is a denial (nothing is
  awaited from it; the Pipeline still lists it under Closed, stale) —,
  `reachedStage`),
  `insights.ts` (funnel, 8 ISO weeks, `stepDays` floored at 0 with `null`
  for the dash, mode), `phone-format.ts` (greeting by hour and first name,
  `timeToStart`, `nextInterview`/`upcomingAgenda`/`agendaDay` through
  `agenda-view.ts`'s zone primitives, local `dayKey`/`parseDayKey`,
  `stageTitleKey`/`stagePillKey`), `application-history.ts` (the history's
  scheduled / passed / done). Every data section is a `PhoneLoad`
  (`components/phone/phone-load.tsx` `PhoneLoadable`; `phone-query-load.ts`
  `fromQuery` maps a query: `getApiError`, Retry refetches). Today reads
  `useApplications(null)` and `useGeneralStats(null)` — the CURRENT cycle,
  whatever is viewed — and `useAgenda()`, which is not cycle-scoped (every
  application's interviews, as on the desktop). Pipeline, the Application screen and
  Insights read the viewed cycle (`CycleProvider`); Insights' cycle pill is
  where a phone picks it (the header's cycle selector is desktop only), and
  an archived cycle is read-only everywhere (no Add, no bar, no Edit,
  Delete or Reopen); a tap on an application link on Today or the Agenda,
  while an archive is viewed, views the current cycle again first when the
  application is in it (`phone/current-cycle-links.tsx`
  `OpensOnCurrentCycle`), else the archive stays. Log update / Close it / Close
  open today's `TimelineEventForm` (`phone/phone-timeline-dialog.tsx`, add
  or close), mounted open with no Radix trigger, so it hands focus back
  itself through the form's optional `onCloseAutoFocus` (threaded to
  `TimelineEventDialog`; the desktop passes none): to the button that opened
  it (found by its `data-action`, as Safari does not focus a tapped button),
  else — or when that button leaves soon after, a closed card leaving
  Today's list, Close turning into Reopen — to the screen's fallback. On
  close it also refreshes `["applications"]`: the timeline hooks refresh no
  list, and the phone's stage, Stale, "Denied" and Today's attention all
  read `last_step` from it;
  Edit opens today's `ApplicationFormSheet` (its optional
  `onCloseAutoFocus` returns focus to More). The Agenda's week is the
  viewer's: `agendaDay` puts a timed item on the local day of its start;
  `useAgenda({from_date, to_date})` asks for the shown week and 60 days
  after it ("Later" is the next five after the chosen day); the bell
  (`useAgendaNotifications`) only on a timed upcoming card. Drafts on the
  Pipeline: one "Drafts" pill after the stages, with `cvs`, on the current
  cycle, with at least one draft. `useMinuteClock()` (`hooks/`) refreshes
  "in 2h 15m" and "Done".
- **The account area (v2/Profile, v2/Devices, v2/Cycles, v2/Reports,
  v2/ReportDay, v2/Admin).** Same wrapper shape: `profile-page.tsx`,
  `cycles-page.tsx`, `reports/page.tsx`, `reports/[day]/report-day-route.tsx`
  (the server `page.tsx` renders it) and `admin/admin-page.tsx` pick the
  screen in `components/phone/screens/` below md; `admin/jobs/jobs-page.tsx`
  and `admin/report-webhooks/report-webhooks-page.tsx` keep their state and
  handlers and only swap the render (`AdminJobSourcesScreenView`,
  `AdminReportWebhooksScreenView`; below md the add/edit form is
  `PhoneReportWebhookSheet` on `ReportWebhookFormDialog`'s props, PRD 0022).
  Pure logic moved to `src/lib`
  with the desktop unchanged: `profile-badges.ts` (`profileBadgeStates`),
  `profile-salary.ts` (`formatProfileSalary`), `reports.ts`
  (`REPORT_PHASE`, `effectiveReportStatus`), `cycles.ts`
  (`MIN_APPLICATIONS_FOR_CYCLE`); `hooks/use-report-form.ts`
  (`useReportForm`, both report forms) and `useGithubRestoreReturn`
  (`hooks/use-github-restore.ts`, the `?account=github&status=` notice at
  both widths). `useReports` also returns `data`, `isError` and `refetch`.
  - **Profile / Devices** are one screen: `?tab=devices` is read on every
    render (`useSearchParams`), the "Profile sections" nav is two links
    (`/profile`, `/profile?tab=devices`, the current one
    `aria-current="page"`) whose plain tap `pushState`s (Back returns), the
    other section's nav takes focus. Crossing md lands on the URL's tab
    (the desktop's own tab switch writes no URL, as today). Edit (top bar)
    swaps in today's `UserProfileEditForm`; "Delete your account" opens
    today's typed confirmation in place. Devices: Sign out (this device),
    Revoke and Sign out all other devices each confirm in a
    `PhoneConfirmSheet`; Sign out still leaves with
    `window.location.assign("/login")`; Ended shows open.
  - **Cycles**: the current cycle reads `useGeneralStats(null)` ("since" =
    the newest archived `created_at`; the API names no current cycle and
    counts no archived one), New Cycle from 10 applications (the desktop
    selector's rule) opens a sheet, View views the cycle and opens the
    Pipeline (`/applications`, the board's link; the desktop goes to
    `/dashboard`), the trash confirms in a sheet that stays open while the
    delete runs.
  - **Reports** sit inside `BadgeGate` at both widths; below md the gate
    gets `closed={renderReportsClosed}` (`BadgeGateView`'s optional
    `closed` draws the closed states instead of today's explanations; absent,
    it renders exactly as before): the lock tile, today's words, "Visit
    Borderless" + "Sign in again" for `none`, "Sign in again" alone for
    `needs_reconnect` (AUTH-1050). The current card is the one report the
    API marks pending or overdue (effective status), "due" = start + day − 1
    (local day); an archived cycle shows "Not available". ReportDay: the
    status pill in the top bar (the list's effective status), the start
    date picked only on day 1, number fields `inputMode="numeric"`, a
    counter on each textarea, the bar (Cancel / Submit Report) only while
    the report can be submitted; a day that is not a report day goes back
    to `/reports`.
  - **Admin**: `admin/layout.tsx` (a client layout now) renders
    `AdminPhoneHeader` below md inside `AdminGuard`: "System" in the top
    bar, a title and its lead, the seven sections as `PhoneChipLink`
    chips (`ADMIN_TABS` from `admin-nav.tsx`; `aria-current="page"`, exact
    on `/admin`, by prefix elsewhere; the current chip scrolled into view).
    The title is "Admin Console" on the Dashboard and Jobs; each v3 section
    in `SECTION_HEADS` (Users, Companies, Platforms, Features, Report
    webhooks; PRD 0022) puts today's page title (26px, `.ph-h1-26`) and
    subtitle there instead; a feature's page (`PILL_ONLY_PATHS`,
    `/admin/features/view`) gets the pill alone and heads itself. The title
    is the `h1` on every board (`ADMIN_BOARD_PATHS`: `/admin`,
    `/admin/users`, `/admin/companies`, `/admin/platforms`, `/admin/jobs`,
    `/admin/features`, `/admin/features/view`, `/admin/report-webhooks`) and
    a `p` with the same look over the two redirect shells (Supports, Discord
    webhooks), which keep today's content in `AdminPhoneContent` (20px
    sides). The Jobs board draws no title, so it carries a visually hidden
    `h2`. `/admin/users` is v3/AdminUsers (`AdminUsersScreenView`: search,
    five sort chips, the count, a row per user with the administrator
    switch, `PhonePager` at 15, a user's details sheet); the other v3
    sections are under **Admin — private company/platform rows**, **Admin —
    Report webhooks** and **Admin — Features**.
  - Hooks: `data-slot` `phone-profile` (`data-editing`), `profile-sections`,
    `profile-badges` (`li[data-badge][data-earned]`), `github-restore-card`,
    `delete-account`, `phone-devices`, `device-row`
    (`[data-session-id][data-status][data-current]`, cards and ended rows),
    `device-action`, `device-last-ip`, `sign-out-others`,
    `no-other-devices`, `phone-cycles`, `cycles-current`, `cycle-row`
    (`[data-cycle-id]`), `phone-reports`, `reports-current`
    (`[data-day][data-status]`), `reports-closed` (`[data-reason]`),
    `phone-report-day` (`[data-day][data-mode]`), `admin-phone-header`,
    `admin-phone-title`, `admin-phone-chips`, `admin-phone-content`,
    `phone-admin-dashboard`, `admin-stats`, `phone-admin-jobs`,
    `job-source-row` (now an `li` below md, same `data-source-code` and
    `data-enabled`), `job-run-now`, `job-run-notice-region`,
    `phone-admin-webhooks`, `report-webhook-row`, `report-webhook-url`
    (the masked address only); `data-action` `edit-profile`,
    `github-restore`, `open-delete-account`, `delete-account`,
    `confirm-sign-out`, `confirm-revoke`, `confirm-sign-out-others`,
    `new-cycle`, `start-cycle`, `view-cycle`, `delete-cycle`,
    `confirm-delete-cycle`, `fill-report`, `visit-borderless`,
    `badge-gate-sign-in-again`, `submit-report`, `cancel-report`,
    `add-webhook`, `edit-webhook`, `delete-webhook`,
    `confirm-delete-webhook`. The v3 admin boards add `data-slot`
    `phone-admin-users`, `user-sort`, `user-count`, `admin-users`,
    `admin-user-row`, `users-empty`, `user-detail-facts`,
    `user-detail-stats`, `phone-admin-catalog`, `visibility-filter`,
    `catalog-count`, `catalog-list`, `catalog-row`, `catalog-url`,
    `catalog-meta`, `catalog-empty`, `catalog-delete-reason`,
    `approve-catalog-row`, `approve-catalog-sheet`, `approve-catalog-error`,
    `delete-catalog-sheet`, `catalog-delete-error`, `catalog-form`,
    `catalog-form-error`, `phone-admin-features`, `features`, `feature-row`,
    `feature-link`, `feature-you`, `features-empty`, `features-error`,
    `phone-admin-feature`, `feature-own-access`, `feature-beta-list`,
    `feature-beta-user`, `feature-add-user-sheet`, `feature-not-found`,
    `report-webhooks`, `report-webhooks-empty`, `report-webhooks-error`,
    `delete-webhook-sheet`, `report-webhook-form`,
    `report-webhook-url-current`, `report-webhook-badge-options`;
    `data-action` `view-user`, `toggle-admin`, `add-catalog`,
    `edit-catalog`, `save-catalog`, `toggle-active`, `approve-catalog`,
    `confirm-approve-catalog`, `delete-catalog`, `confirm-delete-catalog`,
    `use-feature`, `add-user-done`, `save-webhook`.
- **Jobs, CVs and the draft (v2/Jobs, v2/JobDetail, v2/StartApplication,
  v2/Draft, v2/CVs, v2/CVEditor).** Each phone branch sits INSIDE the page's
  existing `FeatureGate` (`jobs` for `/jobs` and `/jobs/view`, `cvs` for
  `/cvs`, `/cvs/editor` and `/applications/new-with-cv`), so no gated request
  leaves without access; the draft's inner `jobs` checks stay.
  - **Jobs** (`screens/jobs-screen.tsx` `JobsScreen`): the URL's filters
    through `components/jobs/use-job-board.ts` (`useUrlJobFilters`,
    `writeJobsUrl` with `pushState`, `withoutFit`, `useSavedSearchesMenu` —
    the desktop board reads the same module); page 1 is `useJobs(filters, 1)`
    and every "Show more" page `useQueries` on the same `["jobs", filters,
page]` key, so the optimistic dismiss reaches all of them; the phone
    writes no `?page=` and a filter change starts again at page 1; a failed
    later page keeps the list, toasts and retries on the next tap. Search
    debounced 300 ms (Enter or blur flushes); Best fit / Newest are
    `aria-pressed` chips in a `toolbar` "Sort and filters"; the source is a
    sheet of buttons (a tap applies and closes); "More filters" is a sheet
    with tags, minimum fit, published within, Show dismissed and today's
    `SavedSearchesMenu` (desktop sizes). A card is an `article` named by its
    title; it shows its Draft/Applied mark OR Dismiss (the board), never
    Start application (that is on the job page). Without `cvs`: no fit, no
    Best fit, no invitation, "Draft" plain text.
  - **A job** (`screens/job-detail-screen.tsx` `JobDetailScreen`): "Your fit"
    is a `section` (`[data-slot="job-fit-list"]`) of Radix `Tabs` (tablist
    "Master CV", chips "Name · 82%" / "Name · No fit yet", best first); every
    panel is force-mounted with a visually hidden h3 = the CV's name, and the
    inactive ones are `display: none` (`.ph-jd-card[data-state="inactive"]`).
    The ring is `role="img"` "Fit 82%". Start application is
    `screens/start-application-sheet.tsx` `StartApplicationSheet` on
    `useStartApplicationFlow` (`components/jobs/start-application-flow.tsx`;
    the desktop dialog is `<StartApplicationDialog
{...useStartApplicationFlow(props)} />`), a `dialog` "Start an
    application" with the same radios, preselection, 409 and inline errors.
  - **CVs** (`screens/cvs-screen.tsx` `CvsScreen`): one card per master CV,
    Edit (link "Edit <name>") and Delete ("Delete <name>") confirmed in a
    `PhoneConfirmSheet` that stays open while the delete runs, closes on
    success and keeps the sheet on a failure (today's toast); the new-CV
    tile shows the slots left and gives way to today's `limitReason` line at
    three. No Markdown or PDF on the cards (the board draws none).
  - **The CV editor and the draft keep their state in the page** and swap
    the render after every hook ran (`cv-editor-page.tsx` returns
    `CvEditorScreenView`, `new-with-cv-page.tsx` returns `DraftScreen`): the
    forms, the save, the export and both autosave loops are the desktop's.
    The editor's sections are `components/phone/phone-cv-sections.tsx`
    `PhoneCvSections`: today's `CvFormSections` drawn through the
    `CvSectionFrame` context (`base-cvs/cv-section-card.tsx`; absent, a card
    renders exactly as before) as `[data-slot="cv-acc"][data-section]` rows,
    a heading around `button.ph-acc` named by the title and described by its
    meta, Identity open first, one open at a time, every failing section
    opened by a submit. No preview (`cv-document`) and no `CvEditorFooter`
    on the phone; PDF is the top bar's "Download PDF" (visible "PDF").
    `PhoneCvSections` also takes `subline` (`"meta"`, the default, or
    `"description"` on `/cvs/new`), `firstOpen` (`null`: every row closed,
    `/applications/cv`), `diff` and `reordered` (the CV copy's markers).
  - **The draft** (`screens/draft-screen.tsx`): step 1 is the board's
    Company, Role, Platform, Experience + Work mode, Job description, then
    "More details" (`[data-action="more-details"]`, hidden not unmounted, it
    opens itself when a field inside starts failing) with Source, the
    application date (`DatePickerInput` labelled "Application date"), link,
    country, salary and notes. Step 2 before a copy: the "Tailor by
    keywords" switch card (with `jobs` and a saved job description) and the
    master CV options; with a copy: the board's section rows
    (`li.ph-sec-row[data-section]`, "Reordered" from `adjustments`), today's
    `CvFitPanel` (`[data-slot="cv-fit-panel"]`, `jobs` only) and "Edit the
    CV copy", which edits the copy IN PLACE (`[data-slot="draft-cv-editor"]`,
    `PhoneCvSections` with h3 rows on the page's CV form, autosaved) — not
    `/applications/cv?id=`: that page reads the application from the
    cycle's list and the API lists no draft, so a draft id lands on "not in
    the cycle". `useBaseCvs` is called in `DraftScreen` only, so the
    desktop's step 1 sends nothing new. "Delete copy", "Show changes" and
    the diff downloads stay desktop-only.
  - Hooks: `data-slot` `phone-jobs`, `jobs-toolbar`, `job-list`,
    `job-list-item` (`article[data-job-id][data-dismissed]`), `fit-badge`
    (`[data-band][data-score]`), `job-status-badge[data-status]`,
    `job-dismissed-mark`, `job-list-empty`, `job-list-no-matches`,
    `job-source-options`, `job-filters-sheet`, `job-saved-searches`,
    `phone-job-detail[data-job-id]`, `job-fit-list`, `job-fit-tabs`,
    `fit-ring`, `fit-keyword-group[data-kind]`, `job-description`,
    `job-not-listed`, `start-application-form`, `start-application-error`,
    `start-application-conflict`, `phone-cvs`, `cv-list`,
    `cv-card[data-cv-id][data-deleting]`, `cv-new-tile`, `cvs-limit`,
    `cvs-empty`, `phone-cv-editor`, `cv-acc[data-section][data-open]`,
    `phone-draft[data-step]`, `draft-stepper`, `draft-application-step`,
    `draft-more-details`, `draft-cv-step`, `draft-cv-copy`,
    `draft-cv-editor`, `tailor-by-keywords`, `draft-no-master-cv`,
    `draft-not-found`, `draft-missing`, `draft-finish-error`,
    `autosave-status[data-state]`; `data-action` `sort-fit`, `sort-newest`,
    `choose-source`, `more-filters`, `dismiss-job`, `restore-job`,
    `show-more`, `clear-filters`, `company-website`, `view-on-source`,
    `start-application`, `create-draft`, `open-existing`, `edit-cv`,
    `delete-cv`, `confirm-delete-cv`, `new-cv`, `download-pdf`,
    `toggle-cv-section`, `cancel-cv`, `save-cv`, `more-details`,
    `continue-to-cv`, `cancel-draft`, `back`, `finish`, `create-cv-copy`,
    `edit-cv-copy`, `done-editing-cv`, `retry-autosave`.
  - Locator traps: "Jobs" is the back link on a job and the h1 of `/jobs`;
    "CVs" the back link of the editor and the h1 of `/cvs`; "Done" closes
    More filters and the draft's inline CV editor; "Close" is the start
    sheet's X and the 409 panel's own button; "Draft" is a card's mark and
    inside "Create draft" / "Open draft"; "Dismiss" is inside "Dismissed";
    "Edit the CV copy" is the draft's button and the inline editor's h2;
    "Delete" is the sheet's confirm and inside "Delete <name>"; "Links",
    "Skills" … are both an editor row's button and its heading; "PDF" is
    the visible text of "Download PDF". At md and up the same addresses
    render today's pages.
- **The v3 screens (PRD 0022)**: `/admin/users`, `/admin/companies`,
  `/admin/platforms`, `/admin/features`, `/admin/features/view`,
  `/admin/report-webhooks`, `/cli`, `/cvs/new` and `/applications/cv`, each
  from its own v3 board. The signed-in eight keep the account area's wrapper
  shape: the page keeps its hooks, calls `useIsPhone()` after them and
  returns the board's `…ScreenView` with its own queries, forms and
  mutations (`report-webhooks-page.tsx` swaps `ReportWebhookFormDialog` for
  `PhoneReportWebhookSheet`); `/cli` switches by CSS (below). `/cvs/new` and
  `/applications/cv` stay inside their `FeatureGate feature="cvs"` with
  today's Beta mark. A sheet closes when the width crosses md, and a
  half-filled form in it is lost. Details: **Admin — private
  company/platform rows**, **Admin — Report webhooks**, **Admin —
  Features**, **Master CVs** and **Tailored CVs** ("On a phone").
- **Signed-in screens from their boards** switch with `useIsPhone()` and
  keep today's data wiring: `WelcomeScreen` returns `PhoneWelcomeScreen`
  below md (v2/Welcome: `radiogroup` "How to start" of two `PhoneOption
size="lg"`, restore preselected, ONE CTA that follows the choice —
  `[data-action="restore"]` or `[data-action="start-fresh"]` — on the same
  restore / dismiss calls); `device-page.tsx` hands the same props to
  `components/phone/screens/device-screen.tsx` (`PhoneDeviceCode`,
  `PhoneDeviceRequest` with the `role="note"` warning and Deny / Approve in
  a `PhoneActionBar`, `PhoneDeviceOutcome`) instead of `DeviceSignInLayout`
  and `components/device/*`. The data hooks (`device-code-form`,
  `device-request*`, `device-outcome`) are the same at both widths; the
  step and `?code=` survive a crossing of md.
- **Public screens switch by CSS**, one tree per width with a `data-slot`
  per tree, so the static HTML hydrates as is: `/` (`PhoneLanding`
  `[data-slot="landing-phone"]`, v2/Landing; today's sections in
  `[data-slot="landing-desktop"]`), `/cookie-policy` (`PhoneCookiePolicy`
  `[data-slot="cookie-policy-phone"]`, today's words in the board's cards
  `li[data-slot="cookie-row"][data-cookie]`; today's page in
  `[data-slot="cookie-policy-desktop"]`), `/cli` (`PhoneCli`
  `[data-slot="cli-phone"]`, v3/Cli, PRD 0022: the four command blocks
  `[data-slot="cli-phone-term"]`, each Copy ("Copy command",
  `data-action="copy-commands"`, described by its section's heading)
  copying the block's commands and saying "Copied" with its own status
  line, the "$ " prompts hidden from screen readers and never copied, View
  on PyPI, its own footer; today's page in `[data-slot="cli-desktop"]`),
  `/cli/code` (`[data-slot="cli-code-phone"]` /
  `[data-slot="cli-code-desktop"]`) and `/login` (above). `/` and `/cli`
  share `PhoneLandingHeader`
  (`components/phone/landing/phone-landing-header.tsx`, on one row from 320
  to 430): at the left the home link, the Applika icon alone
  (`.ph-landing-home`, a 44px box reaching 7px into the gutter so the 30px
  icon sits on it, named `header.home`); at the right
  (`.ph-landing-actions`) the theme toggle, the flags-only language toggle,
  then `[data-slot="landing-phone-sign-in"]`, a `Link` styled
  `ph-btn ph-pri ph-sm`: `landing.signIn` to `/login`, or `landing.dashboard`
  to `/dashboard` once `useAuth()` is settled and authenticated (the desktop
  `LandingHeader`'s words). Below 360px (`@media (max-width: 22.49rem)`)
  the header's gutter is 16px and the button sits 4px from the flags, so
  "Dashboard" (106px) still fits at 320. The shared `.ph-landing-footer`
  ends both pages, `calc(48px + env(safe-area-inset-bottom, 0px))` below
  it.
  `PhonePublicBar` (`components/phone/phone-public-bar.tsx`,
  `header[data-slot="phone-public-bar"]`, sticky: back "Home" → `/` and the
  pair) is `/cookie-policy`'s alone. The md-and-up trees
  use `hidden md:contents` (and `(public)/layout.tsx` wraps `LandingHeader`
  and `LandingFooter` the same way), never `md:block`: a block wrapper
  would make the sticky landing header stick to the wrapper.
- **Tests.** `src/test/setup.ts` answers `matchMedia` `false`, so every test
  renders desktop. `src/test/phone.ts` `mockPhoneViewport()` makes the phone
  query match for one test and `setPhone(false)` turns the screen past md.
  A CSS-switched screen renders BOTH trees in jsdom: scope queries by the
  tree's `data-slot`. `src/test/phone-screens.tsx` `renderPhoneScreen(path,
page)` renders a route in the phone shell with the query client, the cycle
  context and the messages in the VIEWER's zone (the setup's provider is
  UTC; run the Agenda's tests under `TZ=UTC` and `TZ=Asia/Tokyo`);
  `renderPhonePage(page)` renders a page alone (no shell) on a phone
  viewport and returns `viewport`, for the `setPhone(false)` checks that the
  page swaps to today's desktop body (the desktop shell needs a
  `LocaleProvider`, the page alone does not); `renderShellAcrossMd(path,
  page)` renders it inside the real `AppShell` with a `LocaleProvider` and
  returns `viewport`, so `setPhone(false)` remounts the page as the app
  does (the draft and CV editor crossing tests). A test's
  `vi.mock("@/contexts/auth-context")` factory must not `await
  import("@/test/phone-screens")`: that module imports the mocked one, and
  the run hangs; import `SAM` at the top instead;
  `src/test/navigation.ts` is a `next/navigation` stand-in whose
  `useSearchParams` follows `pushState`/`replaceState`/`popstate`;
  `src/test/timeline-dialog-stub.tsx` stands in for `TimelineEventForm`
  (Cancel, Save — which refreshes the applications in close mode only, as
  the real form does — and Radix's `onCloseAutoFocus` on unmount).
  `e2e/shell-responsive.spec.ts` walks the phone shell at
  390×844; `e2e/phone.spec.ts` the public screens (`/`, `/cookie-policy`,
  `/cli`, `/cli/code`), the core screens and the Account hub as e2e-user,
  every account-area, job and CV board read-only, the new master CV and an
  application's CV copy, the admin console's v2 and v3 boards as e2e-admin
  (a private company approved on the phone included) and Logout in a
  disposable account (see **Phone in E2E**);
  `borderless-signin.spec.ts` option C's states, option A at md and up and
  the welcome choice; `headers.spec.ts` the public and app headers;
  `devices.spec.ts` `/device`. `e2e/support/phone.ts` has `PHONE`
  (390×844), `expectPhoneTargets` (every rendered control's box at least
  44×44, and a floor on how many were measured) and
  `expectNoSidewaysScroll` (the document and the shell's `<main>`).
- **Locator traps.** "Profile" is inside "View profile"; "Account" names the
  avatar, a back link and the hub's region; "Add", "Back" and "Dark" are
  inside longer names — use `exact: true` in Playwright. A row's name is its
  label only; its meta is its description. On the core screens: "Close" (a
  sheet's X), "Close it" (Today) and the Application bar's "Close" — use
  `[data-action="close-application"]`; the "Today" date chip vs the "Today"
  tab; the "Agenda" link and h1 vs the tab; the Pipeline's pills are tabs
  named with their counts ("All 34"); "Offer" (pill) vs "Offers" (stat);
  the picked-date trigger is named "Applied on"; "Success rate" names a
  label and a progressbar; "Active" is a `dt` and a legend item;
  "Applications" is inside "Applications per week"; "Pipeline" is a tab and
  the Application screen's back link; the Agenda's day panel is a
  `tabpanel`, not a region. In the account area: "Profile" and "Devices"
  are both the section links and today's tab names at md and up; "Active"
  is Devices' h1, its status pill words and the Cycles pill; "Revoke
  access" is the sheet's confirm and inside a card's "Revoke access for
  <name>"; "Sign out" is a card's button and the sheet's confirm (scope to
  `getByRole("alertdialog")`); "Sign in again" is the closed Reports'
  button and the Account hub's row; "Edit" is the Profile bar's button and
  each webhook card's (named "Edit <target>");
  "Delete" is inside "Delete <cycle>" and "Delete your account". On the v3
  screens: "Approve" is a private row's visible word inside "Approve
  <name>"; "Features" is a feature page's back link, a chip and the h1 of
  `/admin/features`; "Application" is the CV copy's back link and inside
  "Application CV"; "Add user" opens the sheet and "Add <user>" adds;
  "Download PDF" is inside "Download PDF of <name>" on the copy's picker;
  every `/cli` block has its own "Copy command" (scope to
  `[data-slot="cli-phone-term"]`). Hooks: `data-slot` `phone-today`,
  `today-next-interview`, `today-stats`, `today-attention(-item)`,
  `today-upcoming(-item)`, `phone-pipeline`, `pipeline-summary`,
  `pipeline-empty`, `phone-application` (`data-application-id`,
  `data-closed`, `data-archived`), `application-actions`, `phone-agenda`,
  `agenda-event`, `phone-insights`; `data-action` `log-update`,
  `close-application`, `reopen`, `more`, `back`, `choose-cycle`,
  `previous-week`, `next-week`, `alert`; rows carry `data-application-id`,
  `data-stage`, `data-stale`.

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
| `src/components/layout/app-shell.tsx`             | Signed-in shell: rail, header, feedback dialog; below md returns `PhoneShell`         |
| `src/components/layout/phone-shell.tsx`           | Phone shell: back bar, one `<main>`, tab bar, FAB, feedback dialog, `usePhoneShell`   |
| `src/components/layout/phone-nav.ts`              | Tab roots, FAB, back bars, `PHONE_SCREEN_PATHS`, `accountRows(navItems)`              |
| `src/hooks/use-is-phone.ts`                       | `useIsPhone()` (below md), `useLeaveAtDesktop()` for the phone-only routes            |
| `src/styles/phone.css`                            | The V2 pattern sheet, every class `ph-` prefixed                                      |
| `src/components/phone/`                           | Phone primitives, `phone-icons.ts`, `screens/` (the ported boards)                    |
| `src/lib/phone-format.ts`                         | `initials()`, `displayName()`, greeting, time to start, agenda days, stage keys       |
| `src/lib/pipeline.ts`                             | Pipeline stage from `last_step`, stale (more than 14 days), ago, groups, attention    |
| `src/lib/insights.ts`                             | Insights funnel, 8 ISO weeks, average days per step (floored, dash), mode             |
| `src/components/phone/screens/`                   | The ported boards: each `XScreenView` and its wired `XScreen`                         |
| `src/components/layout/nav.ts`                    | Nav entries, `navItemsFor()` feature + admin filter, `isNavItemActive()`              |
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
| `src/components/timeline/timeline-event-form.tsx` | The one event dialog: Add event, Edit event, and the flag's Close application         |

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
  Commit after each logical unit of work using conventional commits with no
  ticket key: `feat(frontend): ...`. Branch from `develop`; the owner merges
  into `develop` (`.claude/rules/branches-and-commits.md`).
- **shadcn/ui**: add or compose primitives through the CLI and fetch the
  canonical docs before using a pattern. Do not hand-roll what the registry has.
- **Context7 MCP** (when available): look up docs for Next.js, React Query, Zod,
  react-hook-form and shadcn/ui before guessing API signatures.

---

## Backend Context

The backend is a FastAPI app in `../backend/` with its own `CLAUDE.md`. It runs on port 8000. Auth uses HTTP-only JWT cookies (`__access`). Borderless's OpenID Connect sign-in (`GET /auth/borderless/login` → Borderless → `GET /auth/borderless/callback`) is the only sign-in; GitHub is used once, to restore an old account's data (`POST /auth/github/restore`). See `../backend/CLAUDE.md` for backend-specific guidance.
