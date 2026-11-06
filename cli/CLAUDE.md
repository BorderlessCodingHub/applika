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
├── config.py            # AppConfig dataclass + resolve_api_base_url;
│                        #   ApiBaseUrlSource (flag/env/session/default) via
│                        #   resolve_api_base_url_with_source
├── skills/
│   └── applika-cli/     # Bundled SKILL.md (included in wheel, symlinked/copied by skill install)
├── schemas/
│   ├── enums.py         # Enum types: Currency (20), SalaryPeriod, OfferPeriod,
│   │                    #   EventType, InterviewType, FinalizeOutcome, ExperienceLevel,
│   │                    #   WorkMode, ApplicationMode, ModeFilter, StatusFilter, OutputFormat, ClearField,
│   │                    #   CvListOutput, CvOutput, DownloadType (KODI-018)
│   ├── application.py  # Pydantic models: ApplicationCreate, ApplicationUpdate,
│   │                    #   ApplicationCompany, FinalizeOutcomePayload (vendored from backend DTOs)
│   ├── application_file.py # ApplicationFile — the `applications new|edit --file` payload,
│   │                    #   plus APPLICATION_READ_ONLY_KEYS / APPLICATION_REQUIRED_FIELDS (KODI-018)
│   ├── application_step.py # ApplicationStepCreate/Update, FinalizeApplication (0.1.4 legacy body)
│   ├── cv.py            # CVDocument + the seven section item models, READ_ONLY_KEYS,
│   │                    #   DOCUMENT_KEYS, SECTION_KEYS, assign_item_ids (KODI-018)
│   ├── timeline_event.py   # TimelineEventCreate/Update, TimelineEventEntry (KODI-013)
│   └── supports.py     # SupportSchema — platforms and companies from /supports
├── lib/
│   ├── api.py           # ApiClient (httpx + `Authorization: Bearer`, no cookies,
│   │                    #   UA applika-cli/<version> (<OS>)), ApiError, AuthError,
│   │                    #   require_session, open_client, session_from_token,
│   │                    #   create_session_from_exchange (legacy shape);
│   │                    #   refresh = POST /auth/token refresh_token grant;
│   │                    #   logout() = POST /auth/revoke (KODI-060);
│   │                    #   post() sends an optional body (None = no body at all);
│   │                    #   patch_json() and fetch_raw() -> (bytes, headers) (KODI-018)
│   ├── cv_file.py       # --file loading (JSON/YAML/stdin), local validation,
│   │                    #   FileInputError, USAGE_EXIT_CODE (KODI-018)
│   ├── download.py      # --type/--dir/--filename/--force naming rules,
│   │                    #   Content-Disposition parsing (KODI-018)
│   ├── session.py       # SessionData, SessionStore (~/.config/applika/session.json)
│   ├── updater.py       # daily auto update: PyPI read, detect_install, blockers,
│   │                    #   install (+ fresh-interpreter verify), after_command,
│   │                    #   update.json + update.lock; never imports commands/
│   ├── loopback.py      # LoopbackLoginServer for OAuth callback
│   ├── pkce.py          # PKCE verifier, S256 challenge, state (KODI-060)
│   └── device_flow.py   # RFC 8628 device code: start + poll (KODI-060)
├── utils/
│   ├── output.py        # render_application_table, render_timeline_event_table,
│   │                     #   print_application_summary, print_timeline_event_summary, print_finalize_summary
│   └── cv_output.py     # dump_json/dump_yaml, print_cv_summary, render_cv_table,
│                         #   render_cv_markdown_table (KODI-018)
└── commands/
    ├── auth.py          # login [--device] [--manual] [--device-name] + logout
    │                    #   + whoami Typer commands (KODI-060)
    ├── skill.py         # skill install Typer sub-app
    ├── update.py        # applika update [--force]: blockers as stderr lines,
    │                    #   PyPI check now, install with the detected tool
    ├── cv_shared.py     # behaviour shared by `cvs` and `applications cv`:
    │                    #   load_document, merge_document, emit_cv, download_document,
    │                    #   usage_error (exit 2) / api_error (exit 1) (KODI-018)
    ├── cvs/
    │   ├── __init__.py  # cvs_app Typer sub-app: list/get/create/edit/delete/download
    │   └── commands.py  # the master CV commands (KODI-018)
    └── applications/
        ├── __init__.py  # applications_app Typer sub-app: list/new/edit/finalize/reopen,
        │                #   the deprecated `steps` sub-app, the `timeline` sub-app,
        │                #   the `cv` sub-app (KODI-018)
        ├── commands.py    # list_applications, new_application, edit_application,
        │                  #   finalize_application (legacy + --outcome), reopen_application,
        │                  #   list/add/edit/delete_application_step (deprecated),
        │                  #   list/add/edit/delete_timeline_event
        ├── cv.py          # get/create/edit/delete/download/diff_application_cv (KODI-018)
        ├── file_input.py  # --file + --job-description plumbing for new/edit (KODI-018)
        ├── filter.py      # filter_applications
        └── api_resolve.py # resolve_platform_id, resolve_company_input, resolve_step_id, resolve_feedback_id
```

## Key Patterns

- **Global state**: `AppConfig` (dataclass with `api_base_url`, `store` and `api_base_url_source`) lives on `ctx.obj`, set by the root `@app.callback()` in `app.py`. The source comes from `ctx.get_parameter_source('api_base_url')` (flag or env; compared by enum name, never by importing `click`: newer Typer vendors its own Click and does not install it), else the saved session, else the default.
- **Auth required**: Commands call `require_session(config.store)` → raises `AuthError` if no session.
- **Payload validation**: Pydantic models (one per command family) validate inputs before API calls; commands catch `ValidationError`/`ValueError` and print via `typer.echo(..., err=True)` + `typer.Exit(1)`. New in 0.2.0: commands that hit the timeline/finalize/reopen routes also catch `ApiError` (`_echo_api_error`) and, on a 409 mentioning "closed", append a hint to run `applications reopen`.
- **Schemas are vendored**: everything under `schemas/` is a standalone copy (no backend import). Keep in sync with `backend/app/core/enums.py`, `backend/app/application/dto/application.py` and `backend/app/presentation/schemas/timeline_event.py` when the backend changes.
- **Bodyless POST**: `ApiClient.post(path, payload=None)` sends no body at all when `payload` is `None` (not even `{}`) — used by the idempotent finalize close and `applications reopen`.
- **`--file` is validated locally first**: `lib/cv_file.py` loads JSON/YAML
  (extension-driven, `-` = stdin) and validates against the vendored models
  before any request. A failure there is `FileInputError` → exit code **2**
  (nothing was sent); an `ApiError` prints the API's `detail` → exit code
  **1**. Keep that split: the spec (`docs/plan/0007-cli-cv-commands.md`)
  pins both codes.
- **Read-only keys are accepted and ignored on input**: `id`, `created_at`,
  `updated_at` and the CV copy's provenance (`application_id`, `base_cv_id`,
  `was_ai_generated`, `adjustments`, `base_snapshot`) are stripped by
  `--file`, so `get --output json|yaml` round-trips back into `edit --file`.
  Any *other* unknown key is still an error.
- **`--output md` is the server's Markdown**: on `get`/`create`/`edit` it is a
  second call to `GET .../markdown`, never a client-side rendering. Only
  `cvs list --output md` renders locally (a Markdown table).
- **`job_description` is sticky on the API's PUT**: `applications edit` only
  puts the key on the wire when `--job-description`, `--job-description-file`
  or a `job_description` key in `--file` asked for it. `--job-description ""`
  sends `null` (clears it).
- **Sessions fail closed (KODI-060)**: a 429 or 503 on the refresh, a 503 on
  any route, and a 429/503/network error on `logout` keep `session.json`; any
  other refused refresh clears it. The file keeps its four keys so older CLI
  versions can read it. Tests never reach the network: `auth._transport` is a
  refusing `httpx.MockTransport` by default (`tests/conftest.py`), and
  `device_flow.poll` takes `sleep`/`monotonic`.
- **Daily auto update**: `app.py` `_root` registers `updater.after_command(ctx.obj)`
  with `ctx.call_on_close` after building `AppConfig` (`--version` and bare
  `applika` exit before it; `applika update` never registers it). It
  swallows every error and Ctrl-C, writes only
  `Updated applika-cli <old> → <new>` on stderr, and reads env, streams,
  clock, distribution, prefix, `which` and user site through module seams
  in `lib/updater.py`. Tests never reach PyPI, spawn an installer or touch
  `~/.config/applika/`: the autouse `updater_guard` (`tests/conftest.py`)
  refuses and records `_transport`/`_run`, points `_state_dir` at `tmp_path`,
  and gives `_env`/`_streams` an empty env and non-TTY streams; a test that
  drives the update patches those seams itself.
- **`applika update`** (`commands/update.py`) reuses the same seams through
  `updater.` attribute lookups (so tests patch them in one place): no terminal
  check (`blockers(..., auto=False)`), one stderr line per blocker, `--force`
  lifts only `APPLIKA_DISABLE_AUTOUPDATE`. It tells a pin (the verify reads a
  parseable release other than the latest) from a failed verify (unparseable
  output, non-zero exit, timeout): only the first is "kept". No session, no
  `ApiClient`.
- **Deprecated, not removed**: `applications steps *` and `applications finalize --step/--feedback/--salary-offer` still work exactly as in 0.1.4 (`.claude/rules/cli-compatibility.md`); only their `--help` text says deprecated. Typer's own `deprecated=True` is deliberately **not** used on them — it prints a `DeprecationWarning` to stderr on every invocation, which corrupts `--output-format json` output under `CliRunner`'s default stderr mixing.

## CLI Commands

| Command | Description |
|---|---|
| `applika login [--device] [--manual] [--device-name TEXT]` | Borderless sign-in (on applika's sign-in page) with a session of the CLI's own: PKCE + local callback (default), paste `code#state` (`--manual`), device code (`--device`) |
| `applika logout` | End the session on the server (`POST /auth/revoke`), then clear it locally |
| `applika whoami` | Show the currently authenticated user |
| `applika applications list` | List applications (filterable) |
| `applika applications new` | Create a new application |
| `applika applications edit <id>` | Edit an existing application (named options, or `--file`; `--job-description`/`--job-description-file`) |
| `applika applications timeline list/add/edit/delete` | Manage an application's timeline (typed interviews, offer, denied); `add --type offer\|denied` closes the application unless `--keep-open` |
| `applika applications finalize [--outcome offer\|denied]` | Close an application (bodyless = idempotent, no outcome); deprecated `--step`/`--feedback`/`--salary-offer` still work |
| `applika applications reopen` | Reopen a closed application (idempotent) |
| `applika applications steps list/add/edit/delete` | Deprecated — use `applications timeline` |
| `applika applications cv get/create/edit/delete/download/diff <id>` | Manage an application's CV copy (`--from`, `--file`, `--name`, `--output`, `--type`, `--dir`, `--filename`, `--force`, `--print`) |
| `applika cvs list/get/create/edit/delete/download` | Manage master CVs (max 3): `--file`, `--name`, `--output`, `--type pdf\|md`, `--dir`, `--filename`, `--force` |
| `applika update [--force]` | Check PyPI now and install the latest version with the detected tool, or list every reason it refuses (`--force` lifts only `APPLIKA_DISABLE_AUTOUPDATE`) |
| `applika skill install` | Install the AI skill (symlink/copy) for Claude, Gemini, or Codex |

## Environment Variables

- `APPLIKA_API_BASE_URL`: Override the default API URL (`https://applika.dev/api`)
- `APPLIKA_DISABLE_AUTOUPDATE`: any value except empty, `0` or `false` turns the daily auto update off
- `CI` (read): set = not interactive, so the daily auto update stays off
