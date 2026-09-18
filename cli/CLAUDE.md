# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this CLI.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it when the CLI changes in ways that affect how you work here.**

Update when:
- A new command or sub-app is added
- The package structure changes
- A new development command is added or removed
- Packaging or install behavior changes
- A new required environment variable is introduced
- Validation, formatting, or test workflow changes

Do NOT add:
- Implementation details already visible in the code
- Ephemeral task notes or in-progress work
- Anything already obvious from the command help or tests

---

## Commands

```bash
# Install the CLI globally from the local checkout
uv tool install --force .

# Install dev dependencies
uv sync

# Show CLI help
uv run python -m applika.main --help

# Run linter with auto-fix
make lint

# Run formatter
make format

# Run tests
make test

# Build wheel for PyPI
uv build
```

---

## End-of-Task Validation

**Always finish a CLI task by running formatting, linting, and tests.**

Run these at the end of any CLI code change:

```bash
make format
make lint
make test
```

Do not skip this unless the user explicitly asks you not to run validation or the environment prevents it.

---

## Package Structure

All source code lives under `src/applika/` (importable as `applika`).

```
src/applika/
├── main.py              # Entry point: def main() -> None
├── app.py               # Root Typer app + --api-base-url callback → AppConfig
├── config.py            # AppConfig dataclass + resolve_api_base_url
├── skills/
│   └── applika-cli/     # Bundled SKILL.md (included in wheel, symlinked/copied by skill install)
├── schemas/
│   ├── enums.py         # Enum types: Currency (20), SalaryPeriod, OfferPeriod,
│   │                    #   EventType, InterviewType, FinalizeOutcome, ExperienceLevel,
│   │                    #   WorkMode, ApplicationMode, ModeFilter, StatusFilter, OutputFormat, ClearField
│   ├── application.py  # Pydantic models: ApplicationCreate, ApplicationUpdate,
│   │                    #   ApplicationCompany, FinalizeOutcomePayload (vendored from backend DTOs)
│   ├── application_step.py # ApplicationStepCreate/Update, FinalizeApplication (0.1.4 legacy body)
│   ├── timeline_event.py   # TimelineEventCreate/Update, TimelineEventEntry (KODI-013)
│   └── supports.py     # SupportSchema — platforms and companies from /supports
├── lib/
│   ├── api.py           # ApiClient (httpx + cookie auth), ApiError, AuthError,
│   │                    #   require_session, create_session_from_exchange;
│   │                    #   post() sends an optional body (None = no body at all)
│   ├── session.py       # SessionData, SessionStore (~/.config/applika/session.json)
│   └── loopback.py      # LoopbackLoginServer for OAuth callback
├── utils/
│   └── output.py        # render_application_table, render_timeline_event_table,
│                         #   print_application_summary, print_timeline_event_summary, print_finalize_summary
└── commands/
    ├── auth.py          # login + logout + whoami Typer commands
    ├── skill.py         # skill install Typer sub-app
    └── applications/
        ├── __init__.py  # applications_app Typer sub-app: list/new/edit/finalize/reopen,
        │                #   the deprecated `steps` sub-app, the `timeline` sub-app
        ├── commands.py    # list_applications, new_application, edit_application,
        │                  #   finalize_application (legacy + --outcome), reopen_application,
        │                  #   list/add/edit/delete_application_step (deprecated),
        │                  #   list/add/edit/delete_timeline_event
        ├── filter.py      # filter_applications
        └── api_resolve.py # resolve_platform_id, resolve_company_input, resolve_step_id, resolve_feedback_id
```

## Key Patterns

- **Global state**: `AppConfig` (dataclass with `api_base_url` + `store`) lives on `ctx.obj`, set by the root `@app.callback()` in `app.py`.
- **Auth required**: Commands call `require_session(config.store)` → raises `AuthError` if no session.
- **Payload validation**: Pydantic models (one per command family) validate inputs before API calls; commands catch `ValidationError`/`ValueError` and print via `typer.echo(..., err=True)` + `typer.Exit(1)`. New in 0.2.0: commands that hit the timeline/finalize/reopen routes also catch `ApiError` (`_echo_api_error`) and, on a 409 mentioning "closed", append a hint to run `applications reopen`.
- **Schemas are vendored**: everything under `schemas/` is a standalone copy (no backend import). Keep in sync with `backend/app/core/enums.py`, `backend/app/application/dto/application.py` and `backend/app/presentation/schemas/timeline_event.py` when the backend changes.
- **Bodyless POST**: `ApiClient.post(path, payload=None)` sends no body at all when `payload` is `None` (not even `{}`) — used by the idempotent finalize close and `applications reopen`.
- **Deprecated, not removed**: `applications steps *` and `applications finalize --step/--feedback/--salary-offer` still work exactly as in 0.1.4 (`.claude/rules/cli-compatibility.md`); only their `--help` text says deprecated. Typer's own `deprecated=True` is deliberately **not** used on them — it prints a `DeprecationWarning` to stderr on every invocation, which corrupts `--output-format json` output under `CliRunner`'s default stderr mixing.

## CLI Commands

| Command | Description |
|---|---|
| `applika login` | GitHub OAuth login (opens browser) |
| `applika logout` | Log out and clear session |
| `applika whoami` | Show the currently authenticated user |
| `applika applications list` | List applications (filterable) |
| `applika applications new` | Create a new application |
| `applika applications edit <id>` | Edit an existing application |
| `applika applications timeline list/add/edit/delete` | Manage an application's timeline (notes, typed interviews, offer/denied) |
| `applika applications finalize [--outcome offer\|denied]` | Close an application (bodyless = idempotent, no outcome); deprecated `--step`/`--feedback`/`--salary-offer` still work |
| `applika applications reopen` | Reopen a closed application (idempotent) |
| `applika applications steps list/add/edit/delete` | Deprecated — use `applications timeline` |
| `applika skill install` | Install the AI skill (symlink/copy) for Claude, Gemini, or Codex |

## Environment Variables

- `APPLIKA_API_BASE_URL`: Override the default API URL (`https://applika.dev/api`)
