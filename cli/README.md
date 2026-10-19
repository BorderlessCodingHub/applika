# applika-cli

Command-line interface for [Applika.dev](https://applika.dev) — a structured job application tracker designed for active job seekers who want full control over their data without relying on a browser.

Track every application you send, filter and review your pipeline from the terminal, and keep your AI coding assistant (Claude Code, Gemini, Codex) aware of the CLI through a bundled skill file.

- Website: <https://applika.dev>
- Package: <https://pypi.org/project/applika-cli/>
- API: `https://applika.dev/api` by default (see [Global options](#global-options))

## Requirements

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

## Installation

```bash
# Using uv (recommended)
uv tool install applika-cli

# Using pipx
pipx install applika-cli
```

This installs the `applika` binary globally. Verify:

```bash
applika --help
applika --version
applika version
```

`applika --version` shows the installed CLI version.
`applika version` checks PyPI and shows the latest published version alongside
the installed one.

To run from a local source checkout during development:

```bash
uv sync
uv run applika --help
```

If you want the global `applika` command to point at your local checkout while
you develop, install it in editable mode:

```bash
uv tool install --force --editable .
```

---

## Authentication

The CLI signs in with GitHub and gets a session of its own: each sign-in is a device listed in your web profile's **Devices** tab, where you can revoke it. The session (access + refresh tokens) is saved to `~/.config/applika/session.json` and the access token is sent as `Authorization: Bearer`. It refreshes automatically — you only need to log in once per device.

```bash
# Default: your browser opens; the sign-in comes back to a local callback (PKCE)
applika login

# The browser cannot reach this machine's callback: paste the code#state it shows
applika login --manual

# No browser on this machine (SSH, container): approve a short code elsewhere
applika login --device
# → To sign in, open: https://applika.dev/device
# → and enter the code: ABCD-EFGH

# Name the device (default: the host name, at most 100 characters)
applika login --device-name "Work laptop"
# → Logged in as luissoares on Work laptop

# Verify the active session without making any other API call
applika whoami
# → Logged in as: username=luissoares  name=Luis Soares  email=luis@example.com

# End the session on the server, then clear local storage
applika logout
```

Logging in again ends the previous session first. If the server answers "Session service unavailable" (503) or "Too many requests" (429), the stored session is kept: run the command again after the wait. `applika logout` in that case keeps the session too and exits 1 — run it again later, or revoke the device in the web profile's Devices tab.

> `applika whoami` is the recommended pre-flight check. Run it before any other command, especially in scripts or AI-assisted workflows, to confirm a valid session exists before hitting the API.

---

## Commands

### `applika applications list`

Lists all job applications in the current cycle, sorted by date descending. Supports rich filtering and both human-readable table output and machine-readable JSON.

```bash
# Default: all applications as a table
applika applications list

# Narrow down by any combination of filters
applika applications list \
  --search "stripe" \
  --mode active \
  --status active \
  --platform LinkedIn \
  --from 2026-01-01 \
  --to 2026-06-30

# JSON output — useful for piping into jq or scripts
applika applications list --output-format json

# Scope to a specific job-search cycle by snowflake ID
applika applications list --cycle-id <snowflake-id>
```

**Filter reference:**

| Flag | Values | Default | Description |
|---|---|---|---|
| `--search TEXT` | any string | — | Case-insensitive substring match on company name or role title |
| `--mode` | `active` · `passive` · `all` | `all` | `active` = you applied; `passive` = recruiter reached out |
| `--status` | `active` · `finalized` · `all` | `all` | `finalized` applications have a recorded outcome |
| `--platform TEXT` | e.g. `LinkedIn` | — | Exact match on platform name |
| `--from YYYY-MM-DD` | date | — | Include applications from this date (inclusive) |
| `--to YYYY-MM-DD` | date | — | Include applications up to this date (inclusive) |
| `--output-format` | `table` · `json` | `table` | `json` returns the raw API response as a formatted array |
| `--cycle-id TEXT` | snowflake ID | — | Filter to a specific job-search cycle |

---

### `applika applications new`

Records a new job application. The CLI validates the payload locally with Pydantic before calling the API, so you get clear field-level error messages without a round-trip.

```bash
# Minimal — required fields only
applika applications new \
  --company "Stripe" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-10

# With salary info (currency and period are always required together with any salary field)
applika applications new \
  --company "Cloudflare" \
  --role "Systems Engineer" \
  --platform "LinkedIn" \
  --mode passive \
  --date 2026-05-10 \
  --observation "Recruiter cold-messaged. Interesting stack." \
  --country "Brazil" \
  --work-mode remote \
  --salary-min 18000 \
  --salary-max 24000 \
  --currency BRL \
  --salary-period monthly
```

**Required flags:**

| Flag | Description |
|---|---|
| `--company TEXT` | Company name. Matched against known companies; a new record is created if not found. |
| `--role TEXT` | Job title or role description |
| `--platform TEXT` | Platform where you found or were contacted about the role (e.g. `LinkedIn`, `RemoteOK`, `WeWorkRemotely`) |
| `--mode` | `active` — you applied proactively · `passive` — inbound from a recruiter |
| `--date YYYY-MM-DD` | Date the application was submitted or the first contact occurred |

**Optional flags:**

| Flag | Description |
|---|---|
| `--company-url URL` | Company website |
| `--job-url URL` | Direct link to the job posting |
| `--observation TEXT` | Free-form notes about the role, process, or company |
| `--country TEXT` | Country where the role is based |
| `--work-mode` | `remote` · `hybrid` · `on_site` |
| `--experience-level` | `intern` · `junior` · `mid_level` · `senior` · `staff` · `lead` · `principal` · `specialist` |
| `--expected-salary FLOAT` | The salary you expect or asked for |
| `--salary-min FLOAT` | Lower bound of a posted salary range |
| `--salary-max FLOAT` | Upper bound of a posted salary range |
| `--currency` | `USD` · `BRL` · `EUR` · `GBP` · `CAD` · `AUD` · `JPY` · `CHF` · `INR` · `CNY` · `SEK` · `NOK` · `DKK` · `PLN` · `SGD` · `HKD` · `NZD` · `MXN` · `ZAR` · `AED` (20 total) |
| `--salary-period` | `hourly` · `monthly` · `annually` (`annual` is still accepted — the spelling `applika-cli` 0.1.4 sent — but the API always reports `annually` back, so use `annually` going forward) |

> **Salary rule:** if any salary amount is provided (`--expected-salary`, `--salary-min`, or `--salary-max`), both `--currency` and `--salary-period` become required. The CLI enforces this before making any API call.

---

### `applika applications edit <id>`

Updates an existing application. Only the flags you pass are changed — everything else keeps its current value. This makes partial updates safe: you can update just the role name or add salary info without touching anything else.

```bash
# Update the role title
applika applications edit 42 --role "Staff Engineer"

# Add salary info that wasn't captured at application time
applika applications edit 42 \
  --expected-salary 180000 \
  --currency USD \
  --salary-period annually

# Clear fields you no longer want to track (--clear is repeatable)
applika applications edit 42 \
  --clear job_url \
  --clear observation \
  --clear country \
  --clear salary
```

Find the application `id` with:

```bash
applika applications list --search "company name" --output-format json
```

**Clear flags** — pass `--clear <field>` (repeatable) to set a field back to null without affecting others:

| Flag | Clears |
|---|---|
| `--clear observation` | Notes |
| `--clear job_url` | Job posting URL |
| `--clear country` | Country |
| `--clear experience_level` | Experience level |
| `--clear work_mode` | Work mode |
| `--clear expected_salary` | Expected salary amount |
| `--clear salary_min` | Minimum salary range |
| `--clear salary_max` | Maximum salary range |
| `--clear currency` | Salary currency |
| `--clear salary_period` | Salary period |
| `--clear salary` | All salary fields at once (`expected_salary`, `salary_min`, `salary_max`, `currency`, `salary_period`) |

> Finalized applications (those with a recorded outcome) are read-only and cannot be edited. The CLI checks this before sending the request.

---

### `applika applications timeline list|add|edit|delete`

Manages an application's timeline: typed interviews, an offer, or a denial. Notes and feedback are no longer event types; the ones recorded before read as an interview with interview type `unknown`. Closing an application is reversible (`applications reopen`), so the timeline is editable again after a reopen.

`add --type offer` and `add --type denied` close the application with that event (as `applications finalize --outcome` does) and print the closed application with its outcome, unless `--keep-open` is given. With `--keep-open` the event is only added to the timeline. `--keep-open` is ignored with `--type interview`. A closing event cannot be dated later than today; the server refuses it and nothing changes.

```bash
# List events (table or JSON)
applika applications timeline list 42
applika applications timeline list 42 --output-format json

# Add a typed interview (defaults --interview-type to unknown if omitted)
applika applications timeline add 42 \
  --type interview --interview-type technical --date 2026-06-05 \
  --start-time 14:00 --end-time 15:00 --timezone America/Sao_Paulo

# Add an offer and close the application (the salary triad is required together; period is monthly or annually only)
applika applications timeline add 42 \
  --type offer --date 2026-06-10 --salary 180000 --currency USD --period annually

# Add a denial with a reason and close the application (defaults --reason to unknown if omitted)
applika applications timeline add 42 \
  --type denied --date 2026-06-11 --reason skills_mismatch --observation "Rejected after the technical round"

# Add an offer and keep the application open
applika applications timeline add 42 \
  --type offer --date 2026-06-10 --salary 180000 --currency USD --period annually --keep-open

# Edit an event - PUT replaces the whole event; unspecified flags keep the current value
applika applications timeline edit 42 700 --observation "Updated"

# Delete an event
applika applications timeline delete 42 700
```

| Flag | Applies to | Notes |
|---|---|---|
| `--type` | `add` (required), `edit` | `interview` · `offer` · `denied` |
| `--date` | `add` (required), `edit` | Event date (YYYY-MM-DD) |
| `--interview-type` | `add`, `edit` | Only with `--type interview`; defaults to `unknown` |
| `--start-time`/`--end-time` | `add`, `edit` | Must be given together |
| `--timezone`, `--observation` | `add`, `edit` | |
| `--salary`, `--currency`, `--period` | `add`, `edit` | Only with `--type offer`; then all three required. `--period` is `monthly` or `annually` (an hourly offer is refused) |
| `--keep-open` | `add` | With `--type offer` or `denied`: add the event and keep the application open (without it, the event closes the application). Ignored with `--type interview` |

`edit` fetches the current event and overlays the flags given: changing `--type` away from `offer` drops the salary fields, away from `interview` drops the interview type; changing to `interview` without `--interview-type` defaults to `unknown`; changing to `offer` requires the salary triad unless the event already had one.

A write to a closed application's timeline, closing or not, is refused (409) with a hint to run `applika applications reopen <application-id>`.

---

### `applika applications finalize [<application-id>]`

Closes (finalizes) an application. Closing is reversible: `applika applications reopen` reopens it.

```bash
# Plain close - idempotent, no outcome recorded, safe to run more than once
applika applications finalize 42

# Close with an offer
applika applications finalize 42 \
  --outcome offer --salary 180000 --currency USD --period annually \
  --date 2026-06-18 --observation "Signed"

# Close with a denial
applika applications finalize 42 --outcome denied --date 2026-06-18 --observation "Not a fit"
```

Rules:
- No flags at all: idempotent bodyless close (no outcome).
- `--outcome offer|denied`: closes with a timeline event of that outcome. `--date` and `--observation` are only valid together with `--outcome`.
- `--salary`/`--currency`/`--period` are only valid with `--outcome offer`, and then all three are required; `--period` is `monthly` or `annually` only.
- A 409 on an already-closed application suggests `applika applications reopen <application-id>`.

**Deprecated flags** (still work exactly as in 0.1.4, but cannot be combined with the flags above): `--step`, `--feedback`, `--salary-offer`. See "Application Steps and the deprecated finalize flags" below.

---

### `applika applications reopen [<application-id>]`

Reopens a closed application so its timeline is editable again. Idempotent — reopening an already-open application is a no-op.

```bash
applika applications reopen 42
```

---

### `applika update [--force]`

Checks PyPI now and installs the latest `applika-cli` with the tool it was
installed with, or lists every reason it cannot. `--force` only lifts
`APPLIKA_DISABLE_AUTOUPDATE`. See [Updates](#updates).

```bash
applika update
applika update --force
```

---

## Application Steps and the deprecated finalize flags

**Deprecated.** Prefer `applications timeline` and `applications finalize --outcome` above. Everything in this section still works exactly as in 0.1.4 — it exists only so installed CLIs and existing scripts keep working.

### `applika applications steps list <application-id>`

Lists the recorded timeline steps for one application.

```bash
# Human-readable table
applika applications steps list 42

# JSON output for scripting
applika applications steps list 42 --output-format json
```

Each row uses the recorded step entry `id`, which is the identifier needed for
`steps edit` and `steps delete`.

---

### `applika applications steps add <application-id>`

Adds a non-final step to an active application.

```bash
applika applications steps add 42 \
  --step "Initial Screen" \
  --date 2026-05-11

applika applications steps add 42 \
  --step "Phase 2" \
  --date 2026-05-14 \
  --start-time 14:00 \
  --end-time 15:00 \
  --timezone America/Sao_Paulo \
  --observation "Panel with hiring manager"
```

Notes:
- `--step` accepts a predefined non-strict step definition name or ID from `/supports`, such as `Initial Screen`, `Phase 2`, `Phase 3`, or `Phase 4`.
- Interview labels like `Manager Interview` belong in `--observation`, not `--step`, unless they were explicitly created as step definitions in supports.
- `--start-time` and `--end-time` must be provided together.
- Finalized applications reject step mutations.

---

### `applika applications steps edit <application-id> <step-record-id>`

Updates an existing recorded step. Unspecified fields keep their current value.

```bash
# Change only the step definition
applika applications steps edit \
  --application-id 42 \
  --step-record-id 500 \
  --step "Phase 2"

# Clear notes and time while keeping the date
applika applications steps edit \
  --application-id 42 \
  --step-record-id 500 \
  --clear observation \
  --clear time

# Update the time window
applika applications steps edit \
  --application-id 42 \
  --step-record-id 500 \
  --start-time 15:00 \
  --end-time 16:00 \
  --timezone America/Sao_Paulo
```

The positional form still works for backward compatibility:

```bash
applika applications steps edit 42 500 --step "Phase 2"
```

**Clear flags** — pass `--clear <field>` (repeatable):

| Flag | Clears |
|---|---|
| `--clear observation` | Step notes |
| `--clear time` | Both `start_time` and `end_time` |
| `--clear timezone` | Step timezone |

---

### `applika applications steps delete <application-id> <step-record-id>`

Deletes a recorded step from an active application.

Preferred explicit form:

```bash
applika applications steps delete \
  --application-id 42 \
  --step-record-id 500
```

The positional form still works:

```bash
applika applications steps delete 42 500
```

---

### `applika applications finalize <application-id>` (deprecated flags)

The deprecated 0.1.4 body: finalizes an application by recording a strict
final step plus a feedback definition. Prefer `--outcome` (documented
above) instead — these flags cannot be combined with it.

```bash
# Finalize as rejected
applika applications finalize 42 \
  --step "Denied" \
  --feedback "Assessment failed" \
  --date 2026-05-18 \
  --observation "Closed after take-home"

# JSON output for scripting
applika applications finalize 42 \
  --step "Denied" \
  --feedback "Not good enough" \
  --date 2026-05-18 \
  --output-format json

# Finalize with an accepted offer
applika applications finalize 42 \
  --step "Offer" \
  --feedback "Accepted" \
  --date 2026-05-18 \
  --salary-offer 180000 \
  --observation "Signed the offer"
```

Notes:
- `--step` accepts only strict final steps.
- `--feedback` accepts a feedback definition name or ID.
- Once finalized, the application and its steps become immutable.
- `--output-format` supports `table` (default summary output) and `json`.

---

### `applika skill`

Installs the bundled AI skill into your assistant's skills directory. The skill teaches Claude Code, Gemini, Codex, or OpenCode how to use this CLI — what commands exist, how authentication works, required vs optional flags, and common workflows.

The skill file is shipped inside the installed package (`applika/skills/applika-cli/SKILL.md`) so it stays in sync with the CLI version you have installed. By default the command creates a symlink so updates are reflected automatically; it falls back to a file copy if symlink creation fails (e.g. Windows without Developer Mode enabled).

```bash
# Interactive — choose which tool(s) to install for
applika skill
# →  1. Claude   (~/.claude/skills/applika-cli)
# →  2. Gemini   (~/.gemini/skills/applika-cli)
# →  3. Codex    (~/.codex/skills/applika-cli)
# →  4. OpenCode (~/.agents/skills/applika-cli)
# →  5. All of the above

# Install to the current project's .claude/skills/ (file copy, no prompt)
# Useful when you want the skill scoped to a single repo
applika skill --local

# Install to any arbitrary directory (file copy, no prompt)
applika skill --dir /path/to/skills

# Preview what would be installed without touching the filesystem
applika skill --dry-run

# Overwrite an existing installation
applika skill --force
```

Once installed, the AI assistant automatically loads the skill context in every session and knows how to:
- check authentication with `applika whoami` before running commands
- construct valid `new` and `edit` payloads
- apply the correct filters on `list`
- recover from auth errors by prompting for `applika login`

---

## Master CVs and application CV copies

Since **1.0.0**. Up to three master CVs per user; one CV copy per application.

### `applika cvs list|get|create|edit|delete|download`

```bash
applika cvs list                                  # --output table|json|yaml|md
applika cvs get <cv-id> --output md               # text|json|yaml|md
applika cvs create --file cv.yaml --name "Backend CV"
applika cvs edit <cv-id> --file headline.json     # partial; --name also works alone
applika cvs delete <cv-id> --yes
applika cvs download <cv-id> --type pdf --dir ./out --filename backend-cv --force
```

| Command | Options |
|---|---|
| `cvs list` | `--output table\|json\|yaml\|md` (`md` = a Markdown table) |
| `cvs get <cv-id>` | `--output text\|json\|yaml\|md` (`md` = the server-rendered CV) |
| `cvs create` | `--file` (required) · `--name` (required unless the file has `name`) · `--output` |
| `cvs edit <cv-id>` | `--file` and/or `--name` (at least one) · `--output` |
| `cvs delete <cv-id>` | `--yes` |
| `cvs download <cv-id>` | `--type pdf\|md` (required) · `--dir` · `--filename` · `--force` |

### `applika applications cv get|create|edit|delete|download|diff`

```bash
applika applications cv create <application-id> --from <cv-id> --file tailoring.yaml
applika applications cv edit <application-id> --name "Acme — Staff"
applika applications cv get <application-id> --output md
applika applications cv download <application-id> --type pdf --dir ./out
applika applications cv diff <application-id> --type md --print
applika applications cv delete <application-id> --yes
```

| Command | Options |
|---|---|
| `applications cv get <id>` | `--output text\|json\|yaml\|md` |
| `applications cv create <id>` | `--from <cv-id>` (required) · `--file` · `--name` · `--output` |
| `applications cv edit <id>` | `--file` and/or `--name` (at least one) · `--output` |
| `applications cv delete <id>` | `--yes` |
| `applications cv download <id>` | `--type pdf\|md` (required) · `--dir` · `--filename` · `--force` |
| `applications cv diff <id>` | `--type pdf\|md` (required) · `--dir` · `--filename` · `--force` · `--print` (md only) |

A closed or archived application refuses writes and the API's message is
printed; reads and downloads keep working. A copy with no baseline answers
"nothing to compare against".

### `--file`

JSON (`.json`) or YAML (`.yaml`/`.yml`), picked by the extension; `-` reads
stdin. Keys are the API field names — `name`, `full_name`, `headline`,
`location`, `email`, `phone`, `summary`, `links`, `skills`, `experience`,
`projects`, `education`, `certifications`, `languages`. The document is
validated locally (types, required fields, lengths, `YYYY-MM` dates, an
`end` earlier than its `start`, unknown keys) before anything is sent.
Edits are **partial**: a section present in the file replaces that whole
section, an absent key is left unchanged. Section items may carry a client
`id`; missing ids are generated and given ids are kept.

`get --output json|yaml` prints a document `--file` accepts, so
export → edit → `edit --file` round-trips. `--file` never reads Markdown.

### Downloads

`--type pdf|md` is required. `--dir` defaults to the current directory and is
created when missing. `--filename` defaults to the server's file name, and
the extension matching `--type` is appended when missing. An existing file is
never overwritten unless `--force`.

---

## `--file` and the job description on applications

Since **1.0.0**. `applications new` and `applications edit` accept the whole
payload as a file instead of the named options (mutually exclusive with
them); every existing invocation keeps working unchanged.

```bash
applika applications new --file application.json
applika applications new --file application.json --job-description-file jd.md
applika applications edit <application-id> --file patch.yaml
applika applications edit <application-id> --job-description "We need…"
applika applications edit <application-id> --job-description ""   # clears it
```

`company` in the file may be a company id, a company name (resolved like
`--company`) or `{"name": …, "url": …}`. `job_description` is also accepted
as a file key; the option wins when both are given. On `edit` the key is
never sent unless you asked for it, so the stored text is left alone.

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | The API refused the request (its `detail` is printed) |
| 2 | A usage or file-validation error — nothing was sent |

---

## Global options

These flags apply to every command and are passed before the subcommand name:

```bash
applika --api-base-url http://127.0.0.1:8000/api applications list   # a local API
```

| Flag | Default | Env variable |
|---|---|---|
| `--api-base-url TEXT` | `https://applika.dev/api` | `APPLIKA_API_BASE_URL` |

| Env variable | Effect |
|---|---|
| `APPLIKA_DISABLE_AUTOUPDATE` | Any value except empty, `0` or `false` turns the daily auto update off (see [Updates](#updates)) |

---

## Updates

At most once a day, after a command finishes, `applika` checks PyPI for a newer
`applika-cli` (it gives up after 3 seconds). When there is one, it installs it
with the tool it was installed with (it gives up after 2 minutes), then prints
one line on stderr:

```
Updated applika-cli 1.1.0 → 1.2.0
```

The next run uses the new version. The command's own output and exit status
never change: it runs after a failed command too, a failed check or install
prints nothing and waits for the next day, and Ctrl-C during the install only
stops the install. It needs no sign-in and calls no Applika API.

It stays off, quietly, when:

- the API base URL is not `https://applika.dev/api`, whether it comes from
  `--api-base-url`, `APPLIKA_API_BASE_URL` or the saved session;
- it is not an interactive terminal: `CI` is set, or stdin, stdout or stderr is
  a pipe or a redirect (scripts, CI jobs, AI agents running `applika`);
- the CLI runs from a source checkout: the editable install from
  [Installation](#installation) (`uv tool install --force --editable .`) and
  `uv tool install --force .` from [Development](#development) never update;
- it cannot tell how the CLI was installed;
- `APPLIKA_DISABLE_AUTOUPDATE` is set to anything but empty, `0` or `false`.

### Update now with `applika update`

Updates now, without waiting for the daily check. It checks PyPI at once (it
gives up after 10 seconds) and installs the latest `applika-cli` with the tool
it was installed with. Unlike the daily update it runs anywhere: in a
terminal, in CI, in a pipe, or typed by an AI agent. It needs no sign-in and
calls no Applika API.

```bash
applika update            # update now
applika update --force    # update even when APPLIKA_DISABLE_AUTOUPDATE is set
```

It refuses, and exits `1`, when something blocks the update. It prints every
reason, one line each on stderr, each with the way back:

| Reason | Way back |
|---|---|
| The API base URL is not `https://applika.dev/api`, from `--api-base-url` | Run without `--api-base-url` |
| … from `APPLIKA_API_BASE_URL` | Unset `APPLIKA_API_BASE_URL` |
| … from your saved session | `applika logout`, then `applika login` without `--api-base-url` |
| The CLI runs from a source checkout (an editable install or `uv tool install --force .`) | Update it with git |
| It cannot tell how the CLI was installed | Upgrade with the tool you used (below) |
| `APPLIKA_DISABLE_AUTOUPDATE` is set to anything but empty, `0` or `false` | `applika update --force` |

`--force` only lifts `APPLIKA_DISABLE_AUTOUPDATE`; it changes nothing else.
An overridden URL, a source checkout or an unknown install refuse with or
without it. Another `applika update` (or the daily update) running at the same
time also refuses: `Another applika update is running.`

What it prints when nothing blocks it:

| Result | Output | Exit |
|---|---|---|
| Nothing newer on PyPI | `applika-cli 1.2.0 is up to date.` | 0 |
| Updated | `Updating applika-cli 1.1.0 → 1.2.0 (uv tool upgrade applika-cli)…` then `Updated applika-cli 1.1.0 → 1.2.0` | 0 |
| PyPI cannot be read | `Could not reach PyPI: <reason>`, then `Run it yourself: <command>` | 1 |
| A version that is not plain numbers | `Cannot compare installed <a> with published <b>.`, then `Run it yourself: <command>` | 1 |
| The installer failed | `Update failed: <command> exited <code>.`, its last 20 stderr lines, then `Run it yourself: <command>` | 1 |
| The installer ran past 2 minutes | `Update failed: <command> timed out after 120 s.`, then `Run it yourself: <command>` | 1 |
| The installer ran but the new version could not be confirmed | `Update failed: <command> ran, but the new version could not be confirmed…`, then `Run it yourself: <command>` | 1 |
| A pin kept the old version | `<uv\|pipx\|pip> kept applika-cli 1.1.0: your install pins that version. Reinstall without the pin to update.` | 1 |

Every check, failed or not, restarts the once-a-day clock, and the daily
update never runs right after `applika update`.

To update by hand, use the tool you installed with:

```bash
uv tool upgrade applika-cli                 # uv tool install applika-cli
pipx upgrade applika-cli                    # pipx install applika-cli
python -m pip install --upgrade applika-cli # pip install applika-cli
```

---

## Package structure

```
cli/
├── pyproject.toml               # Build config, dependencies, entry point
├── Makefile                     # Shortcuts: test, lint, format
├── README.md
├── CLAUDE.md                    # Guidance for AI assistants working in this repo
└── src/
    └── applika/                 # Importable package (entry: applika.main:main)
        ├── main.py              # Entry point — calls app()
        ├── app.py               # Root Typer app, --api-base-url callback, AppConfig wiring
        ├── config.py            # AppConfig dataclass + resolve_api_base_url()
        │
        ├── skills/
        │   └── applika-cli/
        │       └── SKILL.md     # Bundled AI skill — installed via `applika skill`
        │
        ├── schemas/             # Vendored Pydantic models (no backend import)
        │   ├── enums.py         # Enum types: Currency (20), SalaryPeriod, OfferPeriod,
        │   │                    #   EventType, InterviewType, FinalizeOutcome, WorkMode, ClearField, etc.
        │   ├── application.py   # ApplicationCreate, ApplicationUpdate, FinalizeOutcomePayload
        │   ├── application_file.py # ApplicationFile — the `applications new|edit --file` payload
        │   ├── application_step.py # ApplicationStepCreate/Update, FinalizeApplication (0.1.4 legacy body)
        │   ├── cv.py            # CVDocument and the seven CV section item models
        │   ├── timeline_event.py   # TimelineEventCreate/Update, TimelineEventEntry
        │   └── supports.py      # SupportSchema — platforms and companies from /supports
        │
        ├── lib/                 # Infrastructure — no Typer dependency
        │   ├── api.py           # ApiClient (httpx + Authorization: Bearer, no cookies), ApiError, AuthError;
        │   │                    #   post() sends no body at all when payload is None;
        │   │                    #   patch_json() and fetch_raw() -> (bytes, headers)
        │   ├── cv_file.py       # --file loading (JSON/YAML/stdin) and local validation
        │   ├── download.py      # --type/--dir/--filename/--force naming rules
        │   ├── session.py       # SessionData, SessionStore (~/.config/applika/session.json)
        │   ├── updater.py       # daily auto update: PyPI check, install detection, gates,
        │   │                    #   update.json + update.lock (~/.config/applika/)
        │   ├── loopback.py      # LoopbackLoginServer for OAuth browser callback
        │   ├── pkce.py          # PKCE verifier, S256 challenge, state
        │   └── device_flow.py   # device code sign-in: start + poll
        │
        ├── utils/               # Pure helpers — no httpx, no Typer
        │   ├── output.py        # render_application_table, render_timeline_event_table,
        │   │                    #   print_application_summary, print_timeline_event_summary
        │   └── cv_output.py     # dump_json/dump_yaml, print_cv_summary, render_cv_table,
        │                        #   render_cv_markdown_table
        │
        └── commands/
            ├── auth.py          # login [--device] [--manual] [--device-name], logout, whoami
            ├── skill.py         # skill command — installs the AI skill
            ├── cv_shared.py     # behaviour shared by `cvs` and `applications cv`
            ├── cvs/             # cvs_app: list/get/create/edit/delete/download
            └── applications/
                ├── __init__.py    # applications_app Typer sub-app: list/new/edit/finalize/reopen,
                │                  #   the deprecated `steps` sub-app, the `timeline` sub-app
                ├── commands.py    # list/new/edit_application, finalize_application (legacy + --outcome),
                │                  #   reopen_application, steps and timeline list/add/edit/delete
                ├── cv.py          # the `applications cv` sub-app commands
                ├── file_input.py  # --file + --job-description plumbing for new/edit
                ├── filter.py      # filter_applications
                └── api_resolve.py # resolve_platform_id, resolve_company_input, resolve_step_id, resolve_feedback_id
```

**Layer rules:**
- `lib/` — HTTP and session logic only. No Typer, no output formatting.
- `utils/` — Pure functions. No side effects, no I/O beyond what the function signature implies.
- `schemas/` — Vendored copies of backend DTOs. Keep in sync manually with `backend/app/application/dto/application.py` and `backend/app/core/enums.py` when the backend changes.
- `commands/` — Typer command functions only. Delegates to `lib/` and `utils/`.

---

## Development

```bash
# Install project + dev dependencies into a local virtualenv
uv sync

# Run the test suite
make test

# Auto-fix lint issues
make lint

# Apply code formatter
make format

# Build a wheel for distribution
uv build

# Install the locally built CLI globally for manual testing
uv tool install --force .
```

Tests live in `tests/` and use `typer.testing.CliRunner` with fake `ApiClient` and `SessionStore` implementations defined in `tests/conftest.py`. No real network calls are made.

---

## License

MIT
