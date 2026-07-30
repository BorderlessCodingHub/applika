# applika-cli

Command-line interface for [Applika.dev](https://applika.dev) — a structured job application tracker designed for active job seekers who want full control over their data without relying on a browser.

Track every application you send, filter and review your pipeline from the terminal, and keep your AI coding assistant (Claude Code, Gemini, Codex) aware of the CLI through a bundled skill file.

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

The CLI authenticates via GitHub OAuth. On `applika login`, your browser opens to GitHub's authorization page. Once you authorize, the callback is captured locally on a loopback port and the session (access + refresh tokens) is saved to `~/.config/applika/session.json`. The session refreshes automatically on expiry — you only need to log in once per device.

```bash
# Open browser and complete GitHub OAuth
applika login

# Verify the active session without making any other API call
applika whoami
# → Logged in as: username=luissoares  name=Luis Soares  email=luis@example.com

# Revoke the session server-side and clear local storage
applika logout
```

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
  --platform "Email" \
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
| `--platform TEXT` | Platform where you found or were contacted about the role (e.g. `LinkedIn`, `Indeed`, `Email`) |
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
| `--currency` | `USD` · `BRL` · `EUR` · `GBP` · `CAD` · `AUD` · `JPY` · `CHF` · `INR` |
| `--salary-period` | `hourly` · `monthly` · `annual` |

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
  --salary-period annual

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

```bash
applika applications steps delete 42 500
```

---

### `applika applications finalize <application-id>`

Finalizes an application by recording a strict final step plus a feedback
definition. This is the CLI path for outcomes like rejected, denied, accepted,
or offer, depending on the backend definitions available in `/supports`.

```bash
# Finalize as rejected
applika applications finalize 42 \
  --step "Denied" \
  --feedback "Rejected" \
  --date 2026-05-18 \
  --observation "Closed after take-home"

# JSON output for scripting
applika applications finalize 42 \
  --step "Denied" \
  --feedback "Rejected" \
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

## Global options

These flags apply to every command and are passed before the subcommand name:

```bash
applika --api-base-url https://staging.applika.dev/api applications list
```

| Flag | Default | Env variable |
|---|---|---|
| `--api-base-url TEXT` | `https://applika.dev/api` | `APPLIKA_API_BASE_URL` |

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
        │   ├── enums.py         # Enum types: Currency, SalaryPeriod, WorkMode, ClearField, etc.
        │   ├── application.py   # ApplicationCreate, ApplicationUpdate with validators
        │   └── supports.py      # SupportSchema — platforms and companies from /supports
        │
        ├── lib/                 # Infrastructure — no Typer dependency
        │   ├── api.py           # ApiClient (httpx + cookie auth), ApiError, AuthError
        │   ├── session.py       # SessionData, SessionStore (~/.config/applika/session.json)
        │   └── loopback.py      # LoopbackLoginServer for OAuth browser callback
        │
        ├── utils/               # Pure helpers — no httpx, no Typer
        │   └── output.py        # render_application_table, print_application_summary
        │
        └── commands/
            ├── auth.py          # login, logout, whoami commands
            ├── skill.py         # skill command — installs the AI skill
            └── applications/
                ├── __init__.py    # applications_app Typer sub-app, default-to-list callback
                ├── commands.py    # list_applications, new_application, edit_application
                ├── filter.py      # filter_applications
                └── api_resolve.py # resolve_platform_id, resolve_company_input
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
