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
It uses GitHub OAuth for login and stores a session cookie locally.

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

`applika login` opens the user's browser to GitHub OAuth. The CLI listens on a
local loopback port for the OAuth callback — the user just clicks "Authorize"
in the browser and the session is saved automatically.

**Important:** this is a browser-based flow. Claude cannot automate it. Tell
the user to complete the browser step and confirm when done, then re-run
`applika whoami` to verify the session is active.

### Login failure recovery

| Symptom | Cause | Action |
|---------|-------|--------|
| `Auth error: no session found` | Not logged in | Run `applika login` |
| `Login state mismatch` | Stale callback URL | Retry `applika login` |
| `401` on exchange | Code expired in browser | Retry `applika login` |
| Browser doesn't open | Headless environment | Copy the printed URL manually |

### Logout

```bash
applika logout
```

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
| `--platform TEXT` | Platform name (e.g. `LinkedIn`, `Indeed`, `Glassdoor`) |
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
| `--currency` | `USD` · `BRL` · `EUR` · `GBP` · `CAD` · `AUD` · `JPY` · `CHF` · `INR` | Required when any salary field is set |
| `--salary-period` | `hourly` · `monthly` · `annual` | Required when any salary field is set |

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
  --platform "Email" \
  --mode passive \
  --date 2026-05-11 \
  --observation "Recruiter cold-messaged on LinkedIn"
```

### Add salary info after receiving an offer

```bash
applika applications edit 1234567890123456789 \
  --expected-salary 180000 \
  --currency USD \
  --salary-period annual
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
