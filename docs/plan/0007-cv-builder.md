# Plan 0007 — CV builder (master CVs and one CV copy per application)

PRD: docs/prd/0007-cv-builder.md
ADRs bound:
- 0004: every CV row carries `user_id`; foreign row = 404 (`get_by_id_and_user_id`); no permission strings; admin gets no CV access.
- 0005: additive revision, working `downgrade()`, round-trip test.
- 0007: product and schema convergence; tailoring port + verbatim clone binding only; no AI, plan, quota. Non-goal line on RenderCV amended by 0011.
- 0003: new tables use `BaseMixin` snowflake ids, ids as strings on wire.
- 0001: layer-first; use case per operation; `services/` holds integrations.
- 0010: two images; RenderCV/Typst lands in API image only; nginx image untouched.
- 0011 (Proposed, drafted here): server-side PDF via RenderCV/Typst, one fixed theme `applika` (owner template renamed). Owner accepts before S4.
PRDs neighbouring:
- 0002-applications-steps-finalize.md: finalize = `feedback_id` set (409); archived = `cycle_id` set (422 `BusinessRuleViolation`); `PUT /applications/{id}` is full replace; CV rules sit on top.
- 0006-visual-identity.md: UI built on new shell, `nav.ts`, Playwright stack from its S1.

## Scope
Master CVs (max 3/user) CRUD; one CV copy per application, full snapshot via clone tailoring port; `applications.job_description`; server PDF for both, theme `applika`. Four slices, one PR each to `develop`, one branch per slice.
**Release A (expand):** S1 migration only. No model mapping, no code reads/writes new objects.
**Release B (code), only after owner confirms `alembic upgrade head` ran for A:** S2 master CVs, S3 application CV copy + job_description, S4 PDF export. S2..S4 may split across several releases, all after A.
Not: AI bindings, `tailoring_resolver.py` (plan-tier switch), quota, profile_markdown, CLI commands, theme picker, html2pdf, admin CV screens, key_achievements. (Education was listed here in error — owner 2026-09-17: "I never said to cut out education, only key achievements".)

## Data
Revision (new) `backend/migrations/versions/<rev>_cv_builder_tables.py`, `down_revision` = head at branch time (today `a1b2c3d4e5f7`). Hand-written.
Sections = `summary` TEXT + 6 JSONB: `links`, `skills`, `experience`, `projects`, `certifications`, `languages`. No `key_achievements` (owner answer). `education` was dropped in error and is being added back — owner 2026-09-17.
- `base_cvs`: `id` BIGINT PK, `user_id` BIGINT FK users CASCADE NOT NULL idx, `name` VARCHAR(200), `full_name` VARCHAR(200), `headline` VARCHAR(300), `location` VARCHAR(200), `email` VARCHAR(255), `phone` VARCHAR(50) NULL, `summary` TEXT NOT NULL default '', 6 JSONB NOT NULL default '[]'; `created_at`, `updated_at` (BaseMixin).
- `tailored_cvs`: same identity + summary + 6 JSONB (full snapshot), plus `application_id` BIGINT FK applications CASCADE NOT NULL UNIQUE, `base_cv_id` BIGINT FK base_cvs ON DELETE SET NULL NULL, `was_ai_generated` BOOL NOT NULL default false, `adjustments` JSONB NOT NULL default '[]'. `user_id` FK CASCADE idx.
- `applications.job_description` TEXT NULL.
- Downgrade: drop `tailored_cvs`, `base_cvs`, column `job_description` (objects created by this revision; upgrade drops nothing).
- Test (new) `backend/tests/integration/test_migration_cv_builder.py`: seed user + application at prior head → upgrade → application row intact, `job_description` NULL, insert base+tailored, delete base → `base_cv_id` NULL, copy intact → downgrade → application row intact → upgrade again.

## Backend
Module `backend/app`. Pattern: `application/use_cases/applications/create_application.py`, `domain/repositories/application_repository.py`. New `presentation/api/{base_cv,tailored_cv}.py`, `application/use_cases/{base_cvs,tailored_cvs}/*`: no permission checks, no audit, no quota, no key_achievements, no education.
S2:
- `domain/models.py`: `BaseCVModel`.
- `application/dto/base_cv.py` (new): item models `LinkItem`, `ExperienceItem`, `ProjectItem`, `CertificationItem`, `LanguageItem` (no `KeyAchievementItem`, `EducationItem`), create/update/out DTOs.
- `domain/repositories/base_cv_repository.py` (new): `list_by_user_id`, `count_by_user_id`, `get_by_id_and_user_id`, `create`, `update`, `delete`; `lock_user(user_id)` = `SELECT ... FROM users WHERE id = :id FOR UPDATE`.
- `application/use_cases/base_cvs/create.py` (new): one transaction: lock user row → count → `>= MAX_BASE_CVS (3)` raise `ResourceConflict` → insert → commit. No trigger, no constraint.
- `application/use_cases/base_cvs/{list,get,update,delete}.py` (new). Delete never blocked; FK SET NULL handles copies.
- `presentation/api/base_cv.py`, `presentation/schemas/base_cv.py` (new); register in `presentation/api/__init__.py`; DI in `presentation/dependencies.py`.
S3:
- `domain/models.py`: `TailoredCVModel`; `ApplicationModel.job_description`.
- `application/services/tailoring.py` (new): `TailoringService` Protocol, `TailoringRequest(base_cv, job_description, profile_markdown=None)`, `TailoringResult(content, adjustments, was_ai_generated)`. `clone_tailoring.py` (new): `CloneTailoringService` copies all fields incl. identity. DI `get_tailoring_service` → clone.
- `application/dto/tailored_cv.py`, `domain/repositories/tailored_cv_repository.py`, `application/use_cases/tailored_cvs/{create,get,update,delete}.py`, `presentation/api/tailored_cv.py`, `presentation/schemas/tailored_cv.py` (all new).
- Guard helper on create/update/delete copy: `feedback_id` set → `ApplicationFinalized` (409); `cycle_id` set → `BusinessRuleViolation` (422). Same as steps.
- `dto/application.py`, `schemas/application.py`, `create_application.py`, `update_application.py`, `application_repository.py`: add `job_description: str | None` (max 50_000). Update applies it only when in `model_fields_set`; absent key keeps stored value (rule cli-compatibility 1).
S4:
- `uv add rendercv` (Typst extra per upstream docs), commit `uv.lock`.
- Theme package (new) `application/services/cv_rendering/themes/applika/`: vendored from `custom-template-reference/custom/`, renamed `custom` → `applika`: `__init__.py` `class ApplikaTheme(ClassicTheme)`, `theme: Literal['applika']`; `Header.j2.typ`, `SectionBeginning.j2.typ` (3-column grid for `languages` only; `key_achievements` branch removed), `SectionEnding.j2.typ`, `entries/OneLineEntry.j2.typ`. Design defaults in `ApplikaTheme` code: A4; margins top/bottom 0.55in, left/right 0.6in; no footer, no top note; font Source Sans 3; body 10pt, name 26pt bold, headline 11pt, connections 9pt, section titles 1.2em bold; line spacing 0.65em; justified, no hyphenation; colors body rgb(25,25,25), name rgb(10,10,10), headline rgb(55,55,55), connections rgb(65,65,65), section titles rgb(10,10,10), links rgb(25,95,175); header centered, separator "•", no icons, hyperlinked; section titles `centered_with_partial_line` 0.1pt; highlights bullet "•"; single date `MONTH_IN_TWO_DIGITS/YEAR`, range `START_DATE - END_DATE`. Docs and code never cite other files of `custom-template-reference/`.
- `application/services/cv_rendering/{mapper,renderer}.py` (new): pure mapper doc → RenderCV model, theme `applika` fixed. Mapping (no `key_achievements`, `education`): identity → `cv.name/location/email/phone`, headline → header; links → header connections only, never a section (corrected 2026-09-17; the earlier "or one-line entries" did not come from the owner and produced a trailing `Links` section); summary → text entry; experience → ExperienceEntry; projects → NormalEntry; certifications → OneLineEntry (label=name, details=issuer); languages → OneLineEntry (label=name, details=level); skills → one-line list. Empty section omitted. No identity merge: both CV kinds carry identity. Renderer: compile in `anyio.to_thread.run_sync`, temp dir removed in `finally`, timeout `CV_PDF_RENDER_TIMEOUT_SECONDS` (default 30, `config/settings.py`).
- `core/exceptions.py` `PdfRenderFailed` → 500 in `presentation/handlers.py`.
- Use cases `base_cvs/render_pdf.py`, `tailored_cvs/render_pdf.py` (new). Log `cv.pdf.rendered` ids, bytes, ms; never content.
- `main.py` CORS: `expose_headers=['Content-Disposition']` (separate origins, ADR 0010).
- Image impact: `backend/Dockerfile` unchanged (wheels via existing `uv sync --frozen --no-dev`); theme files ship inside `./app`; runtime grows est. 40–100 MB (typst binary + bundled fonts + rendercv deps); build adds seconds of wheel download. S4 PR records `docker image ls` before/after. Verify typst wheel for Python 3.14 / linux amd64 first.
All slices: update `scripts/seed_mock_data.py` (backend CLAUDE.md rule) and `backend/CLAUDE.md` endpoints + entities.

## Frontend
Module `frontend/src`. Stack: react-query, axios, react-hook-form + zod (present). i18n: none. Design-system doc: none; source = PRD 0006 look.
S2: routes `app/(protected)/cvs/page.tsx`, `cvs/new/page.tsx`, `cvs/editor/page.tsx` (`?id=`, Suspense for `useSearchParams`, static export) (new). Components `components/base-cvs/{base-cv-editor,base-cv-schema,cv-document,new-cv-card,types}.tsx|ts` (new), no key achievements or education editors/preview blocks. Hooks `hooks/use-base-cvs.ts`, `use-base-cv.ts`, `use-create-base-cv.ts`, `use-update-base-cv.ts`, `use-delete-base-cv.ts` (new). Services `services/{types/base-cv.ts,interfaces/i-base-cv-service.ts,implementations/base-cv-service.ts}` (new), wire `services/services.ts`. Nav "CVs" → `/cvs` in `components/layout/nav.ts` (from plan 0006). Create disabled at 3 with reason.
S3: route `app/(protected)/applications/cv/page.tsx` (`?id=`) (new). Components `components/tailored-cvs/{base-cv-picker,tailored-cv-editor,tailored-cv-schema,types}` (new); no tailoring-limit notice, no adjustments list, no AI status. Job description panel beside editor, read-only; picker preselects when exactly one master; "source CV deleted" label when `base_cv_id` null. Read-only mode + banner when `finalized || cycle_id`. Hooks `use-tailored-cv`, `use-create-tailored-cv`, `use-update-tailored-cv`, `use-delete-tailored-cv` (new). `components/applications/application-form-sheet.tsx` + `services/types/applications.ts`: `job_description` textarea. `application-item.tsx`: "CV" link → `/applications/cv?id=`.
S4: `components/base-cvs/export-cv-button.tsx` (new): axios `responseType: 'blob'` POST, object URL download, filename from `Content-Disposition` fallback slug; notice "Preview does not show the final PDF layout". No html2pdf, no `cv-pdf.ts`.

## Contract
Prefix `/api`. Auth cookie `__access`. Errors `{detail}`.
- `GET /base-cvs` → 200 `BaseCV[]`.
- `POST /base-cvs` body `BaseCVCreate` → 201 `BaseCV` | 409 `Base CV limit reached (max 3 per user)` | 422.
- `GET /base-cvs/{id}` → 200 | 404. `PATCH /base-cvs/{id}` body partial → 200 | 404 | 422. `DELETE /base-cvs/{id}` → 204 | 404 (never 409).
- `BaseCV` = `{id, name, full_name, headline, location, email, phone|null, summary, links[{id,label,url}], skills[str], experience[{id,company,company_description?,role,period,location?,bullets[]}], projects[{id,name,description,link?,link_label?}], certifications[{id,name,issuer}], languages[{id,name,level}], created_at, updated_at}`.
- `POST /applications/{id}/cv` body `{base_cv_id}` → 201 `TailoredCV` | 404 application or base CV | 409 copy exists | 409 finalized | 422 archived.
- `GET /applications/{id}/cv` → 200 | 404. `PUT /applications/{id}/cv` body = all `BaseCV` editable fields → 200 | 404 | 409 finalized | 422 archived or invalid. `DELETE /applications/{id}/cv` → 204 | 404 | 409 finalized | 422 archived.
- `TailoredCV` = `BaseCV` fields + `application_id`, `base_cv_id|null`, `was_ai_generated` (false), `adjustments` ([]).
- `POST /base-cvs/{id}/pdf`, `POST /applications/{id}/cv/pdf` → 200 `application/pdf`, `Content-Disposition: attachment; filename="<slug>.pdf"`, body starts `%PDF-` | 404 | 500 `PdfRenderFailed`. PDF allowed on finalized/archived.
- `POST/PUT /applications`, `GET /applications`: + `job_description: string|null` (≤ 50000).

## Tests
Unit: max-3 rule; clone copies every field incl. identity; guard finalized 409 / archived 422 (create/update/delete); `job_description` absent on PUT keeps value; mapper empty-section gating + field mapping for 7 sections; `ApplikaTheme` defaults (theme name `applika`, A4, font); renderer timeout → `PdfRenderFailed`.
Integration (`backend/tests/integration/`, new): `test_base_cv_api.py` (CRUD, 4th = 409, concurrent creates at 2 → max 3 rows, other user = 404, delete with copy = 204), `test_tailored_cv_api.py` (create/dup 409/finalized 409/archived 422/other user 404/base delete keeps copy, `base_cv_id` null), `test_cv_pdf_api.py` (200 `%PDF-`, 404 foreign, finalized still 200), `test_applications.py` + `job_description`, migration round-trip (S1).
Frontend vitest: base-cv-editor schema (7 sections), picker preselect, read-only mode, "source CV deleted" label, export notice present.
E2E: one spec `frontend/e2e/cv-builder.spec.ts` (new), grown per slice: create master CV → open application → pick → edit copy → download PDF (assert content-type) → finalize → editor read-only.

## Rules that bind
- `.claude/rules/non-destructive-migrations.md`: upgrade drops nothing, working downgrade.
- `.claude/rules/migration-tests.md`: round-trip test with data assertions per revision.
- `.claude/rules/prod-release-runbook.md`: Release A (S1) then Release B (S2..S4) after owner migrates; agent never touches prod.
- `.claude/rules/cli-compatibility.md`: `job_description` additive; PUT without it must not wipe it.
- `.claude/rules/quality-gates.md`: ruff, ty, pytest, eslint, prettier, tsc, vitest, Playwright real stack.
- `.claude/rules/branches-and-commits.md`: branch from `develop`, conventional commits, PR to `develop`.


## Risks
- Typst/rendercv wheel for Python 3.14 missing → S4 blocked; check before starting S4; fallback pin Python 3.13 in both stages (needs owner).
- Source Sans 3 not bundled by RenderCV/Typst wheel → silent font fallback; S4 asserts font embedded in PDF, else vendor the OFL font files beside the theme.
- Theme templates target a RenderCV version; pin that version, upgrade needs template re-check.
- CPU spike on VPS per render (1–3 s); threadpool + timeout; no concurrency cap in v1.
- Full-replace `PUT /applications` wipes `job_description` for old CLI unless `model_fields_set` used.
- Mapping `ApplicationModel.job_description` in Release A would break SELECTs on unmigrated DB: keep model change in S3.
- User-row lock serialises CV creates per user only; negligible contention.
- Preview vs PDF look differ; mitigated by notice.
- ADR 0007 non-goal lists RenderCV; 0011 must be accepted before S4.

## Open
- O5 technical: exact rendercv extra and version pin matching the vendored templates; verify in S4 against upstream docs.
