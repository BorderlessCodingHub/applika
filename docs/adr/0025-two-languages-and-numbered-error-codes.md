# ADR-0025: The web speaks English and Portuguese with a locale resolved in the browser, and every API error carries a numbered code (amends ADR-0024, additive notes on ADR-0015, ADR-0018 and ADR-0019, exception to ADR-0018)

**Status:** Accepted by LuisMSoares on 2026-10-31 · **Date:** 2026-10-31 · **Deciders:** LuisMSoares

## Context

PRD 0019. The owner: "Today Applika is available in just one language - english - and I want to expand to english and
portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to
this app." In the grilling he chose:
- "screens only, admin included", with errors as codes: "the translations will be located in frontend only, the api only returns the error code";
- "Browser cookie, like the site";
- "Detect the browser language";
- "No gate, everyone at once";
- "Numbered code".

The reference runs next-intl with `locales ["en","pt-BR"]`, `defaultLocale "en"`, `localePrefix "never"` and a
`NEXT_LOCALE` cookie set by its server. Applika's web is a static export (`output: "export"`): no middleware, no
server cookie read, no `Accept-Language`.

The API already answers some errors with a `code`. ADR-0024 §6 pins `{"code": "badge_required"}` and
`{"code": "membership_unconfirmed"}`, and its As-built note gives sign-in refusals the codes `email_unverified`,
`binding_conflict`, `email_ambiguous` and `email_unusable`. ADR-0018 (`404 {"detail": "Not Found"}`, the same as an
unknown route), ADR-0015 (the 429 body) and ADR-0019 (the 503 body) pin bodies with `detail` only. On 2026-10-31 the
owner chose "Renumber them, amend ADR-0024" and "Add codes, note it in ADR-0025".

This needs an ADR for four reasons. It adds a dependency. It sets an error contract every backend module follows. It
amends an Accepted ADR. It makes an exception to ADR-0018.

## Decision

- **Languages.** `en`, the default, and `pt-BR`. No locale in the URL: ADR-0006 settled "Keep current URLs".
- **Library.** `next-intl`, used only through its client provider (`NextIntlClientProvider`), without its routing or
  middleware. Messages live in two web bundles, `en` and `pt-BR`. Translations exist in the web only.
- **Locale, resolved in the browser.** A valid `NEXT_LOCALE` cookie (`en`|`pt-BR`) wins. Otherwise `navigator.languages`
  with any `pt*` entry gives `pt-BR`. Otherwise `en`. The static HTML is English; the resolved locale applies after
  load, and the owner accepted the brief English flash. `<html lang>` follows the locale.
- **Cookie.** The cookie is `NEXT_LOCALE=<locale>; Path=/; Max-Age=31536000; SameSite=Lax`. It is written by the
  browser only when the user picks, and never set by the API. Nothing is stored on the account, and no route is added.
- **Switcher.** The reference `LanguageToggle` is ported whole: both variants, the order, the labels (EN/English,
  BR/Português), the flags and every class. A switch swaps the messages in place, with no navigation.
- **Error contract.** Every non-2xx JSON answer carries `code` next to `detail`. `detail` keeps today's English text,
  because published CLIs read it (ADR-0009). Statuses and headers do not change. OAuth errors keep `error`
  (ADR-0019) and add `code`. Every request-validation 422, on every route, carries the one code GEN-1003 next to its
  unchanged `detail` list, and the web shows one translated line for it (owner, 2026-10-31: "One code for all
  validation (Recommended)").
- **Params.** A code whose English message names a value also sends `params`, an object of named values such as
  `{"code": "CAT-2002", "detail": "…", "params": {"name": "LinkedIn"}}` or `{"seconds": 30}` on a 429. No other code
  sends a `params` key. The web writes the whole sentence in either language from the code and its params (owner,
  2026-10-31: "Optional params on those codes (Recommended)").
- **Code scheme.** A code is `<AREA>-<NNNN>`. The areas are GEN, AUTH, USR, APP, EVT, CAT, CV, JOB, CYC, RPT, FDB and
  ADM. Numbers start at 1001 in each area and go up by one. One code means one error and one error has one code. A
  shipped code is never reused, renumbered or redefined.
- **Registry and catalog.** One `ErrorCode` StrEnum in `backend/app/core/error_codes.py`. Every domain exception
  requires a code. Framework errors get theirs from the handlers: unknown route 404, 405, validation 422, unhandled
  500, which becomes JSON. `applika/docs/error-codes.md` lists every code with its status, English message, params
  (if any) and description. Tests on both sides hold the backend enum, and the web's `errors.*` messages with their
  arguments, to that table.
- **The web reads codes.** A known code shows its message in the active language. An unknown code shows `detail`. No
  body at all shows a generic line.
- **Amends ADR-0024** (owner: "Renumber them, amend ADR-0024 (Recommended)"). The English messages do not change.

| Was | Now | Pinned by ADR-0024 |
|---|---|---|
| `badge_required` | RPT-1001 | §6 |
| `membership_unconfirmed` | RPT-1002 | §6 |
| `email_unverified` | AUTH-1005 | As-built §1 |
| `binding_conflict` | AUTH-1006 | As-built §1 |
| `email_ambiguous` | AUTH-1007 | As-built §1 |
| `email_unusable` | AUTH-1008 | As-built §1 |

- **Additive on pinned bodies** (owner: "Add codes, note it in ADR-0025 (Recommended)"). `detail` is unchanged in each.
  - ADR-0018: the gated 404 and the unknown-route 404 both answer `{"detail": "Not Found", "code": "GEN-1001"}`, still byte-equal.
  - ADR-0015: the 429 adds `"code": "GEN-1004"` and `"params": {"seconds": <n>}`.
  - ADR-0019: the 503 adds `"code": "AUTH-1003"`.
- **Beta exception (exception to ADR-0018).** The owner chose "No gate, everyone at once". There is no `FeatureKey`
  member, no seed row, no `require_feature` and no web gate. The switcher and both languages reach everyone at deploy.
  The error codes are not user-facing and ship ungated regardless.

## Consequences

- A new error adds, in the same change, an `ErrorCode` member, a row in `applika/docs/error-codes.md`, and an `en`
  and a `pt-BR` message. The tests fail otherwise.
- A new screen string is a message key in both languages. The `en` values keep today's words, so existing word-based
  tests hold.
- The web's checks on the six renumbered codes move in the same release. A browser still holding the previous bundle
  shows `detail`, as it does today, because the web never branched on those values.
- Text in a server component renders at build time in English and never switches, so screen text lives under the
  client provider. Page metadata stays English.
- `backend/CHANGELOG.md` and `cli/CHANGELOG.md` record the new `code`. `backend/CLAUDE.md` and `frontend/CLAUDE.md`
  describe the contract and the i18n pattern.
- **To write only after the owner accepts this ADR, not before.** The dated amendment notes:
  - ADR-0024: "Amended by ADR-0025" on §6 and on the As-built §1 codes.
  - ADR-0018: a dated note giving the PRD 0019 beta exception to its first Consequence, and the shared GEN-1001 on the 404.
  - ADR-0015: a dated note for the 429 `code` and `params`.
  - ADR-0019: a dated note for the 503 `code` and for `code` beside OAuth `error`.

- **As-built (2026-10-31, backend codes).** The build follows the Decision; where it is more specific or departs,
  the owner decided on 2026-10-31:
  - `binding_conflict` was one name for two errors, so it became two codes (one code per error). Sign-in keeps
    `AUTH-1006` (409, "This email belongs to an applika account linked to another Borderless account"); the membership
    confirmation (`POST /auth/borderless/confirm`) gets the new `AUTH-1010` (409, "This is not the Borderless account
    linked to your applika account"). Statuses and English `detail` do not change. Owner: "Accept AUTH-1010 + ADR note
    (Recommended)".
  - `params`, as built (owner: "Accept as built + ADR note (Recommended)"): `GEN-1004` and `AUTH-1009` `seconds`;
    `AUTH-1035` `grant_type`; `APP-1013` and `APP-1014` `field`, `date`; `CAT-1003` `name`; `CV-1002` and `JOB-1003`
    `max`; `CYC-1001` `min`, `current`; `ADM-1002` and `ADM-1003` `count`; `ADM-1004` `name`, `url`, `id`; `ADM-1005`
    `name`, `url`; `ADM-1006` `name`, `id`; `ADM-1007` `name`; `ADM-1017` `max`. No `day`: no error names a report
    day (the duplicate report, `RPT-1003`, carries no value). The company publish 409 splits into `ADM-1004` (the
    public row read) and `ADM-1005` (a lost race, the row unreadable); the platform publish 409 into `ADM-1006` and
    `ADM-1007` the same way. `applika/docs/error-codes.md` lists all 124 codes.

- **As-built (2026-10-31, screens part 1).** Two places keep English formatting under `pt-BR`, taken on the owner's
  delegation during the build ("do not make quedtios to me, pick the recommended ones, just create a report in the end
  of what you did"); the owner reviews them in the build's final report:
  - The shared date-picker button (`frontend/src/components/ui/date-picker.tsx`) keeps its language-free `pattern`
    (e.g. `2026-10-01` on the report form's start date); only its calendar popup follows the language ("outubro
    2026"). That is the picker's documented contract (`frontend/CLAUDE.md` "Dates") and its test pins it; the
    read-only report view shows `01/10/2026`. A `dd/MM/yyyy` button in Portuguese would change every picker in the app
    and is left to a later owner decision.
  - The three `toLocaleString("en-US", { timeZone })` calls in `frontend/src/contexts/agenda-notifications-context.tsx`
    stay `en-US`: they render no text. Two are parsed back by `new Date(...)` to compute a time-zone offset and one
    reads the zone name; a Portuguese string would give `Invalid Date` and the sound alerts would never fire. Same case
    as `components/agenda/agenda-view.ts` (plan 0019 tasks, Plan corrections 11). The notification text is translated.

- **As-built (2026-10-31, closing walk).** "A switch swaps the messages in place, with no navigation" holds, and typed
  values survive it. The closing walk could not prove that on a half-filled application sheet: the sheet is modal, so
  while it is open the header switcher is inert (no pointer events, out of the accessibility tree, unreachable by
  Tab). It was proven instead on the new-application form (`/applications/new-with-cv`: role and notes kept, heading
  switched, no reload), on the applications search box (its text kept), and by `frontend/e2e/language.spec.ts`
  (l.367). Taken on the owner's delegation ("do not make quedtios to me, pick the recommended ones, just create a
  report in the end of what you did"); the Decision is unchanged.

## Non-goals

- Translating the CLI, the Discord posts or any user content. Translated or changed API messages.
- Any language other than `en` and `pt-BR`. A locale in the URL. Server-side detection. A language stored on the
  account.

## Open questions

None. On 2026-10-31 the owner settled params (D3), validation (D5) and server-generated text, which stays English
(D7). See PRD 0019 `## Clarifications`.
