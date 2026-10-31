# Plan 0019 — English and Portuguese, a language switcher, and numbered API error codes

PRD: docs/prd/0019-language-switcher-and-error-codes.md
ADRs bound:
- 0025 (Proposed): next-intl, client provider only; `NEXT_LOCALE` cookie; numbered `code` on every error; catalog doc; amends 0024; beta exception.
- 0024: §6 `badge_required` / `membership_unconfirmed` and As-built §1 codes renumbered (amended by 0025). Messages kept.
- 0018: gated 404 stays byte-equal to the unknown route; both carry `GEN-1001`. FeatureKey rule waived (0025 "Beta exception").
- 0015: 429 body + `code`, `detail` unchanged. 0019: 503 body + `code`; OAuth `error` key kept.
- 0009: old CLI payloads kept; `detail` untouched. 0006: current URLs kept (no locale prefix), new-york, tokens.
PRDs neighbouring: 0006-visual-identity.md (header and landing look), 0013-beta-features.md (gate waived), 0018-borderless-sign-in-and-membership-badges.md (sign-in error words, the six codes).

## Scope
Ships: every API error answer carries `code`; `applika/docs/error-codes.md` lists every code; the web resolves `en`|`pt-BR` in the browser; the reference `LanguageToggle` ships ported whole; every screen is translated, admin included; errors show by code. Not shipped: CLI, Discord posts, user content, metadata/SEO, a language on the account, more languages. One feature, 5 tickets, one integration branch, one release, no migration (owner, D6: "One feature, 5 tickets, one release"). Tickets: T1 backend codes + `params` + doc + changelogs; T2 web i18n core + switcher + error lookup + cookie policy; T3 public/auth/shell/profile/devices/dashboard/agenda/reports/cycles; T4 applications/timeline/drafts/CVs/jobs; T5 admin. The switcher mounts in the ticket that lands last. No gate, so a half-translated app must never reach `main`.

## Data
none. No table, column or migration. Browser only: cookie `NEXT_LOCALE` = `en`|`pt-BR`, `Path=/`, `Max-Age=31536000`, `SameSite=Lax`, not HttpOnly (JS writes it). Written on pick only.

## Backend
- `backend/app/core/error_codes.py` (new): `ErrorCode(StrEnum)`, one member per error, value `AREA-NNNN`. Areas: GEN framework/validation/rate limit/server · AUTH sign-in, sessions, tokens, CLI sign-in, device codes, GitHub restore · USR `/users/me*` · APP applications, drafts, finalize, reopen, compat steps · EVT timeline · CAT companies, platforms, supports · CV master CVs, copies, fit, exports · JOB jobs, dismissals, saved searches · CYC cycles · RPT reports, badges · FDB feedback · ADM every `/admin/*`. Per area from 1001, +1. Gaps are never reused.
- `backend/app/core/exceptions.py`: `UnicornException.__init__(message, code: ErrorCode)` makes `code` required. `CodedRefusal.code: ErrorCode` is no longer optional. The six get renumbered (Contract). `InvalidCredentials` gets AUTH-1004, `SignInRateLimited` AUTH-1009, `SessionServiceUnavailable` default AUTH-1003.
- 189 `raise` sites in 84 files under `backend/app` pass a code; `ty` flags a missing one. The `HTTPException(` raises in `presentation/api/oauth.py`, `auth_handoff.py`, `borderless_auth.py`, `presentation/dependencies.py`, `application/use_cases/get_current_user.py` and `quinzenal_reports/submit_report.py` become domain exceptions with codes.
- `backend/app/presentation/handlers.py`: every handler adds `code`. New handlers: Starlette `HTTPException` (404 → GEN-1001, 405 → GEN-1002); `RequestValidationError` (FastAPI default body + GEN-1003, one code for every validation 422); unhandled `Exception` → 500 `{"detail": "Internal Server Error", "code": "GEN-1005"}`; 501 → GEN-1006.
- `backend/app/presentation/no_input_echo.py:46`: adds `code` GEN-1003; still never echoes `input`.
- `backend/app/config/rate_limit.py:86`: 429 adds `code` GEN-1004 and `params.seconds`.
- `require_feature` (`presentation/dependencies.py`) raises `ResourceNotFound('Not Found', GEN-1001)`. That body is identical to the unknown-route 404.
- `params`: the exception carries an optional `params: dict[str, str | int]`, and the handlers add it to the body only when it is set. Only codes whose `detail` names a value carry it. Known today: the 429 `seconds` (`config/rate_limit.py:86`), the sign-in 429 `seconds` (`exceptions.py:152`), the cycle create `min` + `current` (`cycles/create_cycle.py:19-21`), the report submit `day` (`quinzenal_reports/submit_report.py:139`), the platform 409 `name` (`platforms/create_platform.py`), and the publish 409 `name` (`admin/companies/publish_company.py`, `admin/platforms/publish_platform.py`). The build lists every one in the doc.
- The worker is untouched (no HTTP). Scraper `SourceFailed` text is data and stays English (owner, D7).
- `applika/docs/error-codes.md` (new): area table, then one row per code: code | status | `detail` (English) | params (or —) | description | raised by (route or use case).
- `backend/CHANGELOG.md` `[Unreleased]`: Added `code` on every error; Changed: six named codes renumbered. `cli/CHANGELOG.md` `[Unreleased]`: Added `code` on every API error; `detail` unchanged. Changed: on an unhandled 500 the CLI prints `Internal Server Error` where it printed `API request failed with status 500` (owner, 2026-10-31).
- `backend/CLAUDE.md` "Exception Handling" section: the code rule.
- Pattern: `handlers.py` `_coded_refusal_handler` (already emits `{detail, code}`).

## Frontend
- Dep `next-intl` (new, `pnpm add next-intl`), without routing or middleware (`output: "export"`).
- `frontend/src/i18n/config.ts` (new): `LOCALES = ["en","pt-BR"]`, `DEFAULT_LOCALE = "en"`, `LOCALE_COOKIE = "NEXT_LOCALE"`, max age 31536000.
- `src/i18n/resolve-locale.ts` (new), pure: the cookie if valid, else `navigator.languages` with any `pt*` → `pt-BR`, else `en`.
- `src/i18n/locale-provider.tsx` (new): resolves after mount; `en` imported statically, `pt-BR` by dynamic import; `NextIntlClientProvider locale messages timeZone={browserTimeZone()}`; sets `document.documentElement.lang`. `useLocaleSwitch()` follows the reference hook: `{locale, setLocale, toggleLocale, isPending}`, `useTransition`, writes the cookie. No navigation; the tree stays mounted, so form values stay.
- `src/i18n/translator.ts` (new): a module store of the active locale and messages through next-intl `createTranslator`, for code outside React. `getApiError` and the other helpers keep their signatures; their 56 call sites in 35 files stay unchanged.
- `src/i18n/messages/en.json`, `pt-BR.json` (new). Namespaces: `common header icons nav landing auth welcome device dashboard applications timeline drafts cvs jobs agenda reports cycles profile devices badges features admin cookies notFound errors`. Reference keys: `header.toggleLanguage`, `header.switchToEnglish`, `header.switchToPortuguese`, `icons.flagUs`, `icons.flagBr`. `errors.<CODE>` per code, plus `errors.unknown`.
- `src/components/layout/root-providers.tsx`: `LocaleProvider` inside `QueryClientProvider`, above Sonner, so toasts translate.
- `src/components/language-toggle.tsx` (new): `LanguageToggle({ variant })`. Uses the raw `RadioGroup` from `radix-ui`, not `ui/radio-group.tsx` (the reference has no indicator dot). Classes verbatim (Contract). `src/components/icons/flag-us.tsx`, `flag-br.tsx` (new).
- Mounts: `src/components/layout/header.tsx:80` before `<ThemeToggle />` (`default`); `src/components/landing/landing-header.tsx:26` (`default`, also serves `/cookie-policy` through `(public)/layout.tsx`; the `landing` variant is ported and pinned by test but mounted nowhere, owner D4); a top-right slot in `src/app/login/login-page.tsx` and `src/app/cli/code/cli-code-page.tsx` (`default`).
- Errors: `src/lib/api-client.ts:10-15` `getApiError` looks up the code, then falls back to `detail`, then to `errors.unknown`. Same chain in `src/lib/blob-error.ts` and in `src/lib/rate-limit.ts` (`rateLimitNotice` uses GEN-1004 with `params.seconds`, falling back to `Retry-After`). A message with params interpolates them through ICU (`{seconds}`, `{name}`, …) in both languages. `src/lib/borderless-error.ts`: `cliLoginExpired` keys on the code, not on the "CLI login expired" string. `src/services/types/auth.ts` code union → numbered. The 31 direct `.detail` reads in 15 files (`use-jobs.ts`, `device-page.tsx`, `admin/jobs/jobs-page.tsx`, `report-webhooks-page.tsx`, `feature-view-page.tsx`, `draft-copy.ts`, `draft-page-states.tsx`, `cv-removed-row.tsx`, `auth-service.ts`, `i-auth-service.ts`) go through `src/lib/api-error-message.ts` (new).
- Copy: the 11 `*-copy.ts` files (`timeline-copy`, `draft-copy`, `agenda-copy`, `application-card-copy`, `application-close-copy`, `feature-copy`, `job-sources-copy`, `device-sign-in-copy`, `job-copy`, `devices-copy`, `github-restore-copy`) and the inline strings across ~267 non-test `.tsx` become keys. The `en` values keep today's exact words.
- Formatting: 41 `toLocale*String`/`Intl.*` calls in 20 files use the active locale. `date-fns` gets `ptBR` in `ui/date-picker.tsx`; react-day-picker `locale` in `ui/calendar.tsx`. `base-cvs/cv-document-blocks.tsx` is untouched: the preview stays the English twin of the PDF (owner, D7). Server data stays as sent: `adjustments.description`, the device `client_label`, `last_run_error`.
- `timeline/timeline-options.ts` `stageLabel()` reads the translator. `src/lib/calendar.ts` SUMMARY is translated; the `legacyStageLabel()` UID is untouched. `src/contexts/agenda-notifications-context.tsx` notifications are translated.
- Server components that render text become client: `src/app/(public)/cookie-policy/cookie-policy-page.tsx` (plus a NEXT_LOCALE row) and `src/app/not-found.tsx`. `page.tsx` metadata stays English.
- Design system: no separate doc. `applika/frontend/CLAUDE.md` binds: "UI Components" (raw Radix primitive, `cn()`); "Stacking contract" (inside the `z-30` header and the `z-40` landing header, no portal); "App shell" (`md` is the only breakpoint, the header wraps below it, account menu mounted twice so scope locators); "Fonts".
- Pattern: `src/components/theme-toggle.tsx` (header control), `src/hooks/use-features.ts` (provider and hook), `src/components/tailored-cvs/cv-diff.fixtures.test.ts` (a web test reading a file outside `frontend/`).

## Contract
- Error, every non-2xx JSON: `{"detail": <unchanged>, "code": "<AREA>-<NNNN>"}`. Statuses and headers unchanged.
- Codes whose `detail` names a value add `"params": {<name>: <string|int>}`, e.g. `{"code":"CAT-2002","detail":"…","params":{"name":"LinkedIn"}}`, `{"code":"GEN-1004","detail":"Too many requests. Try again in 30 seconds.","params":{"seconds":30}}`. Every other code sends no `params` key. The doc lists each code's params.
- OAuth 400: `{"error": <RFC 6749/8628, unchanged>, "detail", "code"}`. 422 validation, every request-validation error (global and `NoInputEchoRoute`): `{"detail": [<unchanged>], "code": "GEN-1003"}`; one translated line on the web.
- Pinned codes; every other code is allocated in the build, per area, in `applika/docs/error-codes.md`:

| code | status | `detail` (unchanged) | was |
|---|---|---|---|
| GEN-1001 | 404 | `Not Found` (unknown route and gated feature, byte-equal) | — (ADR-0018) |
| GEN-1002 | 405 | `Method Not Allowed` | — |
| GEN-1003 | 422 | validation list | — |
| GEN-1004 | 429 | `Too many requests. Try again in <n> seconds.` + `Retry-After`; `params.seconds` | — (ADR-0015) |
| GEN-1005 | 500 | `Internal Server Error` (was plain text) | — |
| GEN-1006 | 501 | `This endpoint has been defined but not yet implemented` | — |
| AUTH-1001 | 401 | `Not authenticated` | — |
| AUTH-1002 | 401 | `Session expired` | — |
| AUTH-1003 | 503 | `Session service unavailable` + `Retry-After: 5` | — (ADR-0019) |
| AUTH-1004 | 401 | `Invalid email or password` | — |
| AUTH-1005 | 403 | `Verify your email on Borderless first` | `email_unverified` |
| AUTH-1006 | 409 | unchanged | `binding_conflict` |
| AUTH-1007 | 409 | unchanged | `email_ambiguous` |
| AUTH-1008 | 422 | `This Borderless email cannot be used with applika: …` | `email_unusable` |
| AUTH-1009 | 429 | `Too many sign-in attempts. Try again in <n> seconds.` + `Retry-After`; `params.seconds` | — |
| RPT-1001 | 403 | `Reports are for Borderless BASE and PSP members` | `badge_required` |
| RPT-1002 | 403 | `Sign in again to confirm your membership` | `membership_unconfirmed` |

- Switcher, options in order: `en` / `EN` / `English` / US flag; `pt-BR` / `BR` / `Português` / Brazil flag. Root `RadioGroup.Root` horizontal, `aria-label` = `t("header.toggleLanguage")`, disabled while pending. Item `aria-label` = endonym; children: flag (`aria-hidden`, `h-3 w-4 shrink-0 rounded-[1px]`) + `<span>{shortLabel}</span>`.
- Root: `inline-flex items-center rounded-full border p-0.5 shadow-xs transition-opacity`, plus `opacity-70` while pending.
- Item: `inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none transition-all duration-200 md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed`.
- `default`: root `bg-muted/40 border-border/60`; active `bg-background text-foreground shadow-sm`; inactive `text-muted-foreground hover:text-foreground`; focus `ring-primary/40 ring-offset-background`.
- `landing`: root `bg-white/10 border-white/20`; active `bg-white/15 text-white`; inactive `text-white/50 hover:text-white`; focus `ring-white/60 ring-offset-[#0a0a0f]`.

## Tests
- Unit, backend: `backend/tests/unit/test_error_codes.py` (new): values match `^[A-Z]+-\d{4}$` and are unique; the enum set equals the doc table; the six renumbered; every handler body carries `params` exactly when the exception sets it.
- Integration, backend: `backend/tests/integration/test_error_codes.py` (new): 404 unknown == gated (extend `test_feature_gating.py`); 405; 422 global and `NoInputEchoRoute` (no `input`); 429 (`test_rate_limit.py`, `params.seconds`); 503; 401; 500; OAuth keeps `error`; one sample per area; each params code sends its params, and a code without params sends no `params` key. Update `test_borderless_signin.py`, `test_borderless_confirm.py`, `test_quinzenal_reports.py`, `unit/test_borderless_sign_in.py`. `cd applika/cli && make test` stays green, unchanged.
- Unit, frontend: `src/i18n/resolve-locale.test.ts`; `src/components/language-toggle.test.tsx` (order, names, every class of both variants, pending, cookie attributes, `html[lang]`); `src/i18n/messages.test.ts` (en and pt-BR have the same keys, no empty value, ICU args match; `errors.*` == doc codes and each message's ICU args == that code's doc params, reading `applika/docs/error-codes.md`); `src/lib/api-client.test.ts` (known code → pt-BR, unknown → `detail`, none → generic). `src/test/setup.ts` supplies `en` messages, so existing word assertions hold.
- E2E: `frontend/e2e/language.spec.ts` (new). Context `locale: "pt-BR"`: landing in Portuguese, `html[lang="pt-BR"]`. EN click: cookie `NEXT_LOCALE=en`, 1 year, `/`. `loginAs` → dashboard in English. BR in the header: Portuguese with no reload, a typed field kept. One API 409: Portuguese text. Admin page in Portuguese. 320px: no sideways scroll. Update `e2e/borderless-signin.spec.ts` (403 codes).

## Rules that bind
- `.claude/rules/prod-release-runbook.md`: no migration, one release. CD deploys the API and the web separately; an old bundle shows `detail` for a renumbered code. That is harmless: the web never branched on those values (verified).
- `.claude/rules/cli-compatibility.md`: routes, statuses, `detail` and `error` unchanged; `code` additive; CLI suite green. One exception, owner-accepted 2026-10-31: the unhandled 500 is now JSON, so the CLI prints `Internal Server Error` instead of `API request failed with status 500`. Nothing breaks.
- `.claude/rules/changelogs.md`: both files, `## [Unreleased]`, no ticket key.
- `.claude/rules/quality-gates.md`: `ty` clean on every touched file (84+ backend files); coverage ≥ 90%; prettier, tsc, vitest; Playwright on the real stack.
- `.claude/rules/beta-features.md`: waived by the owner. No `FeatureKey`, no seed, no `require_feature`, no web gate (ADR-0025).
- `.claude/rules/branches-and-commits.md`: integration branch `integration/0019-language-switcher` from `develop`; conventional commits, no ticket key.
- `.claude/rules/non-destructive-migrations.md`, `migration-tests.md`: n/a. `.claude/rules/no-agent-memory-in-repo.md`.

## Risks
- Volume: ~267 `.tsx` files and 189 raise sites on one long branch means conflicts with `develop`. Split by area; rebase often.
- A server component renders build-time `en` and never switches. Any text there must move under the client provider.
- Portuguese runs longer: header at 320px, rail `w-60`, tabs, table headers.
- Word-asserting vitest and e2e tests: the `en` values must keep today's exact words.
- The 500 body changes from text to JSON. The CLI (`cli/src/applika/lib/api.py:264-270`) now prints `Internal Server Error` instead of `API request failed with status 500`. The owner accepted this on 2026-10-31; `cli/CHANGELOG.md` records it under Changed.
- English flash for Portuguese visitors (owner accepted).

## Open
- No owner markers left: D3–D7 settled 2026-10-31 (PRD `## Clarifications`).
- Technical: pin a `next-intl` version that supports Next 16.2 static export and React 19.2; the fallback is `use-intl` (same API, no Next coupling).
- Technical: is `react/jsx-no-literals` (from `eslint-config-next`) usable as a guard against untranslated JSX without excessive noise? If not, rely on review and the pt-BR e2e sweep.
- Technical: the Portuguese glossary (application, draft, master CV, CV copy, timeline, cycle, fit) is fixed in T2 before T3–T5 start; the owner reviews it.
