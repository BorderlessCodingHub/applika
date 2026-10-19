# Plan 0017 — CLI self-update and repository layout

PRD: docs/prd/0017-cli-self-update-and-repo-layout.md
ADRs bound:
- 0023 (Accepted 2026-10-19): PyPI JSON = source; install method by marker; gates URL/TTY (auto only)/editable/unknown/
  env; `update.json` 24 h + lock; `--force` lifts env gate only; no beta gate.
- 0009: old CLI routes stay; Non-goal "Forcing users to upgrade the CLI" holds (client-side, opt-out). 0019: `session.json`
  keeps its four keys; updater reads `api_base_url`, never writes. 0018: gate waived, note appended (owner approved).
PRDs neighbouring: 0014 (saved session = third URL source; "Gate nothing" precedent), 0013 (beta rule).

## Scope
Ships: applika-cli daily auto update after a command (silent install, one stderr line), `applika update [--force]`, shared
gates, CLI docs + changelog. Repo: `fixtures/cv-diff` → `backend/tests/fixtures/cv-diff`, `scripts/e2e.sh` →
`frontend/scripts/e2e.sh`, every live reference, CI. Not: backend runtime code, API route, migration, FeatureKey, web UI,
`legacy/`, compose files, version bump (owner), docs/plan, docs/prd, released changelog lines, agent memory.
Two independent slices, either order: A = repo layout (no deploy effect); B = CLI update (reaches users when the owner
publishes: develop → main runs `.github/workflows/cli-cd.yaml` → PyPI). No migration, nothing by hand in prod.
Rollback: A = git revert; B = publish a higher fixed version (clients never downgrade).

## Data
No DB. CLI local files (new): `~/.config/applika/update.json` `{"checked_at": "<ISO-8601 UTC>", "latest_version": str|null}`,
atomic write (pattern `cli/src/applika/lib/session.py` l.33-47), 0o644, no secret. `~/.config/applika/update.lock`:
`os.open(O_CREAT|O_EXCL|O_WRONLY)`; mtime > 600 s → unlink, retry once; held → skip.

## Backend (slice A, no runtime change)
- `git mv fixtures/cv-diff backend/tests/fixtures/cv-diff` (9 JSON + README.md), beside `backend/tests/fixtures/jobs/`.
- `backend/tests/unit/test_cv_diff_fixtures.py` l.25 → `Path(__file__).resolve().parents[1] / 'fixtures' / 'cv-diff'`;
  docstring l.1-6. `test_fixtures_directory_is_not_empty` stays (fails when missing).
- Text only: `backend/app/application/services/cv_diff.py` l.7; `backend/app/scripts/seed_e2e.py` l.4 and
  `backend/CLAUDE.md` l.49 → `frontend/scripts/e2e.sh`. Moved README: l.3 drop ticket key, l.6 suite →
  `cv-diff.fixtures.test.ts`, paths → new folder.
- `backend/CHANGELOG.md` [Unreleased] `### Changed`: one line, fixtures moved; l.307 (older entry) untouched.
  `backend/Dockerfile` copies `migrations`, `alembic.ini`, `app` only → fixtures never ship. No `.dockerignore`.

## CLI (slice B)
Module `cli/src/applika/`. Patterns: `commands/version.py` (PyPI), `lib/session.py` (atomic file), `commands/auth.py` `_transport`.
- `lib/updater.py` (new); env, streams, prefix, distribution, clock, transport, runner injectable:
  - `PYPI_JSON_URL` moved from `commands/version.py` l.7-8 (re-imported, `applika version` output byte-identical);
    `fetch_latest(timeout) -> str` via module `_transport` (httpx), `info.version`.
  - `parse_release(v) -> tuple[int, ...] | None` (`^\d+(\.\d+)*$`). Newer = both parse and latest > installed.
  - `detect_install() -> Install(method, argv, detail)`, method `editable|uv_tool|pipx|pip|unknown`. Order:
    `distribution('applika-cli')` `direct_url.json` `dir_info.editable` or `file:` url → editable;
    `Path(sys.prefix)/'uv-receipt.toml'` + `shutil.which('uv')` → `['uv','tool','upgrade','applika-cli']`;
    `Path(sys.prefix)/'pipx_metadata.json'` + `which('pipx')` → `['pipx','upgrade','applika-cli']`; `INSTALLER` == `pip` →
    `[sys.executable,'-m','pip','install','--upgrade','applika-cli']` (+ `--user` when dist under
    `site.getusersitepackages()`); else unknown. Marker but tool not on PATH → unknown.
  - `blockers(config, install, env, streams, *, auto, force) -> list[Blocker]`, order `URL_OVERRIDDEN`, `NOT_INTERACTIVE`
    (only when `auto`; stdin/stdout/stderr `isatty()`, `CI` unset), `SOURCE_CHECKOUT`, `UNKNOWN_METHOD`, `DISABLED_BY_ENV`
    (non-empty, not `0`/`false`; dropped when `force`). `applika update` passes `auto=False`: no TTY check.
  - `UpdateState.load/save/due(now)`: missing, unreadable, bad JSON or `checked_at` ≥ 24 h ago → due.
  - `install(install, latest, timeout=120) -> InstallResult(ok, code, stderr_tail, kept)`: module `_run` =
    `subprocess.run(argv, capture_output=True, text=True, timeout=…, check=False)`, no shell, no PyPI string in argv;
    verify in a fresh process `[sys.executable,'-I','-c','import importlib.metadata as m; print(m.version("applika-cli"))']`
    (in-process metadata may be stale). Verified ≠ latest → `kept` (pin).
  - `after_command(config)`: body in `try/except (Exception, KeyboardInterrupt): return`. Blockers / not due / lock taken
    → return; save `checked_at` first; `fetch_latest(3)`; save `latest_version`; newer → `install`; ok →
    `typer.echo('Updated applika-cli {old} → {new}', err=True)`; else silent. `→` falls back to `->` if not encodable.
- `config.py`: `ApiBaseUrlSource(str, Enum)` `flag|env|session|default` (Python 3.10);
  `resolve_api_base_url_with_source(explicit_value, explicit_source, store) -> (url, source)`; `resolve_api_base_url`
  keeps its signature (wraps). `is_default_api_base_url(url)`: `rstrip('/')`, lower scheme + host, == default.
  `--api-base-url` has `envvar` → source from `ctx.get_parameter_source('api_base_url')`: `COMMANDLINE` → flag,
  `ENVIRONMENT` → env, else session/default. `AppConfig` + `api_base_url_source` (default `DEFAULT`, test ctors unchanged).
- `commands/update.py` (new): `update(ctx, force: --force)`. Blockers → one stderr line each, exit 1. Lock held → "Another
  applika update is running." exit 1. Save `checked_at`; `fetch_latest(10)`; then results per Contract.
- `app.py`: l.27 `app.command('update')(update)`; `_root` puts source in `AppConfig`; then
  `if ctx.invoked_subcommand != 'update': ctx.call_on_close(lambda: updater.after_command(ctx.obj))`.
- Docs: `cli/README.md` "Updates" section (auto, `applika update`, `--force`, env var, URL rule, manual command per
  installer; editable dev install l.42-45 never updates) + env table row l.622; `cli/CLAUDE.md` command table, env
  vars, package tree. `cli/CHANGELOG.md` [Unreleased] `### Added` ×2, no key. `pyproject.toml` untouched, no new dep.

## Frontend (slice A)
- `git mv scripts/e2e.sh frontend/scripts/e2e.sh` (mode 755 kept). l.19 `ROOT_DIR="$(cd "$(dirname
  "${BASH_SOURCE[0]}")/../.." && pwd)"`; l.3, l.14-16 → `frontend/scripts/e2e.sh`. Rest unchanged.
- `src/components/tailored-cvs/cv-diff.fixtures.test.ts` l.20 → `"../../../../backend/tests/fixtures/cv-diff"`. Drop
  `describe.skipIf(!hasFixtures)` (l.33-35): plain `describe`, first `it` asserts `existsSync(FIXTURES_DIR)` (message
  names the path), then files > 0; read files only when present. Comment l.8-19: backend owns it, missing fails.
- `cv-diff.ts` l.8; `playwright.config.ts` l.6; `e2e/support/auth.ts` l.6, 27, 51, 77 (thrown text: "`frontend/scripts/
  e2e.sh` from the repo root"), 149; `e2e/profile-discord.spec.ts` l.11; `e2e/shell-responsive.spec.ts` l.15.
- `frontend/CLAUDE.md` l.78-80 → `./scripts/e2e.sh …` (from `frontend/`); l.84, 89, 1496, 1498 runner; l.773, 847-850
  fixtures path + "fails when missing". Prettier checks it. Design system: none (no UI).

## Repo root and CI (slice A)
- Root `README.md` l.224; `docker-compose.e2e.yml` comments l.11, l.28 (file stays at root).
- `.github/workflows/frontend-ci.yaml`: drop `"scripts/e2e.sh"` from paths l.22 and l.31 (inside `frontend/**`); comments
  l.3-9, l.160-161; l.185 `run: ./frontend/scripts/e2e.sh` (script cds to root). `backend/**` already triggers vitest.
- `backend-ci.yaml`, `frontend-cd.yaml`: unchanged (`backend/**` now covers fixture edits; today it misses them). Root
  `fixtures/`, `scripts/` gone after the moves (delete if left on disk empty).
- Workspace rule, outside the repo, no applika commit: `/home/luis0ares/projects/applika-upgrade/.claude/rules/
  quality-gates.md` l.32 → `applika/frontend/scripts/e2e.sh`.

## Contract
No HTTP change. CLI surface pinned. `applika update [--force]`: exit 0 = updated or up to date; 1 = anything else.
- No TTY check: runs in CI, a pipe, an AI agent. Refusals, stderr, one per blocker in order:
  - `Cannot update: the API base URL is <url> (from --api-base-url | from APPLIKA_API_BASE_URL | from your saved session),
    not https://applika.dev/api. --force does not change this.` + `Run without --api-base-url.` | `Unset
    APPLIKA_API_BASE_URL.` | `Run applika logout, then applika login without --api-base-url.`
  - `Cannot update: applika-cli runs from a source checkout (<path>). Update it with git.`
  - `Cannot update: can't tell how applika-cli was installed. Upgrade with the tool you used: uv tool upgrade applika-cli,
    pipx upgrade applika-cli, or python -m pip install --upgrade applika-cli.`
  - `Updates are turned off by APPLIKA_DISABLE_AUTOUPDATE. Run applika update --force to update anyway.`
- stdout: `applika-cli <v> is up to date.` · `Updating applika-cli <old> → <new> (<argv>)…` · `Updated applika-cli <old> →
  <new>`. stderr: `Could not reach PyPI: <reason>` · `Cannot compare installed <a> with published <b>.` · `Update failed:
  <argv> exited <code>.` + last 20 stderr lines + `Run it yourself: <argv>` · `<tool> kept applika-cli <old>: your install
  pins that version. Reinstall without the pin to update.`
- Auto mode prints only `Updated applika-cli <old> → <new>` (stderr). Env: `APPLIKA_DISABLE_AUTOUPDATE` (new), `CI` (read).

## Tests
CLI unit, `cli/tests/test_updater.py` + `cli/tests/test_update_command.py` (new):
- `parse_release`/newer: equal, newer, older, `1.2.0rc1`, garbage. `due`: missing, damaged, 23 h, 24 h. Lock: held, stale.
- `detect_install` (tmp prefix, fake distribution): editable, `file:` url, uv receipt with/without `uv`, pipx, pip,
  pip `--user`, `INSTALLER`=uv → unknown.
- `is_default_api_base_url` (slash, case, `http`, other path); source via CliRunner: flag, env, session, default.
- `after_command`: each blocker → no fetch, no run; not due → no fetch; fetch error → silent, `checked_at` saved; newer →
  exact argv, one stderr line, command exit code unchanged (0 and 1); fail / timeout / Ctrl-C → silent; never after `update`.
- `applika update`: every refusal + exit 1, with and without `--force` (URL × 3 sources); env refused without `--force`,
  runs with; non-TTY streams + `CI` set → updates (no refusal); several blockers together; up to date; updated; failed;
  kept; PyPI down; not comparable.
- `cli/tests/conftest.py` autouse next to l.59-69: `updater._transport` refusing `MockTransport`, `updater._run` refusing.
  No test reaches PyPI or spawns an installer. `applika version` tests (`test_commands.py` l.848-890) unchanged.
- Gate: `cd applika/cli && make format && make lint && make test`, + Python 3.10 and `FORCE_COLOR=1`.
Backend `uv run pytest tests/unit/test_cv_diff_fixtures.py` → 10 passed. Frontend `pnpm test src/components/tailored-cvs/
cv-diff.fixtures.test.ts` → 10 run, none skipped; folder renamed → fails. Both full gates (`quality-gates.md`).
E2E: no new spec (no UI). `frontend/scripts/e2e.sh` from repo root and `./scripts/e2e.sh` from `frontend/` → green.
Manual (owner, after the following publish): uv-tool install this version, delete `update.json`, run a command →
"Updated" line; `applika --api-base-url http://127.0.0.1:8000/api update --force` → refusal.

## Rules that bind
- `cli-compatibility.md`: no route touched, old commands unchanged, new capability = new CLI version.
  `changelogs.md`: CLI Added ×2, backend Changed ×1, under [Unreleased]; no key; released lines untouched.
- `quality-gates.md`: all gates; `ty` clean on touched backend files; l.32 updated by slice A. `beta-features.md`: owner
  exception (ADR-0023 "Beta exception", ADR-0018 note), no FeatureKey.
- `branches-and-commits.md`: from `develop`; `chore(repo): move cv-diff fixtures into backend tests`, `chore(repo): move
  e2e runner into frontend`, `feat(cli): add daily auto update and applika update`. No key. `prod-release-runbook.md`:
  no migration; CLI reaches users only via PyPI publish from `main`.

## Risks
- Supply chain: a compromised PyPI release reaches interactive users within 24 h. Opt-out env, fixed argv, publish only
  via `cli-cd.yaml`. A broken release spreads in a day; rollback = higher fixed version.
- Windows: running `applika.exe`/`.pyd` locked → install fails (silent; manual command). PEP 668 Python refuses pip: same.
- An AI agent or script typing `applika update` replaces the CLI mid-session (owner accepted, "Allow it when typed").
- Prompt returns up to 3 s later once a day, longer when a release installs. `call_on_close` runs before Click prints an
  uncaught traceback, so the "Updated" line may come first. Accepted.
- Agent memory and old plans name `scripts/e2e.sh`: stale on purpose, a wrong path fails loudly. `frontend-cd.yaml`
  fires on `frontend/**`: an `e2e.sh` edit on `main` republishes the same image, as e2e spec edits do today.

## Open
1. CLI version (owner): pyproject 1.1.0 unpublished, CHANGELOG has a dated `[1.1.0]`. Rec: owner bumps at release.
2. Windows: `uv tool upgrade`/`pipx upgrade` while the CLI runs? Rec: check before publish; if it fails, keep it silent.
