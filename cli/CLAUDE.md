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
│   ├── enums.py         # StrEnum types: Currency, SalaryPeriod, ExperienceLevel,
│   │                    #   WorkMode, ApplicationMode, ModeFilter, StatusFilter, OutputFormat, ClearField
│   ├── application.py  # Pydantic models: ApplicationCreate, ApplicationUpdate,
│   │                    #   ApplicationCompany (vendored from backend DTOs)
│   └── supports.py     # SupportSchema — platforms and companies from /supports
├── lib/
│   ├── api.py           # ApiClient (httpx + cookie auth), ApiError, AuthError,
│   │                    #   require_session, create_session_from_exchange
│   ├── session.py       # SessionData, SessionStore (~/.config/applika/session.json)
│   └── loopback.py      # LoopbackLoginServer for OAuth callback
├── utils/
│   └── output.py        # render_application_table, print_application_summary
└── commands/
    ├── auth.py          # login + logout + whoami Typer commands
    ├── skill.py         # skill install Typer sub-app
    └── applications/
        ├── __init__.py  # applications_app Typer sub-app with default-to-list callback
        ├── commands.py    # list_applications, new_application, edit_application
        ├── filter.py      # filter_applications
        └── api_resolve.py # resolve_platform_id, resolve_company_input
```

## Key Patterns

- **Global state**: `AppConfig` (dataclass with `api_base_url` + `store`) lives on `ctx.obj`, set by the root `@app.callback()` in `app.py`.
- **Auth required**: Commands call `require_session(config.store)` → raises `AuthError` if no session.
- **Payload validation**: `ApplicationCreate`/`ApplicationUpdate` Pydantic models validate inputs before API calls in `new_application` and `edit_application`.
- **Schemas are vendored**: `schemas/enums.py` and `schemas/application.py` are standalone copies (no backend import). Keep in sync with `backend/app/core/enums.py` and `backend/app/application/dto/application.py` when the backend changes.

## CLI Commands

| Command | Description |
|---|---|
| `applika login` | GitHub OAuth login (opens browser) |
| `applika logout` | Log out and clear session |
| `applika whoami` | Show the currently authenticated user |
| `applika applications list` | List applications (filterable) |
| `applika applications new` | Create a new application |
| `applika applications edit <id>` | Edit an existing application |
| `applika skill install` | Install the AI skill (symlink/copy) for Claude, Gemini, or Codex |

## Environment Variables

- `APPLIKA_API_BASE_URL`: Override the default API URL (`https://applika.dev/api`)
