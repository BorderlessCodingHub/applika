# Error codes

Every error answer of the API is JSON: `{"detail": <English message>, "code": "<AREA>-<NNNN>"}`, plus
`"params"` on the codes that name a value. `detail`, the HTTP status and the headers are the API's own; the
web translates the code and fills the params into the sentence. OAuth errors on `POST /auth/token` also keep
their RFC `error` key. Text the API returns as data (keyword reorder descriptions, device names, a job
source's last error, CV previews and exports) is not an error and carries no code.

Rules (ADR-0025): a code is an area prefix and a four-digit number counted per area from 1001. A shipped code
is never reused, renumbered or given another meaning. One code is one error. The source of truth is
`backend/app/core/error_codes.py`; this table lists every member, in enum order. A value inside a message
is written `<name>`, and `<name>` is a key of `params`.

## Areas

| area | covers | codes |
|---|---|---|
| GEN | Framework: unknown route, method, request validation, rate limit, server errors | 8 |
| AUTH | Sign-in, sessions, tokens, CLI sign-in, device codes, GitHub restore | 45 |
| USR | The signed-in user (`/users/me*`) and user lookups | 1 |
| APP | Applications, drafts, finalize, reopen, the compatibility step routes | 14 |
| EVT | Application timeline events | 10 |
| CAT | Companies, platforms, supports | 4 |
| CV | Master CVs, CV copies, fit, exports | 10 |
| JOB | Jobs, dismissals, saved searches | 4 |
| CYC | Cycles | 2 |
| RPT | Reports and the membership badges they need | 8 |
| FDB | Feedback (no error of its own yet) | 0 |
| ADM | Every `/admin/*` route | 18 |

## Codes

| code | status | detail (English) | params | description | raised by |
|---|---|---|---|---|---|
| GEN-1001 | 404 | `Not Found` | — | No route matches the path, or the route belongs to a beta feature the caller cannot see. Both answers are byte-equal (ADR-0018). | router (unknown path); `require_feature` |
| GEN-1002 | 405 | `Method Not Allowed` | — | The path exists but not for this HTTP method. The `Allow` header is kept. | router |
| GEN-1003 | 422 | (FastAPI list of field errors) | — | The request failed validation. `detail` is the unchanged list of field errors; `NoInputEchoRoute` routes drop `input` from it. One code for every validation error. | every route; `NoInputEchoRoute` |
| GEN-1004 | 429 | `Too many requests. Try again in <seconds> seconds.` | `seconds` | The API rate limit for the caller is spent (ADR-0015). `Retry-After` and the `X-RateLimit-*` headers are kept; `params.seconds` equals `Retry-After`. | `RateLimitMiddleware` |
| GEN-1005 | 500 | `Internal Server Error` | — | An unhandled server error. Was a plain-text body; now JSON with the same words. | any route (unhandled exception) |
| GEN-1006 | 501 | `This endpoint has been defined but not yet implemented` | — | The route exists but raises `NotImplementedError`. | any route |
| GEN-1007 | 400 | `There was an error parsing the body` | — | The framework could not parse the request body (FastAPI's own 400; a multipart parse error keeps its own text). | framework |
| GEN-1008 | other | (the framework's own text) | — | Any other HTTP error the framework raises by itself. None is raised today; the status and headers are the framework's. | framework |
| AUTH-1001 | 401 | `Not authenticated` | — | No access token (Bearer header or `__access` cookie), or no `__refresh` cookie on `GET /auth/refresh`. | `get_current_user`; `RefreshSessionUseCase` |
| AUTH-1002 | 401 | `Session expired` | — | The access token names no live session: no `sid`, the session is gone, or it belongs to another user. | `GetCurrentUserUseCase` |
| AUTH-1003 | 503 | `Session service unavailable` | — | The session store (Redis) cannot be reached. `Retry-After: 5`; nobody is signed out (ADR-0019). | `SessionStore` |
| AUTH-1004 | 401 | `Invalid email or password` | — | Borderless refused the email and password. | `POST /auth/borderless/signin`, `POST /auth/borderless/confirm` |
| AUTH-1005 | 403 | `Verify your email on Borderless first` | — | The Borderless account has not verified its email. Was `email_unverified` (ADR-0024). | `POST /auth/borderless/signin`, `POST /auth/borderless/confirm` |
| AUTH-1006 | 409 | `This email belongs to an applika account linked to another Borderless account` | — | The email matches an applika account already linked to a different Borderless account. Was `binding_conflict` (ADR-0024). | `POST /auth/borderless/signin` |
| AUTH-1007 | 409 | `More than one applika account uses this email; contact support` | — | More than one applika account matches the email ignoring case, and none exactly. Was `email_ambiguous` (ADR-0024). | `POST /auth/borderless/signin` |
| AUTH-1008 | 422 | `This Borderless email cannot be used with applika: it must be a valid address of at most 100 characters` | — | The Borderless email is longer than 100 characters or not a valid address. Was `email_unusable` (ADR-0024). | `POST /auth/borderless/signin` |
| AUTH-1009 | 429 | `Too many sign-in attempts. Try again in <seconds> seconds.` | `seconds` | Too many failed sign-ins for this email. `Retry-After` is kept; `params.seconds` equals it. | `POST /auth/borderless/signin`, `POST /auth/borderless/confirm` |
| AUTH-1010 | 409 | `This is not the Borderless account linked to your applika account` | — | Confirming the membership with a Borderless account other than the linked one. Was `binding_conflict` too (ADR-0024), split off so one code is one error. | `POST /auth/borderless/confirm` |
| AUTH-1011 | 401 | `Token expired` | — | The access token is past its expiry. | `GetCurrentUserUseCase` |
| AUTH-1012 | 401 | `Invalid token` | — | The access token is not a valid JWT for this API. | `GetCurrentUserUseCase` |
| AUTH-1013 | 401 | `Invalid token payload` | — | The access token carries no subject. | `GetCurrentUserUseCase` |
| AUTH-1014 | 401 | `User not found` | — | The session is live but its user no longer exists. | `GetCurrentUserUseCase`; `GET /auth/refresh` |
| AUTH-1015 | 401 | `Invalid or expired refresh token` | — | The refresh value names no live session. | `GET /auth/refresh` |
| AUTH-1016 | 401 | `Sign in again with Borderless` | — | The session predates the Borderless sign-in or the user has no Borderless link; it cannot slide on. | `GET /auth/refresh` |
| AUTH-1017 | 503 | `Borderless is unavailable, try again later` | — | Borderless did not answer or answered unexpectedly. | `POST /auth/borderless/signin`, `POST /auth/borderless/confirm` |
| AUTH-1018 | 503 | `Borderless sign-in is not configured` | — | The API has no Borderless credentials configured. | `POST /auth/borderless/signin`, `POST /auth/borderless/confirm` |
| AUTH-1019 | 400 | `CLI login expired` | — | The browser signed in for a CLI login that has expired. The `__cli_login` cookie is cleared. | `POST /auth/borderless/signin` |
| AUTH-1020 | 404 | `CLI login not found` | — | The legacy CLI login id is unknown or expired. | `GET /auth/cli/login/{login_id}` |
| AUTH-1021 | 401 | `Invalid or expired CLI exchange code` | — | The legacy CLI exchange code is unknown, used, expired or a PKCE code. | `POST /auth/cli/exchange` |
| AUTH-1022 | 400 | `CLI callback URL must use http` | — | The CLI callback URL is not `http`. | CLI sign-in start routes (`validate_cli_callback_url`) |
| AUTH-1023 | 400 | `CLI callback URL must target loopback` | — | The CLI callback URL host is not 127.0.0.1, localhost or ::1. | CLI sign-in start routes (`validate_cli_callback_url`) |
| AUTH-1024 | 400 | `CLI callback URL must include a port` | — | The CLI callback URL has no port. | CLI sign-in start routes (`validate_cli_callback_url`) |
| AUTH-1025 | 400 | `CLI callback URL must not contain params or fragments` | — | The CLI callback URL carries params or a fragment. | CLI sign-in start routes (`validate_cli_callback_url`) |
| AUTH-1026 | 400 | `code_challenge_method must be S256` | — | The PKCE challenge method is not S256. | `GET /auth/cli/authorize` |
| AUTH-1027 | 400 | `Invalid code_challenge` | — | The PKCE challenge is malformed. | `GET /auth/cli/authorize` |
| AUTH-1028 | 400 | `Invalid or expired code` | — | OAuth `invalid_grant`: the PKCE login code is unknown, used or expired. | `POST /auth/token` (`authorization_code`) |
| AUTH-1029 | 400 | `redirect_uri does not match` | — | OAuth `invalid_grant`: the `redirect_uri` differs from the authorize request. | `POST /auth/token` (`authorization_code`) |
| AUTH-1030 | 400 | `Invalid code_verifier` | — | OAuth `invalid_grant`: the PKCE verifier does not match the challenge. | `POST /auth/token` (`authorization_code`) |
| AUTH-1031 | 400 | `Not authenticated` | — | OAuth `invalid_grant`: the refresh grant carried no refresh value. | `POST /auth/token` (`refresh_token`) |
| AUTH-1032 | 400 | `Invalid or expired refresh token` | — | OAuth `invalid_grant`: the refresh value names no live session. | `POST /auth/token` (`refresh_token`) |
| AUTH-1033 | 400 | `User not found` | — | OAuth `invalid_grant`: the session's user no longer exists. | `POST /auth/token` (`refresh_token`) |
| AUTH-1034 | 400 | `Sign in again with Borderless` | — | OAuth `invalid_grant`: the session cannot slide on; sign in again. | `POST /auth/token` (`refresh_token`) |
| AUTH-1035 | 400 | `Unsupported grant_type: <grant_type>` | `grant_type` | OAuth `unsupported_grant_type`. `params.grant_type` is the sent value, cut to 50 characters. | `POST /auth/token` |
| AUTH-1036 | 400 | `Device code expired` | — | OAuth `expired_token`: the device code is unknown or expired. | `POST /auth/token` (device code) |
| AUTH-1037 | 400 | `Polling too fast` | — | OAuth `slow_down`: the CLI polls faster than the interval. | `POST /auth/token` (device code) |
| AUTH-1038 | 400 | `Waiting for the user to approve` | — | OAuth `authorization_pending`: the user has not approved the code yet. | `POST /auth/token` (device code) |
| AUTH-1039 | 400 | `The sign-in was denied` | — | OAuth `access_denied`: the user denied the device code. | `POST /auth/token` (device code) |
| AUTH-1040 | 404 | `Code not found or expired` | — | The user code typed on the device page is unknown or expired. | `/auth/device/verify`, `/auth/device/approve`, `/auth/device/deny` |
| AUTH-1041 | 409 | `Code already used` | — | The user code was already approved or denied. | `/auth/device/approve`, `/auth/device/deny` |
| AUTH-1042 | 503 | `Could not allocate a device code` | — | No free user code could be allocated. | `POST /auth/device/code` |
| AUTH-1043 | 404 | `Session not found` | — | The session to end is not one of the caller's live sessions. | `DELETE /users/me/sessions/{session_id}` |
| AUTH-1044 | 503 | `GitHub restore is not configured` | — | The API has no GitHub OAuth app configured. | `BeginGithubRestoreUseCase` |
| AUTH-1045 | 409 | `This account already has its GitHub data` | — | The account already carries its GitHub identity; there is nothing to restore. | `BeginGithubRestoreUseCase` |
| USR-1001 | 404 | `User not found` | — | The user does not exist. | `UpdateUserUseCase`; admin user detail, update and feature beta list |
| APP-1001 | 404 | `Application not found or not owned by user` | — | The application does not exist or belongs to someone else. | application, timeline, CV copy and compatibility step routes |
| APP-1002 | 422 | `Cannot modify an application from an archived cycle` | — | The application belongs to an archived cycle and is read-only. | application update, delete and timeline writes |
| APP-1003 | 409 | `Reopen the application to edit it (it is currently closed)` | — | The application is closed; reopen it first. | application writes (`guards.py`), finalize |
| APP-1004 | 409 | `This application has already been finalized` | — | The legacy finalize route was called on a finalized application. | `POST /applications/{id}/finalize` (compatibility) |
| APP-1005 | 404 | `Step not found or is invalid` | — | The legacy `step_id` is unknown. | compatibility step and finalize routes |
| APP-1006 | 404 | `Feedback not found` | — | The legacy `feedback_id` is unknown. | `POST /applications/{id}/finalize` (compatibility) |
| APP-1007 | 422 | `salary_offer is only allowed when the step is an offer` | — | A legacy finalize sent `salary_offer` on a step that is not an offer. | `POST /applications/{id}/finalize` (compatibility) |
| APP-1008 | 404 | `Application step not found or not owned by user` | — | The legacy application step does not exist or belongs to someone else. | `/applications/{id}/steps/{sid}` (compatibility) |
| APP-1009 | 404 | `Draft not found` | — | The application draft does not exist or belongs to someone else. | application draft routes |
| APP-1010 | 422 | `Pick a master CV before finishing` | — | Finishing a draft that has no master CV picked. | finish draft |
| APP-1011 | 409 | `You already have an application for this job` | — | Starting a draft from a job the user already applied to. | draft from a job |
| APP-1012 | 422 | `This job has no title to start from` | — | Starting a draft from a job without a title. | draft from a job |
| APP-1013 | 422 | `<field> cannot be in the future (max allowed: <date>)` | `field`, `date` | An application date is later than today. `params.field` is the field name, `params.date` the latest allowed day (ISO). | `validators/application_date.py` |
| APP-1014 | 422 | `<field> cannot be more than one day in the past (min allowed: <date>)` | `field`, `date` | An application date is earlier than allowed. `params.field` is the field name, `params.date` the earliest allowed day (ISO). | `validators/application_date.py` |
| EVT-1001 | 404 | `Timeline event not found or not owned by user` | — | The timeline event does not exist or belongs to someone else. | timeline event update and delete |
| EVT-1002 | 422 | `interview_type is only allowed on interview events` | — | `interview_type` sent on an event that is not an interview. | timeline event create and update (`rules.py`) |
| EVT-1003 | 422 | `denied_reason is only allowed on denied events` | — | `denied_reason` sent on an event that is not a denial. | timeline event create and update (`rules.py`) |
| EVT-1004 | 422 | `offer events require salary_amount, salary_currency and salary_period` | — | An offer event without its salary fields. | timeline event create and update (`rules.py`) |
| EVT-1005 | 422 | `salary_amount, salary_currency and salary_period are only allowed on offer events` | — | Salary fields sent on an event that is not an offer. | timeline event create and update (`rules.py`) |
| EVT-1006 | 422 | `start_time and end_time must be provided together` | — | Only one of `start_time` and `end_time` was sent. | timeline event create and update (`rules.py`) |
| EVT-1007 | 422 | `end_time must be after start_time` | — | The interview ends before it starts. | timeline event create and update (`rules.py`) |
| EVT-1008 | 422 | `start_time, end_time and timezone are only allowed on interview events` | — | A schedule sent on an event that is not an interview. | timeline event create and update (`rules.py`) |
| EVT-1009 | 422 | `offer salary_period must be monthly or annually` | — | An offer salary period other than monthly or annually. | timeline event create and update (`rules.py`) |
| EVT-1010 | 409 | `This application already has an initial screening interview; an application can have only one` | — | A second initial screening interview on one application. | timeline event create and update |
| CAT-1001 | 404 | `Company not found` | — | The company does not exist or is not visible to the caller. | catalog resolve, drafts, admin company routes |
| CAT-1002 | 404 | `Platform not found` | — | The platform does not exist or is not visible to the caller. | catalog resolve, draft from a job, admin platform routes |
| CAT-1003 | 409 | `A platform with this name already exists: <name>` | `name` | The caller already sees a platform with this name, ignoring case. `params.name` is that platform's name. | `POST /platforms` |
| CAT-1004 | 409 | `A company with this name and URL already exists.` | — | A company with the same name and URL is already visible to the caller. | `POST /companies` (`CompanyRepository`) |
| CV-1001 | 404 | `Base CV not found` | — | The master CV does not exist or belongs to someone else. | master CV routes, CV copy create, draft from a job |
| CV-1002 | 409 | `Base CV limit reached (max <max> per user)` | `max` | The user already has the most master CVs allowed. `params.max` is the limit. | `POST /base-cvs` |
| CV-1003 | 404 | `CV copy not found` | — | The application has no CV copy, or it belongs to someone else. | CV copy routes |
| CV-1004 | 409 | `This application already has a CV copy` | — | Creating a second CV copy for one application. | CV copy create |
| CV-1005 | 422 | `Add a job description to tailor by keywords` | — | Keyword tailoring needs a job description. | CV copy create, draft from a job |
| CV-1006 | 409 | `This CV copy has no baseline to compare with.` | — | The CV copy has nothing to diff against. | CV copy diff and diff exports |
| CV-1007 | 422 | `Unknown tailoring option` | — | The tailoring option is not one the API knows. | CV copy create |
| CV-1008 | 500 | `Could not render the CV PDF` | — | The CV PDF could not be rendered. The fixed text never quotes CV content. | master CV and CV copy PDF export |
| CV-1009 | 500 | `Could not render the CV Markdown` | — | The CV Markdown could not be rendered. | master CV and CV copy Markdown export, diff Markdown |
| CV-1010 | 500 | `Could not render the CV diff PDF` | — | The CV diff PDF could not be rendered. | CV copy diff PDF export |
| JOB-1001 | 404 | `Job not found` | — | The job does not exist or is not visible. | job detail, dismiss, restore, draft from a job |
| JOB-1002 | 404 | `Saved search not found` | — | The saved search does not exist or belongs to someone else. | saved search update and delete |
| JOB-1003 | 409 | `Saved search limit reached (max <max>)` | `max` | The user already has the most saved searches allowed. `params.max` is the limit. | saved search create |
| JOB-1004 | 409 | `A saved search with this name already exists` | — | The user already has a saved search with this name. | saved search create and update |
| CYC-1001 | 422 | `At least <min> applications are required to start a new cycle (currently <current>)` | `min`, `current` | A new cycle needs a minimum of applications in the current one. `params.min` is the minimum, `params.current` the count today. | `POST /cycles` |
| CYC-1002 | 404 | `Cycle not found or not owned by user` | — | The cycle does not exist or belongs to someone else. | `DELETE /cycles/{id}` |
| RPT-1001 | 403 | `Reports are for Borderless BASE and PSP members` | — | The caller has no recorded BASE or PSP badge. Was `badge_required` (ADR-0024). | every report route (`require_reports_badge`) |
| RPT-1002 | 403 | `Sign in again to confirm your membership` | — | The recorded badge no longer counts: the Borderless access expired or was refused. Was `membership_unconfirmed` (ADR-0024). | every report route (`require_reports_badge`) |
| RPT-1003 | 409 | `Report already submitted` | — | This report day was already submitted. | `SubmitReportUseCase` |
| RPT-1004 | 403 | `Must submit current report before proceeding` | — | The report day is not the next one due. | `SubmitReportUseCase` |
| RPT-1005 | 400 | `start_date is required for day 1 report` | — | The day 1 report needs a start date. | `SubmitReportUseCase` |
| RPT-1006 | 400 | `start_date cannot be in the future` | — | The day 1 start date is later than today. | `SubmitReportUseCase` |
| RPT-1007 | 403 | `Must submit day 1 report first` | — | A later report day before the day 1 report. | `SubmitReportUseCase` |
| RPT-1008 | 403 | `Cannot submit report for a future day` | — | The report day has not been reached yet. | `SubmitReportUseCase` |
| ADM-1001 | 403 | `Admin access required` | — | The caller is not an administrator. | every `/admin/*` route (`get_admin_user`) |
| ADM-1002 | 409 | `Cannot delete: <count> application(s) reference this company` | `count` | The company is still referenced. `params.count` is the number of applications. | `DELETE /admin/companies/{id}` |
| ADM-1003 | 409 | `Cannot delete: <count> application(s) or job source(s) reference this platform` | `count` | The platform is still referenced. `params.count` is the number of applications and job sources. | `DELETE /admin/platforms/{id}` |
| ADM-1004 | 409 | `A public company with this name and URL already exists: <name> (<url>, id <id>)` | `name`, `url`, `id` | Publishing a company that collides with a public row. `params` name the public row (`id` as a string). | `POST /admin/companies/{id}/publish` |
| ADM-1005 | 409 | `A public company with this name and URL already exists: <name> (<url>)` | `name`, `url` | Publishing a company lost a race with a concurrent publish of the same name and URL; the winning row could not be read. | `POST /admin/companies/{id}/publish` |
| ADM-1006 | 409 | `A public platform with this name already exists: <name> (id <id>)` | `name`, `id` | Publishing a platform that collides with a public row. `params` name the public row (`id` as a string). | `POST /admin/platforms/{id}/publish` |
| ADM-1007 | 409 | `A public platform with this name already exists: <name>` | `name` | Publishing a platform lost a race on the name; the winning row could not be read. | `POST /admin/platforms/{id}/publish` |
| ADM-1008 | 404 | `Feature not found` | — | The feature key has no row in `features`. | `/admin/features/*` |
| ADM-1009 | 409 | `A run is already in progress` | — | A job ingestion run is already running. | `POST /admin/jobs/runs` |
| ADM-1010 | 503 | `Background service unavailable` | — | The background worker queue cannot be reached. | `POST /admin/jobs/runs` |
| ADM-1011 | 404 | `Job source not found` | — | The job source does not exist. | `PATCH /admin/jobs/sources/{id}` |
| ADM-1012 | 404 | `Report webhook not found` | — | The report webhook does not exist. | `/admin/report-webhooks/{id}` |
| ADM-1013 | 422 | `Invalid Discord webhook URL` | — | The URL is not a Discord webhook URL. | `/admin/report-webhooks` (`validators/report_webhook.py`) |
| ADM-1014 | 422 | `Badge must be BASE or PSP` | — | A webhook badge other than BASE or PSP. | `/admin/report-webhooks` (`validators/report_webhook.py`) |
| ADM-1015 | 422 | `Choose at least one badge: BASE or PSP` | — | A webhook with no badge. | `/admin/report-webhooks` (`validators/report_webhook.py`) |
| ADM-1016 | 422 | `Each badge can be chosen once` | — | The same badge twice on one webhook. | `/admin/report-webhooks` (`validators/report_webhook.py`) |
| ADM-1017 | 422 | `Label must be at most <max> characters` | `max` | The webhook label is too long. `params.max` is the limit. | `/admin/report-webhooks` (`validators/report_webhook.py`) |
| ADM-1018 | 409 | `This webhook is already configured` | — | The webhook URL is already configured. | `/admin/report-webhooks` (`ReportWebhookRepository`) |
