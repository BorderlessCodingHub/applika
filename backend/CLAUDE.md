# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it whenever the project changes in ways that affect how you work here.**

Update CLAUDE.md when:
- New entities, relationships, or domain concepts are added (update Domain Model Relationships)
- A new architectural pattern or layer is introduced
- A new essential command is added (tasks, scripts, docker targets)
- A new environment variable becomes required or optional
- A new domain exception is introduced and mapped to an HTTP status
- The authentication/token strategy changes
- A new dependency is added that has non-obvious usage patterns
- Project skills or MCP usage patterns change

Do NOT bloat CLAUDE.md with:
- Implementation details already visible in the code
- Ephemeral task notes or in-progress work
- Debugging steps or one-off fixes
- Anything already in git history or docstrings

---

## Seed Script Rule

**Always keep `scripts/seed_mock_data.py` up to date and working.**

The seed script exercises the full public API to create realistic mock data. It is the fastest way to verify that all endpoints work end-to-end after changes.

When you add or modify any of the following, update the seed script accordingly:
- New required or optional fields on `POST /applications`, `POST /applications/{id}/timeline`, the deprecated `POST /applications/{id}/steps`, or `POST /applications/{id}/finalize` (both the no-body close and the deprecated 0.1.4 body)
- New enums (e.g., `work_mode`, `experience_level`, `salary_period`, `currency`, `mode`, `availability`)
- New support data endpoints (platforms, steps, feedbacks) — update the `/supports` fetch and field extraction
- The timeline: `seed_timeline()` drives half the applications through `/timeline` (one initial screening each, typed interviews, notes, an offer or denied outcome), finalize without a body and, for some, reopen; `seed_legacy_steps()` drives the other half through the deprecated `/steps` and the 0.1.4 `/finalize` body and warns when an answer lacks the `Deprecation` header
- Renamed or removed fields that the seed script currently sends
- New endpoints the seed script should exercise to keep coverage complete
- Changes to authentication (cookie name, token format)
- New or changed fields on `POST /base-cvs` — `seed_base_cvs()` creates 3 master CVs and asserts the 4th is refused with 409
- New or changed behaviour on the `/pdf` export routes — `seed_cv_pdfs()` posts to both at the end of the run and checks the bytes start with `%PDF-`
- New or changed fields on `/applications/{id}/cv` — `seed_application_cv()` gives roughly half the applications a CV copy and runs the full create → read → update → delete → recreate round trip on the first one, asserting the 2nd copy is refused with 409

After any such change, mentally walk through the seed script from top to bottom and confirm it would still run without errors against a fresh database.

---

## Project Overview

This is a FastAPI backend for **Applika.dev** (Application Panel), a job application tracking system with biweekly reporting and analytics. The codebase follows Clean Architecture with strict layer separation and uses async SQLAlchemy with PostgreSQL. All entity IDs use Snowflake-generated BigIntegers.

## Essential Commands

### Development
```bash
# Install dependencies
uv sync

# Run development server (port 8000 with auto-reload)
uv run task run

# Run formatter
make format

# Run linter with auto-fix
make lint

# Run tests with coverage
make test
```

### Database Migrations
```bash
# Create new migration (auto-generate from models)
uv run task autorevision

# Apply migrations
uv run task auhead

# Rollback all migrations
uv run task adbase
```

### Seed Script
```bash
# Full reset + seed (downgrade → upgrade → seed)
uv run task seed

# Or seed manually (server must be running, requires a valid JWT access token)
python scripts/seed_mock_data.py
```

### Docker
```bash
# Start backend + PostgreSQL
docker compose up --build

# Run migrations in container (entrypoint already runs them)
docker exec applika.dev-api alembic upgrade head
```

## End-of-Task Validation

**Always finish a backend task by running formatting, linting, and tests.**

Run these at the end of any backend code change:

```bash
make format
make lint
make test
```

Do not skip this unless the user explicitly asks you not to run validation or the environment prevents it.

## Architecture

The codebase uses Clean Architecture with four main layers:

### Domain Layer (`app/domain/`)
- **models.py**: SQLAlchemy ORM models with `BaseMixin` providing Snowflake IDs + timestamps
- **repositories/**: Repository classes handling data access
  - All repositories use AsyncSession and follow async/await patterns
  - Handle transactions with explicit commit/rollback in try/except blocks

### Application Layer (`app/application/`)
- **use_cases/**: Business logic encapsulated in single-purpose classes
  - Each use case has one `execute()` method
  - Use cases are injected with repository dependencies
  - Keep transport-agnostic (no HTTP concerns)
- **dto/**: Data Transfer Objects using Pydantic for validation
  - Separate DTOs for creation, updates, and responses
- **services/**: External integrations (e.g., Discord webhook service)

### Presentation Layer (`app/presentation/`)
- **api/**: FastAPI route handlers organized by resource
- **schemas/**: API request/response schemas (Pydantic)
- **dependencies.py**: FastAPI dependency injection factories
  - Repository factories like `get_user_repository()`
  - Service factories like `get_discord_service()`
  - Authentication via `get_current_user()`
- **handlers.py**: Global exception handlers mapping domain exceptions to HTTP responses

### Library Layer (`app/lib/`)
- **types.py**: Snowflake ID type with Pydantic serialization
- **urls.py**: URL utility functions

## Key Patterns

### Repository Pattern
All repositories follow this structure:
- Constructor accepts `AsyncSession`
- Methods are async and use SQLAlchemy 2.0 select/insert syntax
- Explicit transaction management: `session.add()`, `await session.commit()`, `await session.rollback()`
- Eager loading with `selectinload()` for relationships

See `app/domain/repositories/application_repository.py` for reference implementation.

### Use Case Pattern
Use cases encapsulate business operations:
- Class-based with constructor dependency injection
- Single `async def execute()` method
- Raise domain exceptions (ResourceNotFound, ResourceConflict, etc.)
- Return DTOs, not ORM models

See `app/application/use_cases/applications/create_application.py` for reference.

### Authentication
- GitHub OAuth via `fastapi-sso` with scopes `user:email`, `read:org`
- **Access token**: short-lived JWT in HTTP-only cookie (`__access`), payload `{sub: github_id, kind: 'access', exp: ...}`
- **Refresh token**: opaque UUID stored in Redis, referenced via HTTP-only cookie (`__refresh`), TTL configurable (default 7 days)
- **CLI login handoff**: external-browser GitHub sign-in with loopback redirect and short-lived Redis-backed exchange code; the CLI receives the same `__access` and `__refresh` session values in JSON and stores them locally
- GitHub access token stored **encrypted** (Fernet) in `users.encrypted_github_token` — never logged or exposed
- `get_current_user()` dependency extracts user from access cookie
- `GET /auth/refresh` validates refresh token from Redis, verifies GitHub token via cached `GET /user`, re-issues access cookie; invalidates session if GitHub token revoked
- `GET /auth/logout` revokes refresh token from Redis and clears both cookies
- `POST /auth/cli/start` creates a pending CLI login in Redis and returns the browser login URL
- `GET /auth/cli/login/{login_id}` marks the browser session as CLI-initiated, then redirects into GitHub OAuth
- `POST /auth/cli/exchange` validates a short-lived one-time code and returns the normal session values in JSON instead of `Set-Cookie`
- Token utilities in `app/core/tokens.py`, encryption in `app/core/crypto.py`
- Cookie settings: HTTPOnly, Secure in PROD, SameSite=Lax

### GitHub Integration
- `GitHubService` (`app/application/services/github_service.py`) validates tokens and checks org membership
- Redis cache with configurable TTL (default 10 min) for `applika:github:token_valid:{user_id}`
- Discord report webhook only fires for confirmed org members

### Exception Handling
Domain exceptions in `app/core/exceptions.py`:
- `ResourceNotFound` → 404
- `ResourceConflict` → 409
- `ApplicationFinalized` → 409 (a closed application: "Reopen the application to edit it")
- `BusinessRuleViolation` → 422 (among others: an application archived in a cycle)
- `InvalidDate` → 422
- `ForbiddenAccess` → 403
- `PdfRenderFailed` → 500
- `NotImplementedError` → 501

Handlers registered in `app/presentation/handlers.py` via `register_handlers(app)`.

### CV PDF Rendering

`app/application/services/cv_rendering/` turns a stored CV document — a master
CV or an application's copy — into PDF bytes with **RenderCV 2.8 + Typst**
(`rendercv==2.8` + `typst==0.15.0`, both pinned). All wheels, no system
packages, no Dockerfile change.

Deliberately **not** `rendercv[full]`: that extra pulls `rendercv-fonts` — 59 MB
of fifteen font families — for a theme that typesets in Source Sans 3 alone,
plus the CLI-only `typer`, `watchdog` and `packaging`. The single module in
RenderCV that imports it is `renderer/pdf_png.py`, and nothing else in the
render path needs that module, so `renderer.py` never imports it and drives
`typst.Compiler` itself. Schema validation is unaffected — RenderCV hardcodes
`available_font_families` as a literal list, so `Source Sans 3` stays valid.

- `mapper.py` — a pure `document → RenderCV dict/YAML` map. An empty section is
  omitted, never printed blank. It also defuses the three ways ordinary stored
  data would otherwise 500: an email or phone RenderCV refuses is dropped from
  the header instead of aborting the render, a link URL `pydantic.HttpUrl`
  would refuse is dropped the same way, and `#word` — which RenderCV reads as a
  *Typst command* — is rewritten to `#sym.hash`.

  **`Links` is never a section.** The owner: *"Links isn't a section, it must
  appear in bellow the headline, alongside with my email, location and links."*
  Every stored link becomes a **header connection**, on the same line as the
  location, the email and the phone. One RenderCV recognises goes to
  `social_networks`; every other one goes to `custom_connections`, emitted
  **after** `social_networks` because `Cv.capture_input_order` records this
  dict's key order as `cv._key_order` and `parse_connections` walks it.
  `custom_connections` and not `cv.website`: both are unbounded, but
  `parse_connections` sets a website's body to `clean_url(url)` and throws the
  user's label away, while a custom connection's body **is** its `placeholder`,
  so `label` survives (blank label ⇒ the cleaned URL). `fontawesome_icon` is
  `'link'` — required by the model, never typeset, because the theme sets
  `header.connections.show_icons=False`. This is also what puts the PDF back on
  parity with the on-screen preview, which always rendered links inline in the
  header. A link URL `pydantic.HttpUrl` refuses (`not a url`, a scheme-less
  `github.com/ada`) is **dropped from the header** rather than raising — before
  the section was retired it printed under a `Links` heading instead.

  **Section order is insertion order, and it only survives the dump because
  `sort_base_mapping_type_on_output` is off.** The order the owner asked for is
  Summary, Experience, Languages, Skills, Projects, Education, Certifications,
  and **nothing follows Certifications**; `ruamel.yaml`'s representer sorts
  mapping keys by default, which is what once put the summary at the bottom of
  the page. `SECTION_ORDER` names it and `tests/unit/test_cv_rendering.py`
  asserts it on the generated YAML text and on the generated `.typ`, never by
  reading a parsed dict back.

  Section shapes: skills are NormalEntries (`{name: "<category>:", summary:
  "<keywords joined by ' · '>"}`, U+00B7 MIDDLE DOT — *not* the U+2022 BULLET
  the header separator uses); projects are NormalEntries whose summary is
  `"<markdown link>\n<description>"`, so the entry reads name / link /
  description on three lines, with the raw URL standing in for a missing link
  label; education is an EducationEntry, dated exactly like experience.

  **Experience and education dates go to RenderCV's `start_date`/`end_date`,
  never to its arbitrary `date`.** The stored `start` / optional `end` are ISO
  `YYYY-MM`, which `start_date`/`end_date` accept verbatim, and the theme's
  `templates.single_date` (`MONTH_IN_TWO_DIGITS/YEAR`) and
  `templates.date_range` (`START_DATE - END_DATE`) typeset them as
  `02/2023 - 02/2024`. An entry with no `end` omits `end_date` and RenderCV's
  own `check_and_adjust_dates` fills in `present` — the mapper never writes
  that word. The two are **mutually exclusive**: setting `date` makes RenderCV
  discard `start_date`/`end_date` silently, so `_apply_period()` is the single
  place either key is written and `date` is never emitted for these sections.
  A blank `start` omits both keys rather than emitting a half range.
- `renderer.py` — compiles in `anyio.to_thread.run_sync` under
  `CV_PDF_RENDER_TIMEOUT_SECONDS`, in a temp directory removed in `finally`.
  The directory is mandatory: RenderCV resolves a custom theme by looking for a
  folder named after it **next to the input YAML**, so every render gets its own
  copy of `themes/applika/`. Failure or timeout → `PdfRenderFailed`, with a
  fixed message — RenderCV's own errors quote the CV field that upset them.
- `fonts/` — the four Source Sans 3 faces the theme uses, plus their `OFL.txt`
  (the licence has to travel with the files). They are the **only** fonts on
  the compiler's path, and `ignore_system_fonts=True` keeps the host's own out,
  so a developer machine and the API image — which has no system fonts at all —
  render the same row identically. A glyph Source Sans 3 lacks does not fail
  the compile: Typst silently falls back to a built-in face and embeds that,
  which is why the integration test asserts the embedded font set holds Source
  Sans 3 **and nothing else**. Kept outside `themes/applika/` on purpose — that
  folder is copied per render.
- `themes/applika/` — the one theme, `ApplikaTheme(ClassicTheme)` plus four
  `.j2.typ` templates, vendored from the owner's own theme and renamed
  `custom` → `applika`. Every design token is an overridden field default, so
  the generated YAML only ever says `design: {theme: applika}`. The user does
  not choose a theme. **Every** token of the owner's `design` block is set
  here, including the ones that happen to equal RenderCV's own default — the
  file reproduces *his block*, not the delta against `ClassicTheme`, so a
  RenderCV release that moves a default cannot move the product's look.
  `OWNER_DESIGN_TOKENS` in `tests/unit/test_cv_rendering.py` pins all of them
  one parametrized case per dotted path, and a companion test re-reads his
  file when it is on disk and fails if the table does not cover it key for key.
  Education needs no vendored template: `templates.education_entry` in that
  block drives ClassicTheme's own `EducationEntry`.
  `themes/applika/__init__.py` is loaded by RenderCV via
  `importlib.util.spec_from_file_location`, outside the `app` package — its
  imports must stay absolute and must never reach into `app`.

**The four `.j2.typ` files are the owner's, and they are frozen.** The owner:
*"Just use the template as is in the reference directory removing the key
achievements section, I won't accept any deviation of the original template."*
The only edit the theme carries is dropping `key_achievements` from the grid
branch of `SectionBeginning.j2.typ`. `tests/unit/test_cv_rendering.py` enforces
that twice — a diff against the owner's folder when it is on disk, and a sha256
pin that also runs in CI. A layout problem is fixed in `mapper.py`, never in a
template; a change that genuinely needs one goes back to the owner.

One consequence to know before touching `mapper.py`: `SectionBeginning.j2.typ`
opens a `#grid(` only for `languages` while `SectionEnding.j2.typ` closes one
for **every** OneLineEntry section, so **`Languages` is the only section that
may map to OneLineEntry**. Certifications are TextEntry lines
(`**label** details`) for exactly that reason. Adding a second
OneLineEntry section does not fail the compile — Typst prints the orphan `[`,
`],` and `)` as text — so the guard is a delimiter-balance assertion on the
generated `.typ`, not on the PDF.

### The Tailoring Port
`TailoringService` (`app/application/services/tailoring.py`) is a `Protocol`
describing "tailor a master CV to a job posting": one `async def tailor(request)
-> TailoringResult`. It exists so a model-backed implementation can be dropped
in later without changing the stored CV shape or the API.

Today there is exactly **one** binding, `CloneTailoringService`
(`clone_tailoring.py`), and it copies the master CV verbatim — identity and
contact included — with `was_ai_generated=False` and `adjustments=[]`. There is
no AI in this codebase, no resolver and nothing to configure;
`get_tailoring_service()` in `dependencies.py` is the single line that would
change. The port is `async` even though the clone does no I/O.

### Snowflake IDs
All entity primary keys use Snowflake-generated `BigInteger` IDs instead of UUIDs or auto-increment. Defined in `app/lib/types.py` with Pydantic serialization to string for JSON/OpenAPI.

### Request ID Logging
- Every request gets a UUID via `HTTPLifecycleMiddleware`
- Request ID propagated via context variable (`request_id_ctx`)
- Added to logs via `RequestIdFilter`
- Returned in response header `X-Request-ID`

## API Endpoints

### OAuth (`/auth`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/auth/github/login` | No | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | No | OAuth callback, sets access + refresh cookies |
| POST | `/auth/cli/start` | No | Create pending CLI login and return browser login URL |
| GET | `/auth/cli/login/{login_id}` | No | Mark browser flow as CLI login and redirect to GitHub OAuth |
| POST | `/auth/cli/exchange` | No | Exchange CLI auth code for JSON `__access` and `__refresh` values |
| GET | `/auth/refresh` | No | Validate refresh token, re-issue access cookie |
| GET | `/auth/logout` | No | Revoke refresh token, clear both cookies |

### Users (`/users`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/users/me` | Yes | Get current user profile |
| PATCH | `/users/me` | Yes | Update profile |

### Applications (`/applications`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/applications` | Yes | Create application (201) |
| GET | `/applications` | Yes | List all user applications |
| PUT | `/applications/{id}` | Yes | Update application |
| DELETE | `/applications/{id}` | Yes | Delete application (204); its events go with it |
| POST | `/applications/{id}/finalize` | Yes | Close it. No body → 200, idempotent. New optional outcome body → 200, no Deprecation. 0.1.4 body → 201, deprecated |
| POST | `/applications/{id}/reopen` | Yes | Reopen a closed application (200, idempotent) |

**Closed is reversible** (PRD 0008). `finalized_at` set = closed, NULL = open;
`finalized` is `finalized_at is not null`. Closing asks for no step, feedback
or salary: the outcome is an `offer` or `denied` timeline event, and there is
no Offer ⇔ Accepted rule. Writes to a closed application's timeline are
`ApplicationFinalized` (409, "Reopen the application to edit it (it is
currently closed)"); anything on an application archived in a cycle is
`BusinessRuleViolation` (422), checked **first** (`use_cases/applications/
guards.py`: `ensure_mutable` for event writes, `ensure_not_archived` for
finalize/reopen). A closed application swept into a cycle stays closed for
good.

`/finalize` dispatches on the body (`presentation/api/application.py`): no
body, an empty body, `null` or `{}` is the new close; a body carrying
`step_id` or `feedback_id` is the 0.1.4 body; any other body is the new
optional outcome body (R-032).

The 0.1.4 body `{step_id, feedback_id, finalize_date, salary_offer?,
observation?}` is handled by `use_cases/compat/legacy_finalize.py`, which
answers exactly as the steps version did (future date 422, 404, archived
422, closed 409 "This application has already been finalized", strict step
404, feedback 404), then refuses a `salary_offer` on a step that is not an
offer (422) and records the terminal event of the mapped step: feedback
name appended to the observation as `Feedback: <name>`, an offer's salary =
`salary_offer` or 0 with the application's currency or USD and period or
monthly (owner decision (b)), `finalized_at` = `finalize_date` 00:00 UTC —
the shape revision `afd4074c70c2` gave the applications it migrated. 201,
`Deprecation` header.

**R-032, the new optional outcome body** `{outcome?: "offer"|"denied",
event_date?, observation?, salary_amount?, salary_currency?,
salary_period?}` (`presentation/schemas/application.py:
FinalizeWithOutcome`, `use_cases/applications/finalize_application.py:
FinalizeApplicationWithOutcomeUseCase`): 200, **no** `Deprecation` header.
Validated before any I/O, same as the timeline write schema: an invalid
`outcome` is 422; `outcome=offer` requires the salary triad, else 422;
the salary fields are refused when `outcome` is `denied` or absent, else
422; `event_date`/`observation` without an `outcome` are refused too (the
orchestrator's pin — never silently dropped). A body whose fields are all
absent or null is the same idempotent close as no body at all (no outcome
event). With an outcome: 404 if not owned, `BusinessRuleViolation` (422) if
archived, `ApplicationFinalized` (409, "Reopen the application to edit it")
if already closed, then `event_date` defaults to today and is refused in
the future (`validators/application_date.ensure_not_in_future`), then one
`offer`/`denied` timeline event (`interview_type` NULL) and `finalized_at`
are written through the same shared-session, single-commit pattern
`LegacyFinalizeApplicationUseCase` uses (`TimelineEventRepository.create`'s
commit persists both; a failed insert leaves `finalized_at` unwritten). The
offer's `salary_period` is `monthly` or `annually`, same restriction and
same message as the timeline write schema (`hourly` is a 422) —
`timeline_events/rules.OFFER_PERIODS`/`OFFER_PERIOD_INVALID`, enforced in
`FinalizeWithOutcome` and again in `FinalizeApplicationWithOutcomeUseCase`
via `rules.ensure_offer_period_allowed`. Fixed in KODI-011 remediation
round 1 (R-032): the outcome body used to go through
`timeline_events/rules.normalize_event` alone, which only checks the
salary fields are present, not the period's value, so the same offer event
was valid through `/timeline` and refused through `/finalize`, or the
reverse. `ensure_offer_period_allowed` is deliberately **not** folded into
`normalize_event` itself, because the 0.1.4 legacy finalize body
(`compat/legacy_finalize.py`) also goes through `normalize_event` and
fills an offer's period from `application.salary_period`, which can itself
be `hourly` — that compat behaviour is pinned and unchanged. One
consequence: the legacy body can still write an offer event with
`salary_period=hourly` (owner decision (b)'s convention, unchanged), and
that event, once read back, cannot be re-submitted unchanged through
`PUT /timeline` — the timeline write schema refuses `hourly` on an offer
regardless of how the event got there.

The `Application` response carries `finalized_at` and keeps the fields
installed `applika-cli` 0.1.4 reads, **derived from the timeline** by
`use_cases/applications/read_model.py` (three queries for any list, no N+1):
`last_step` = the latest event (timeline order, reversed) shown as its
reverse-mapped legacy step `{id, name, color, date}`; `feedback` = always
null; `salary_offer` = the latest offer event's amount.

`job_description` (optional, max 50 000 chars) carries the pasted job posting.
On `PUT /applications/{id}` it is the **one** sticky field: omitting the key
keeps the stored text, sending `null` clears it. Every other optional field is
still a full replace and clears when omitted — that is the PUT contract
published `applika-cli` versions rely on. `app/presentation/api/application.py`
carries the distinction by dropping the key from the DTO when it is absent from
`payload.model_fields_set`.

### Application Timeline (`/applications/{id}/timeline`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/{id}/timeline` | Yes | Events, ordered `event_date, start_time NULLS FIRST, created_at` |
| POST | `/{id}/timeline` | Yes | Add an event (201) |
| PUT | `/{id}/timeline/{event_id}` | Yes | Replace an event (full body) |
| DELETE | `/{id}/timeline/{event_id}` | Yes | Delete an event (204) |

A timeline event (`TimelineEventModel`, table `timeline_events`, ported from
mynextjob) is exactly one of `note`, `interview`, `feedback`, `offer`,
`denied`. `interview_type` (`unknown`, `initial_screening`, `technical`,
`cultural`, `hiring_manager`, `take_home`, `final`) is set on interviews only
and defaults to `unknown`; on any other type it is a 422. An offer needs
`salary_amount` (≥ 0, 2-decimal string on the way out), `salary_currency`
and `salary_period` (`monthly` or `annually` for an offer); every other type
refuses all three, so turning an offer into something else drops the salary
in the same PUT. `start_time`/`end_time` come together, end after start;
`timezone` ≤ 100, `observation` ≤ 5000. There is **no** date-order rule
against the application date or the previous event. An application holds
**one** `initial_screening` interview at most: a second one is a
`ResourceConflict` 409 (use-case pre-check, and the partial unique index
`uq_timeline_events_one_initial_screening` turns a race into the same 409).
The rules live in three places on purpose: the request schema (422 before
I/O), `use_cases/timeline_events/rules.py` (so the compat routes obey them)
and the database CHECKs. Reads are allowed on closed and archived
applications; another user's application or event is a 404.

### Application Steps (`/applications/{id}/steps`) — deprecated
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/{id}/steps` | Yes | Every timeline event, shown as a legacy step |
| POST | `/{id}/steps` | Yes | Add the event a non-strict step maps to (201) |
| PUT | `/{id}/steps/{step_id}` | Yes | Replace the event `{step_id}` |
| DELETE | `/{id}/steps/{step_id}` | Yes | Delete the event (204) |

Kept only for installed `applika-cli` 0.1.4 (`.claude/rules/
cli-compatibility.md`), with its request and response shapes unchanged
(`{id, step_id, step_name, step_date, start_time, end_time, timezone,
observation}`); `deprecated: true` in OpenAPI. The translator is
`use_cases/compat/step_translation.py`: forward, a step becomes
`steps_definition.event_type/interview_type` (filled by revision
`afd4074c70c2`; NULL → interview/unknown); reverse, an event becomes one step
by name (`initial_screening` → "Initial Screen", other interviews, notes and
feedback → "Phase 2", offer → "Offer", denied → "Denied"), else the first
row with the same mapping, else the first non-strict row — **identical** to
the revision's SQL, so the ids a 0.1.4 client reads stay stable across
releases. A PUT whose `step_id` is the event's own reverse step keeps the
event's type, interview type and salary (0.1.4 `steps edit` without `--step`
resends it; that reverse step may be strict). A POST/PUT with another step
still refuses strict steps (404, as always). Writes go through the timeline
use cases, so every timeline rule, guard and the one-initial-screening 409
apply.

**`Deprecation` header.** Every answer of `/steps*` and of `/finalize` with
the 0.1.4 body, errors included, carries `Deprecation: @1789430400`
(`app/presentation/deprecation.py`). RFC 9745 defines the field as a
structured-field Date, `@` + Unix seconds; the drafts' bare `true` is not
valid under it, so the RFC form was chosen. The date is 2026-09-15T00:00:00Z,
the day ADR 0012 was accepted and deprecated these routes. There is **no
`Sunset` header** and no removal date: removal is a later owner decision
recorded in an ADR. A route opts in with `Depends(mark_deprecated)` (or by
calling it, as `/finalize` does once it sees a body); the
`DeprecationHeaderMiddleware` stamps the header on the response, which is why
validation errors carry it too. `Deprecation` is in the CORS
`expose_headers`.

### Companies (`/companies`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/companies` | Yes | List/search companies |

### Statistics (`/applications/statistics`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/statistics` | Yes | General statistics |
| GET | `/statistics/steps/conversion_rate` | Yes | `[{event_type, interview_type, total_applications, conversion_rate}]` per stage |
| GET | `/statistics/steps/avarage_days` | Yes | `[{event_type, interview_type, average_days}]` per stage |
| GET | `/statistics/platforms` | Yes | Applications per platform |
| GET | `/statistics/mode` | Yes | Active vs passive split |
| GET | `/statistics/trends` | Yes | Last month daily trends |

Statistics read the timeline. A **stage** is each interview type, then
`offer`, then `denied`: always these nine rows, in that order
(`use_cases/user_stats/stages.py`). Conversion = distinct applications with at
least one event of the stage over all in-scope applications; average days =
mean of `event_date - application_date` over the stage's events. `offers` and
`denials` in `/statistics` are applications with at least one offer / denied
event, counted independently.

### Biweekly Reports (`/reports`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/reports` | Yes | List all reports |
| GET | `/reports/{day}` | Yes | Get report details |
| POST | `/reports/{day}/submit` | Yes | Submit report (201) |

New reports are computed from the timeline
(`QuinzenalReportRepository.calculate_*_metrics`): `initial_screenings_count`
= distinct applications with an interview of type `initial_screening`
**only** (an `unknown` or any other interview never counts — the owner's
"explicit only"); `interviews_completed_fortnight` = interview events of any
type; `offers_count` = distinct applications with an offer event;
`active_processes_count` = open applications (`finalized_at` NULL) past their
initial screening. A submitted report is a stored row and is **never**
recomputed.

### User Feedback (`/feedbacks`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/feedbacks` | Yes | Submit app feedback (201) |

### Base CVs (`/base-cvs`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/base-cvs` | Yes | List the user's own master CVs (newest first) |
| POST | `/base-cvs` | Yes | Create a master CV (201); 4th is 409 |
| GET | `/base-cvs/{id}` | Yes | Get one own master CV (404 if not owned) |
| PATCH | `/base-cvs/{id}` | Yes | Partial update (404 if not owned) |
| DELETE | `/base-cvs/{id}` | Yes | Delete a master CV (204, never blocked) |

A user may hold at most **3** master CVs. The cap lives in
`CreateBaseCVUseCase`, not in a trigger or a constraint: one transaction takes
a `SELECT ... FOR UPDATE` lock on the owning user row, counts, refuses with
`ResourceConflict('Base CV limit reached (max 3 per user)')` at 3, then
inserts. The lock is what keeps concurrent creates from overshooting.

### Application CVs (`/applications/{id}/cv`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/{id}/cv` | Yes | Copy a master CV onto the application (201) |
| GET | `/{id}/cv` | Yes | Get the application's CV copy |
| PUT | `/{id}/cv` | Yes | Replace the copy whole (every field editable) |
| DELETE | `/{id}/cv` | Yes | Delete the copy (204); a new one can then be made |

At most **one** CV copy per application (UNIQUE on
`tailored_cvs.application_id`); a second POST is a 409. Writes are refused
exactly as a timeline event write is refused — it calls the same
`ensure_mutable`: archived in a cycle → `BusinessRuleViolation` (422), closed
→ `ApplicationFinalized` (409, "Reopen the application to edit it"), in that
order. `GET` has **no** such guard — viewing a finished application's CV
always works.

Ownership is enforced at the use-case layer only: nothing in the schema ties
`tailored_cvs.user_id` to `applications.user_id` or `base_cvs.user_id`, so
every route authorizes against the **application's** owner, and POST
additionally authorizes the source master CV on its own. Another user's row is
a 404, for admins too.

### CV PDF export

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/base-cvs/{id}/pdf` | Yes | Download the master CV as a PDF |
| POST | `/applications/{id}/cv/pdf` | Yes | Download the application's CV copy as a PDF |

Both return `application/pdf` with
`Content-Disposition: attachment; filename="<slug>.pdf"`, where `<slug>` comes
from the row's `name` (the CV **label**, not the person): lowercased, every run
of non-`[a-z0-9]` collapsed to one `-`, trimmed, `cv` when nothing is left. The
`Content-Disposition` header is in `expose_headers` on the CORS middleware, or
the browser could not read the filename.

`POST`, not `GET`: the server does a real Typst compile. There is **no request
body and no theme parameter** — the look is fixed. A row that does not exist or
is not owned is a 404; a failed or timed-out render is a
`PdfRenderFailed` → 500. Neither route writes anything.

Unlike every write on `/applications/{id}/cv`, the export carries **no**
finalized or archived guard — the CV of a finished application is exactly the
one a user wants to download.

### Support Data (`/supports`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/supports` | Yes | Steps, feedbacks, platforms |

The step and feedback lists are **frozen** catalogs (PRD 0008): nothing
writes `steps_definition` or `feedbacks_definition` any more, and the admin
catalog routes `/admin/step-definitions*` and `/admin/feedback-definitions*`
are gone (404). They are served, unchanged in shape, only so installed
`applika-cli` 0.1.4 can resolve step and feedback names; new clients use the
`EventType`/`InterviewType` enums.

Admin statistics (`/admin/stats*`, `/admin/users*`, admin-only) read the
timeline too: offers/accepted = applications with an offer event,
denials/rejected = with a denied event, open/active = `finalized_at` NULL,
finalized = `finalized_at` set, and activity (30-day active users, the
heatmap) comes from `timeline_events.created_at`.

### Agenda (`/users/me/agenda`)
Every timeline event dated inside the window (`from_date`/`to_date`, default
30 days either side of today), ordered by date then start time — the window
and order the steps agenda had. An item keeps its step-era shape (`id`,
`step_id`, `step_date`, `step_name`, `step_color`, times, timezone,
observation, `application_id`, `company_name`, `role`; the step fields are the
reverse-mapped legacy step) and adds `event_type` and `interview_type`.

## Testing

Uses pytest with testcontainers for integration tests:
- Postgres container spun up per test session
- `async_client` fixture overrides dependencies to use test DB
- Base data seeded via `base_data()` helper
- Tests run with `asyncio_mode = "auto"`
- Ryuk reaper disabled on Windows

See `app/tests/` for test fixtures and test files.

## Enums

Defined in `app/core/enums.py`:
- **Currency**: the 20 of applika and mynextjob combined — USD, BRL, EUR, GBP, CAD, AUD, JPY, CHF, INR, CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD, MXN, ZAR, AED
- **SalaryPeriod**: hourly, monthly, annually. `annual` (what `applika-cli` 0.1.4 sends) is accepted on every input **forever** and means annually: `SalaryPeriod._missing_` maps it, so Pydantic accepts it without OpenAPI advertising it. In the database the `salaryperiod` labels are member names (HOURLY, MONTHLY, ANNUAL, ANNUALLY); `SalaryPeriodType` (`domain/models.py`) writes ANNUALLY and reads both ANNUAL and ANNUALLY as annually, so the API never returns `annual`. The legacy ANNUAL rows are remapped by the contract migration (R2), not by code
- **EventType**: note, interview, feedback, offer, denied (PG type `event_type`, lower-case labels)
- **InterviewType**: unknown, initial_screening, technical, cultural, hiring_manager, take_home, final (PG type `interview_type`); the declaration order is the statistics stage order
- **ExperienceLevel**: intern, junior, mid_level, senior, staff, lead, principal, specialist
- **WorkMode**: remote, hybrid, on_site
- **Availability**: open_to_work, casually_looking, not_looking

## Environment Variables

Required:
- `DATABASE_URL`: postgresql+asyncpg://user:pass@host:port/db
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret

Optional (with defaults):
- `ENVIRONMENT`: PROD | DEV | TEST (default: DEV)
- `JWT_SECRET`: JWT signing secret (default: changeme placeholder)
- `JWT_ALGORITHM`: HS256 (default)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: 15 (default)
- `GITHUB_REDIRECT_URI`: OAuth callback URL
- `LOGIN_REDIRECT_URI`: Post-login redirect
- `REFRESH_TOKEN_EXPIRE_DAYS`: Refresh token TTL in days (default: 7)
- `REDIS_URL`: Redis connection URL (default: redis://localhost:6379/0)
- `GITHUB_CACHE_TTL_SECONDS`: Redis cache TTL for GitHub API checks (default: 600)
- `CV_PDF_RENDER_TIMEOUT_SECONDS`: wall-clock ceiling for one CV PDF render (default: 30); past it the request is a 500
- `GITHUB_TOKEN_ENCRYPTION_KEY`: Fernet key for encrypting GitHub tokens (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `DISCORD_REPORTS_ORGANIZATION`: GitHub org name; only org members get reports posted to Discord
- `DISCORD_REPORTS_WEBHOOK`: Discord webhook for biweekly reports
- `DISCORD_FEEDBACK_WEBHOOK`: Discord webhook for user feedback
- `CORS_ORIGINS`, `CORS_HEADERS`, `CORS_METHODS`: CORS configuration
- `LOG_LEVEL`, `LOG_FORMAT`: Logging configuration
- `API_PREFIX`: Route prefix (default: /api)
- `DATABASE_ECHO`: SQLAlchemy echo (default: False)

## Domain Model Relationships

### Core Entities
- **User**: GitHub OAuth authenticated users with profile (company, role, salary, tech stack, seniority, availability)
- **Company**: Job companies, user-created, unique on lower(name)+url
- **Application**: Job applications with tracking, salary info, and country
- **TimelineEvent**: one entry of an application's timeline (`timeline_events`), typed by `EventType`, with `interview_type` on interviews and the salary triple on offers; rows migrated from `application_steps` kept the step's id
- **StepDefinition**: the frozen legacy step catalog, read only by the compat layer; `event_type`/`interview_type` are its mapping onto the timeline (`strict=True` steps were the finalize-only ones)
- **FeedbackDefinition**: the frozen legacy outcome catalog, read only by `/supports` and the 0.1.4 finalize body
- **Platform**: Job platforms (LinkedIn, Indeed, etc.)
- **QuinzenalReport**: Biweekly progress reports with fortnight + accumulated metrics
  - Report days: 1, 14, 28, 42, 56, 70, 84, 98, 112, 120
  - Phases: 1-4
  - Includes manual metrics (mock interviews, LinkedIn posts, strategic connections)
  - Discord integration for posting reports
- **UserFeedback**: In-app feedback from users (score 1-5 + optional text)
- **BaseCV**: A user's master CV, capped at 3 per user
  - Identity and contact (`name` label, `full_name`, `headline`, `location`, `email`, optional `phone`) plus a `summary`
  - Seven repeatable sections stored as JSONB arrays, never NULL: `links`, `skills`, `experience`, `projects`, `education`, `certifications`, `languages`
  - `skills` is a list of **categories**, not tags: `{id, category, keywords[]}`. The owner: *"skills isn't simply a section where i put "tags" or just "keywords" it's a section where i can create a category and inside this caregory add keywords"*. There is no `list[str]` back-compat shim — revision `f2a9c1d4b6e8` was amended in place before it ever ran anywhere
  - `experience` is `{id, company, company_description?, role, start, end?, location?, bullets[]}` and `education` is `{id, institution, degree, area?, start, end?}`
  - **`start` is required on both, `end` is optional**, and both are ISO `YYYY-MM` in storage and on the wire (regex `^\d{4}-(0[1-9]|1[0-2])$`). An absent `end` means the entry is current and the PDF prints `present`. A finish earlier than its start is a 422, enforced on the item model so create, PATCH and the tailored-CV copy all refuse it. The owner: *"instead of a bare text input it needs to ask when started and when finished (finish is optional, when empty is counted as Present), it's a date input but only for month and year "MM/yyyy""* — `MM/yyyy` is the **input and display** format and lives in the frontend; ISO is what the API stores, because ISO is what RenderCV's `start_date`/`end_date` take
  - The free-text `period` both sections used to carry is retired: revision `d3f7b1c9e2a4` renamed the columns to `experience_old` / `education_old` on `base_cvs` and `tailored_cvs` and seeded every migrated item with `start` and `end` of `2026-01`. Nothing was parsed; the original text lives on in the `_old` columns, which no application code and no ORM model touches
  - Section sub-item `id`s are **client-generated strings** preserved round-trip, never minted server-side
  - Read and written whole (a document aggregate), so there are no child tables
- **TailoredCV**: an application's CV copy — at most one per application
  - A **full snapshot** of the master CV it was made from: same identity, contact, summary and seven sections, stored on its own row
  - Editing or deleting the master never changes it; when the master is deleted `base_cv_id` becomes NULL and the copy keeps every field ("source CV deleted")
  - `was_ai_generated` / `adjustments` are the tailoring port's provenance fields, always `false` / `[]` today
  - Created through `TailoringService`, never assembled in the use case

### Key Relationships
- Application → User (many-to-one, cascade delete)
- Application → Platform (many-to-one)
- Application → Company (many-to-one, optional)
- TimelineEvent → Application (many-to-one, cascade delete, `passive_deletes=True`)
- TimelineEvent → User (many-to-one, cascade delete)
- The legacy `applications.last_step_id`, `last_step_date`, `feedback_id`, `feedback_date`, `salary_offer` columns and the `application_steps` table still exist in the database (revision `afd4074c70c2` keeps them in sync with the timeline until the contract migration) but **no model maps them** and no code reads them
- Company → User (many-to-one via created_by, cascade delete)
- QuinzenalReport → User (many-to-one, cascade delete), unique on (user_id, report_day)
- UserFeedback → User (many-to-one, cascade delete)
- BaseCV → User (many-to-one, cascade delete), at most 3 per user
- TailoredCV → Application (one-to-one, cascade delete, `passive_deletes=True`), UNIQUE on application_id
- TailoredCV → User (many-to-one, cascade delete)
- TailoredCV → BaseCV (many-to-one, nullable, **SET NULL** on delete — the copy outlives its master)

Applications are closed ("finalized") when `finalized_at` is set; reopen clears it.

## Code Conventions

### Formatting
- Ruff formatter with single quotes (`'`)
- Line length: 80 (hard), 120 (max for pycodestyle)
- Import sorting via Ruff

### Async/Await
- All database operations are async
- Use `await` for session operations
- Repository methods return ORM models or None
- Use case methods return DTOs

### Dependency Injection
Use FastAPI `Depends()` with type aliases:
```python
UserRepositoryDp = Annotated[UserRepository, Depends(get_user_repository)]
CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]
DiscordServiceDp = Annotated[DiscordService, Depends(get_discord_service)]
```

### File Organization
- Use cases grouped in subdirectories by feature (applications/, timeline_events/, compat/, user_stats/, quinzenal_reports/, companies/, user_feedbacks/, base_cvs/, tailored_cvs/)
- `use_cases/compat/` holds the layer for installed `applika-cli` 0.1.4 (step translation, legacy steps, legacy finalize); nothing there owns data
- One repository per model in `domain/repositories/`
- API routes in `presentation/api/` match resource names

## MCP Usage

Use available MCP (Model Context Protocol) servers during interactions.
**Always prefer MCP tools over bash equivalents when an MCP server is available.**

### Git MCP
- **Always use the Git MCP for every commit** — prefer `git_add`, `git_commit`, `git_diff`, `git_status`, etc. over bash git commands
- Create meaningful commits as you work — don't batch everything at the end
- Commit after completing logical units of work (e.g., after finishing a migration, after adding a new feature layer)
- Write descriptive commit messages following conventional commits style
(feat(backend): message, fix(backend): message, test(backend): message, etc)

### Context7 MCP
- Use context7 to look up library documentation when working with FastAPI, SQLAlchemy, Alembic, Pydantic, or any other dependency
- Prefer context7 over guessing API signatures or relying on outdated knowledge

### Other MCPs
- Use any other available MCP server when relevant (e.g., Docker MCP for container operations)
- Check available MCPs at the start of complex tasks and leverage them throughout

## Project Skills

This repository includes Claude Code skills in `.claude/skills/backend-patterns/` covering:
- async-repository, use-case, pydantic-dto patterns
- JWT cookie auth, OAuth2 integration
- Custom exception handling
- Testcontainers testing setup
- Context variable logging

Refer to `CLAUDE_SKILLS.md` for full examples from the codebase.
