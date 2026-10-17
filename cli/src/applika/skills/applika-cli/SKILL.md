---
name: applika-cli
description: >
  How to use the applika-cli tool to track job applications via the Applika.dev API.
  Use this skill whenever the user mentions "applika", wants to log, list, create, or
  edit job applications via the CLI, asks about the applika login flow, or wants to
  interact with the applika CLI in any way. Login is always the first step — verify
  authentication with `applika whoami` before running any other command.
---

# applika-cli Usage Guide

`applika-cli` is a terminal tool for tracking job applications on Applika.dev.
It signs in with GitHub, gets a session of its own (a device in the web
profile's Devices tab) and stores it locally, sent as `Authorization: Bearer`.

## 1. Pre-flight: Verify authentication first

**Always run `applika whoami` before doing anything else.**

```bash
applika whoami
# OK:    Logged in as: username=luissoares  name=Luis Soares  email=luis@example.com
# Fail:  Auth error: no session found
```

If `whoami` prints an auth error, run login before proceeding:

```bash
applika login
```

`applika login` opens the user's browser to GitHub. The sign-in is protected
by PKCE and comes back to a local loopback callback — the user just clicks
"Authorize" in the browser and the session is saved automatically. It prints
`Logged in as <username> on <device_name>`.

- `applika login --manual`: the browser cannot reach the local callback
  (remote desktop, another machine). The CLI prints a URL; the browser shows a
  `code#state` value with a Copy button; the user pastes it at the prompt.
- `applika login --device`: no browser on this machine (SSH, container). The
  CLI prints a web address and a short code (`XXXX-XXXX`); the user approves
  it in any browser where they are signed in to Applika. The code lasts 10
  minutes.
- `--device-name "Work laptop"` names the device (default: the host name).

**Important:** every flow needs the user in a browser. Claude cannot automate
it. Tell the user to complete the browser step and confirm when done, then
re-run `applika whoami` to verify the session is active.

### Login failure recovery

| Symptom | Cause | Action |
|---------|-------|--------|
| ``Please run `applika login` first.`` | Not logged in | Run `applika login` |
| ``Please run `applika login` again.`` | Session ended (logged out, revoked in Devices, expired) | Run `applika login` |
| `Login state mismatch` | Stale callback or pasted value | Retry `applika login` |
| `Invalid or expired code` on the token exchange | Code used or older than 60 s | Retry `applika login` |
| Browser doesn't open | Headless environment | Copy the printed URL, or use `applika login --device` |
| `The device code expired ...` / `The sign-in was denied ...` | `--device` code not approved in time, or denied | Run `applika login --device` again |
| `Session service unavailable. Try again in 5 seconds.` | Server outage; the session is kept | Wait and re-run the command |

### Logout

```bash
applika logout
```

`applika logout` ends the session on the server, then clears it locally. If
the server cannot end it (503, 429, no network) the session is kept and the
command exits 1: re-run it later, or revoke the device in the web profile's
Devices tab.

---

## 2. Listing Applications

```bash
# All applications in the active cycle
applika applications list

# With filters
applika applications list \
  --search "google" \
  --mode active \
  --status active \
  --platform LinkedIn \
  --from 2026-01-01 \
  --to 2026-06-30

# Machine-readable output for piping/parsing
applika applications list --output-format json

# Filter to a specific job-search cycle
applika applications list --cycle-id <snowflake-id>
```

### Filter options

| Flag | Values | Default |
|------|--------|---------|
| `--search TEXT` | Substring match on company name or role | — |
| `--mode` | `active` · `passive` · `all` | `all` |
| `--status` | `active` · `finalized` · `all` | `all` |
| `--platform TEXT` | Exact platform name (e.g. `LinkedIn`) | — |
| `--from YYYY-MM-DD` | Inclusive lower bound on application date | — |
| `--to YYYY-MM-DD` | Inclusive upper bound on application date | — |
| `--output-format` | `table` · `json` | `table` |
| `--cycle-id TEXT` | Filter to a specific cycle (snowflake ID — a large integer string from the API) | — |

---

## 3. Creating an Application

```bash
applika applications new \
  --company "Google" \
  --role "Senior Software Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-10
```

### Required flags

| Flag | Description |
|------|-------------|
| `--company TEXT` | Company name |
| `--role TEXT` | Job title |
| `--platform TEXT` | Platform name (e.g. `LinkedIn`, `RemoteOK`, `WeWorkRemotely`) |
| `--mode` | `active` (you applied) · `passive` (recruiter reached out) |
| `--date YYYY-MM-DD` | Date of application |

### Optional flags

| Flag | Description | Notes |
|------|-------------|-------|
| `--company-url URL` | Company website | |
| `--job-url URL` | Link to job posting | |
| `--observation TEXT` | Free-form notes | |
| `--country TEXT` | Country of the job | |
| `--experience-level` | `intern` · `junior` · `mid_level` · `senior` · `staff` · `lead` · `principal` · `specialist` | |
| `--work-mode` | `remote` · `hybrid` · `on_site` | |
| `--expected-salary FLOAT` | Expected salary amount | Requires `--currency` + `--salary-period` |
| `--salary-min FLOAT` | Salary range minimum | Requires `--currency` + `--salary-period` |
| `--salary-max FLOAT` | Salary range maximum | Requires `--currency` + `--salary-period` |
| `--currency` | `USD` · `BRL` · `EUR` · `GBP` · `CAD` · `AUD` · `JPY` · `CHF` · `INR` · `CNY` · `SEK` · `NOK` · `DKK` · `PLN` · `SGD` · `HKD` · `NZD` · `MXN` · `ZAR` · `AED` (20 total) | Required when any salary field is set |
| `--salary-period` | `hourly` · `monthly` · `annually` (`annual` still accepted — the 0.1.4 spelling — but prefer `annually`; the API always reports `annually` back) | Required when any salary field is set. |

**Salary cross-field rule:** if any salary amount is provided (`--expected-salary`,
`--salary-min`, or `--salary-max`), both `--currency` and `--salary-period` are
required. The CLI validates this before calling the API and prints a clear error.

---

## 4. Editing an Application

```bash
# Update specific fields — unspecified fields keep their current values
applika applications edit <application-id> \
  --role "Staff Engineer" \
  --company "Acme"

# Clear optional fields explicitly (--clear is repeatable)
applika applications edit <application-id> \
  --clear job_url \
  --clear observation \
  --clear country \
  --clear salary
```

`application-id` is the snowflake `id` from the list output — a large integer
encoded as a string (e.g. `"1234567890123456789"`). Use
`applika applications list --output-format json` to find it.

### --clear flag

`--clear <field>` sets a nullable field to null. It is repeatable — pass it
once per field.

| Value | Effect |
|-------|--------|
| `observation` | Set observation to null |
| `job_url` | Set job URL to null |
| `country` | Set country to null |
| `experience_level` | Set experience level to null |
| `work_mode` | Set work mode to null |
| `expected_salary` | Set expected salary to null |
| `salary_min` | Set salary range minimum to null |
| `salary_max` | Set salary range maximum to null |
| `currency` | Set currency to null |
| `salary_period` | Set salary period to null |
| `salary` | Null out all salary fields at once (shortcut for the five above) |

Finalized applications cannot be edited — the CLI rejects them before calling the API.

All `new` optional flags are also available on `edit`.

---

## 5. Global Option

```bash
applika --api-base-url https://staging.applika.dev/api applications list
```

| Flag | Default | Env override |
|------|---------|-------------|
| `--api-base-url TEXT` | `https://applika.dev/api` | `APPLIKA_API_BASE_URL` |

---

## 6. Common Workflows

### Log a job application right now

```bash
applika whoami   # confirm session first
applika applications new \
  --company "Stripe" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date "$(date +%Y-%m-%d)"
```

### Find an application's ID to edit it

```bash
applika applications list --search "stripe" --output-format json
# returns JSON array — inspect the "id" field (a snowflake string like "1234567890123456789")
applika applications edit 1234567890123456789 --role "Staff Engineer"
```

### Log a passive lead (recruiter reached out)

```bash
applika applications new \
  --company "Cloudflare" \
  --role "Systems Engineer" \
  --platform "LinkedIn" \
  --mode passive \
  --date 2026-05-11 \
  --observation "Recruiter cold-messaged on LinkedIn"
```

### Record an offer

An offer is a timeline event or a finalize outcome, not an `applications edit` flag:

```bash
# Add it to the timeline without closing the application
applika applications timeline add 1234567890123456789 \
  --type offer --date 2026-06-18 \
  --salary 180000 --currency USD --period annually

# Or close the application with the offer as the outcome
applika applications finalize 1234567890123456789 \
  --outcome offer --salary 180000 --currency USD --period annually \
  --date 2026-06-18
```

---

## 7. Installation (if not already installed)

```bash
# Requires Python 3.10+ and uv
uv tool install applika-cli

# Or from a local source checkout
uv tool install --force .
```

Verify:

```bash
applika --help
applika whoami
```

---

## 8. Application Timeline (use this, not "Application Steps")

An application's timeline is its list of events: notes, interviews (typed),
feedback, an offer, or a denial. Finalizing (closing) an application is now
**reversible** with `applications reopen` — it is no longer permanent.

```bash
# List events
applika applications timeline list <application-id>
applika applications timeline list <application-id> --output-format json

# Add a note
applika applications timeline add <application-id> \
  --type note --date 2026-06-01 --observation "Applied via referral"

# Add an interview (defaults --interview-type to "unknown" if omitted)
applika applications timeline add <application-id> \
  --type interview --interview-type technical --date 2026-06-05 \
  --start-time 14:00 --end-time 15:00 --timezone America/Sao_Paulo

# Add an offer (salary triad is required together, period is monthly or annually only)
applika applications timeline add <application-id> \
  --type offer --date 2026-06-10 \
  --salary 180000 --currency USD --period annually

# Add a denial with a reason (defaults --reason to "unknown" if omitted)
applika applications timeline add <application-id> \
  --type denied --date 2026-06-11 --reason skills_mismatch

# Edit an event (PUT replaces the whole event; unspecified flags keep current values)
applika applications timeline edit <application-id> <event-id> --observation "Updated"

# Change a denied event's reason without touching anything else
applika applications timeline edit <application-id> <event-id> --reason ghosted

# Delete an event
applika applications timeline delete <application-id> <event-id>
```

Event types: `note`, `interview`, `feedback`, `offer`, `denied`.
Interview types: `unknown` (default), `initial_screening`, `technical`,
`cultural`, `hiring_manager`, `take_home`, `final`. An application can have
at most one `initial_screening` interview (409 on a second one).
Denied reasons: `unknown` (default), `not_good_enough`, `skills_mismatch`,
`assessment_failed`, `too_many_candidates`, `position_filled`,
`role_closed`, `ghosted`, `salary_mismatch`, `other` (shown as Unknown, Not
good enough, Skills mismatch, Assessment failed, Too many candidates,
Position filled, Role closed, Ghosted, Salary mismatch, Other in
`timeline list`/`add`/`edit` output).

`--interview-type` is only valid with `--type interview`.
`--start-time`/`--end-time`/`--timezone` are only valid with `--type
interview` (refused for every other type, `add` and `edit` alike; the API
returns 422 for the same reason if the check is ever bypassed).
`--salary`/`--currency`/`--period` are only valid with `--type offer`, and
then all three are required together; `--period` is `monthly` or `annually`
only (an hourly offer is refused).
`--reason` is only valid with `--type denied`; defaults to `unknown` if
omitted on a denied event.

`edit` fetches the current event and overlays the flags given: changing
`--type` away from `offer` drops the salary fields, away from `interview`
drops the interview type, away from `denied` drops the reason; changing to
`interview` without `--interview-type` defaults to `unknown`; changing to
`offer` requires the salary triad unless the event already had one;
`--reason` is valid when `--type denied` is given, or when `--type` is
omitted and the event is already `denied` — an edit that does not pass
`--reason` preserves the event's current reason. The resulting type — the
`--type` given, else the event's current type — governs `--start-time`/
`--end-time`/`--timezone` too: changing away from `interview` never
re-sends a stored schedule (the PUT is a full replace, so it goes out
null), even if the event being edited still has one.

If an application is closed, a write to its timeline is refused (409) with
a hint to run `applika applications reopen <application-id>`.

## 9. Finalizing (closing) an application

```bash
# Plain close, no outcome (idempotent - safe to run more than once)
applika applications finalize <application-id>

# Close with an offer
applika applications finalize <application-id> \
  --outcome offer --salary 180000 --currency USD --period annually \
  --date 2026-06-18 --observation "Signed"

# Close with a denial
applika applications finalize <application-id> \
  --outcome denied --date 2026-06-18 --observation "Not a fit"

# Close with a denial and a specific reason (defaults to "unknown" if omitted)
applika applications finalize <application-id> \
  --outcome denied --reason position_filled

# Reopen a closed application (idempotent) so its timeline is editable again
applika applications reopen <application-id>
```

Rules:
- No flags at all: idempotent bodyless close, no outcome recorded.
- `--outcome offer|denied` closes with a timeline event of that outcome.
  `--date` and `--observation` are only valid together with `--outcome`.
- `--salary`/`--currency`/`--period` are only valid with `--outcome offer`,
  and then all three are required; `--period` is `monthly` or `annually`
  only.
- `--reason` is only valid with `--outcome denied`; refused with
  `--outcome offer`, with no `--outcome` at all, or with the deprecated
  `--step` body. Same ten values as `timeline add|edit --reason`; defaults
  to `unknown` if omitted.
- `--step`, `--feedback` and `--salary-offer` are the **deprecated** 0.1.4
  body — still work exactly as before, but print as deprecated in
  `--help`. They cannot be combined with `--outcome`/`--salary`/
  `--currency`/`--period`/`--reason`.
- A 409 on an already-closed application suggests
  `applika applications reopen <application-id>`.

## 10. Application Steps and legacy finalize flags (deprecated)

**Deprecated — prefer `applications timeline` (section 8) and
`applications finalize --outcome` (section 9).** Kept only so installed
CLIs and existing scripts keep working; every command below still works
exactly as in 0.1.4.

Important distinction:
- Normal steps are used while the application is active.
- Strict steps are final-only and can only be used during finalization.

### List recorded steps for an application

```bash
applika applications steps list <application-id>
applika applications steps list <application-id> --output-format json
```

Use this to find the recorded step entry `id` needed by `steps edit` and
`steps delete`.

### Add a step

```bash
applika applications steps add <application-id> \
  --step "Initial Screen" \
  --date 2026-05-11

applika applications steps add <application-id> \
  --step "Phase 2" \
  --date 2026-05-14 \
  --start-time 14:00 \
  --end-time 15:00 \
  --timezone America/Sao_Paulo \
  --observation "Panel interview"
```

Rules:
- `--step` must be a predefined non-strict step definition from supports, such as `Initial Screen`, `Phase 2`, `Phase 3`, or `Phase 4`.
- Interview labels like `Manager Interview` belong in `--observation`, not `--step`, unless they were explicitly created as step definitions in supports.
- `--start-time` and `--end-time` must be provided together.
- `--end-time` must be after `--start-time`.
- Finalized applications reject step mutations.

### Edit a recorded step

```bash
applika applications steps edit \
  --application-id <application-id> \
  --step-record-id <step-record-id> \
  --step "Phase 2"

applika applications steps edit \
  --application-id <application-id> \
  --step-record-id <step-record-id> \
  --clear observation \
  --clear time

applika applications steps edit \
  --application-id <application-id> \
  --step-record-id <step-record-id> \
  --start-time 15:00 \
  --end-time 16:00 \
  --timezone America/Sao_Paulo
```

`steps edit` keeps unspecified fields unchanged.
The positional form still works: `applika applications steps edit <application-id> <step-record-id> ...`

Supported clear flags:
- `--clear observation`
- `--clear time`
- `--clear timezone`

### Delete a recorded step

```bash
applika applications steps delete \
  --application-id <application-id> \
  --step-record-id <step-record-id>
```

The positional form still works: `applika applications steps delete <application-id> <step-record-id>`

### Finalize an application

```bash
applika applications finalize <application-id> \
  --step "Denied" \
  --feedback "Assessment failed" \
  --date 2026-05-18 \
  --observation "Closed after take-home"

applika applications finalize <application-id> \
  --step "Denied" \
  --feedback "Not good enough" \
  --date 2026-05-18 \
  --output-format json

applika applications finalize <application-id> \
  --step "Offer" \
  --feedback "Accepted" \
  --date 2026-05-18 \
  --salary-offer 180000 \
  --observation "Signed the offer"
```

Rules:
- `--step` must be a strict final step definition.
- `--feedback` must be a feedback definition.
- `--salary-offer` is optional and useful for accepted/offer outcomes.
- Once finalized, the application and its steps are no longer editable —
  unless reopened with `applika applications reopen <application-id>`
  (section 9), after which it is editable again.
- `--output-format` supports `table` (default summary output) and `json`.
- Deprecated (section 9's `--outcome` replaces it): `--step`, `--feedback`
  and `--salary-offer` cannot be combined with `--outcome`, `--salary`,
  `--currency` or `--period`.

### Common step/finalize workflows

Find an application ID:

```bash
applika applications list --search "stripe" --output-format json
```

Inspect steps to find a step-record ID:

```bash
applika applications steps list 1234567890123456789 --output-format json
```

Add interview progression steps:

```bash
applika applications steps add 1234567890123456789 \
  --step "Initial Screen" \
  --date 2026-05-11

applika applications steps add 1234567890123456789 \
  --step "Phase 2" \
  --date 2026-05-14 \
  --observation "Strong technical round"
```

Finalize as rejected:

```bash
applika applications finalize 1234567890123456789 \
  --step "Denied" \
  --feedback "Not good enough" \
  --date 2026-05-18
```

Finalize with accepted offer plus salary:

```bash
applika applications finalize 1234567890123456789 \
  --step "Offer" \
  --feedback "Accepted" \
  --date 2026-05-18 \
  --salary-offer 180000
```

---

## 11. Master CVs (`applika cvs`) — since 1.0.0

Up to **3** master CVs per user. A fourth is refused with a 409.

```bash
# List them (table by default)
applika cvs list
applika cvs list --output json          # or yaml
applika cvs list --output md            # a Markdown table: id, name, headline, updated

# Show one
applika cvs get <cv-id>                 # human summary
applika cvs get <cv-id> --output json   # or yaml — a document --file accepts
applika cvs get <cv-id> --output md     # the CV as the server renders it

# Create one from a file (JSON or YAML)
applika cvs create --file cv.yaml
applika cvs create --file cv.json --name "Backend CV"
cat cv.json | applika cvs create --file -    # - reads JSON or YAML from stdin

# Edit — partial: a section in the file replaces that section,
# an absent key is left unchanged
applika cvs edit <cv-id> --file headline-only.yaml
applika cvs edit <cv-id> --name "Renamed"

# Delete (--yes skips the confirmation)
applika cvs delete <cv-id> --yes

# Download as PDF or Markdown
applika cvs download <cv-id> --type pdf
applika cvs download <cv-id> --type md --dir ./out --filename backend-cv
applika cvs download <cv-id> --type pdf --force    # overwrite an existing file
```

### `--file` rules (all CV commands)

- Format is picked by the extension: `.json`, `.yaml`, `.yml`. `-` reads
  stdin and sniffs JSON then YAML.
- Keys are the **API field names**: `name`, `full_name`, `headline`,
  `location`, `email`, `phone`, `summary`, `links`, `skills`, `experience`,
  `projects`, `education`, `certifications`, `languages`.
- Create requires `name`, `full_name`, `headline`, `location`, `email`
  (`--name` can supply `name`).
- Dates are `YYYY-MM`. `start` is required on `experience` and `education`;
  `end` absent or `null` means "present". An `end` earlier than its `start`
  is refused.
- Section items may carry a client `id`; missing ids are generated, given
  ids are kept.
- Unknown keys are an error. The server-only keys (`id`, `created_at`,
  `updated_at`, and a copy's `application_id`, `base_cv_id`,
  `was_ai_generated`, `adjustments`, `base_snapshot`) are accepted and
  ignored, so `get --output json` → edit → `edit --file` round-trips.
- `--file` never reads Markdown. `md` is output only.

### Example CV file (YAML)

```yaml
name: Backend CV
full_name: Ada Lovelace
headline: Backend Engineer
location: Lisbon, Portugal
email: ada@example.com
phone: "+351 900 000 000"
summary: Builds APIs that stay up.
links:
  - label: GitHub
    url: https://github.com/ada
skills:
  - category: Python
    keywords: [FastAPI, asyncio, SQLAlchemy]
experience:
  - company: Acme
    role: Senior Engineer
    location: Remote
    start: "2021-03"
    end: null
    bullets:
      - Cut p95 latency by 40%.
education:
  - institution: University of Lisbon
    degree: BSc
    area: Computer Science
    start: "2016-09"
    end: "2020-07"
languages:
  - name: English
    level: C2
```

### Downloads

`--type pdf|md` is **required**. `--dir` defaults to the current directory
and is created when missing. `--filename` defaults to the server's own file
name, and the extension matching `--type` is appended when missing. An
existing file is never overwritten unless `--force`.

---

## 12. An application's CV copy (`applika applications cv`) — since 1.0.0

One copy per application, made from a master CV and then tailored. A closed
or archived application refuses writes (the API's message is printed); reads
and downloads keep working.

```bash
# Copy a master CV into an application and apply the edits in ONE command
applika applications cv create <application-id> --from <cv-id> --file tailoring.yaml
applika applications cv create <application-id> --from <cv-id> --name "Acme — Backend"

# Show it
applika applications cv get <application-id>
applika applications cv get <application-id> --output md     # server-rendered Markdown

# Edit it (partial, same semantics as the master CV)
applika applications cv edit <application-id> --file more-edits.json
applika applications cv edit <application-id> --name "Acme — Staff"

# Download it
applika applications cv download <application-id> --type pdf --dir ./out
applika applications cv download <application-id> --type md

# Download the diff against the master CV it came from
applika applications cv diff <application-id> --type md --print   # straight to stdout
applika applications cv diff <application-id> --type pdf --dir ./out

# Remove the copy
applika applications cv delete <application-id> --yes
```

A copy with no baseline to compare against answers 409, printed as
"nothing to compare against". `--print` is only valid with `--type md`.

---

## 13. `--file` and the job description on applications — since 1.0.0

`applications new` and `applications edit` accept the whole payload as a
file instead of the named options. The named options still work exactly as
before; the two inputs are mutually exclusive.

```bash
# Create from a file (API field names)
applika applications new --file application.json
cat application.yaml | applika applications new --file -

# Edit from a file — only the keys present are updated
applika applications edit <application-id> --file patch.yaml

# The job description (plain text or Markdown)
applika applications new --file application.json --job-description "We need…"
applika applications new --file application.json --job-description-file jd.md
applika applications edit <application-id> --job-description-file jd.md
applika applications edit <application-id> --job-description ""   # clears it
```

```json
{
  "company": "Acme",
  "role": "Backend Engineer",
  "mode": "active",
  "platform_id": "10",
  "application_date": "2026-09-23",
  "link_to_job": "https://jobs.example/acme",
  "country": "Portugal",
  "job_description": "We need a backend engineer…"
}
```

`company` may be a company id, a company name (resolved the same way
`--company` resolves it) or an object `{"name": …, "url": …}`.
`job_description` is also accepted as a key in `--file`; the option wins
when both are given. On `edit`, the key is never sent unless you asked for
it, so the stored text is left alone.

---

## 14. Exit codes

- **0** — success.
- **1** — the API refused the request; the API's `detail` is printed.
- **2** — a usage or file-validation error; nothing was sent.
