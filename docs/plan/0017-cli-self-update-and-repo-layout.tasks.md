# Tasks 0017 — CLI self-update and repository layout

PRD: docs/prd/0017-cli-self-update-and-repo-layout.md   Plan: docs/plan/0017-cli-self-update-and-repo-layout.md
ADRs bound: 0023 (drafted by this feature, Accepted 2026-10-19); 0018 (note 2026-10-19, owner beta exception); 0009 (Accepted; Non-goal "Forcing users to upgrade the CLI" holds). Checked 2026-10-19.

## Order
K1 = KODI-072 cli: updater foundation → K2 = KODI-073 cli: daily auto update → K3 = KODI-074 cli: applika update → K4 = KODI-075 repo layout → K5 = KODI-076 closing

- **Slices.** K1..K5, built in that order, one after another, on one branch.
- **Cap.** Owner: 5 tickets, closing included. Set is 5.
- **Foundation.** Plan `## Data` is not none: CLI local files `update.json` + `update.lock`. K1 = that record, its lock, and the pure pieces both update paths read (PyPI read, version compare). No command (foundation rule: no route). No DB, no migration.
- **Stories.** Priority order kept (P1 → P2 → P3). K2 [US1] + the auto halves of US3, US4, US5. K3 [US2] + the command halves of US3, US4, US5. K4 [US6]. US3/US4/US5 get no ticket of their own: each is half auto (K2), half command (K3), and the cap allows no more.
- **Sides.** K1..K3 cli only. K4 both sides in one ticket: the frontend fixture test cannot run without the backend folder at its new place, and the runner move and the CI line must land together or the CI `e2e` job breaks.
- **deps (code):** K1 none; K2 = K1; K3 = K2 (`detect_install`, `blockers`, `install`); K4 = K1 (branch only, no code dependency); K5 = K3 + K4.
- **Branch (owner).** One branch, `integration/0017-cli-self-update-and-repo-layout`, cut from local `develop` by K1 T001; the 0017 docs ride along and are committed first. Every ticket starts with `--no-branch`. K1..K5 land on it one after another. No ticket tip is a merge point.
- **AC.** PRD requirement sentence verbatim, `R-nnn` prefix dropped (house precedent). Rule, edge-case, assumption and success-signal ACs carry their source. A ticket carrying one half of a requirement says so on its covers line.
- **No beta gate (owner exception).** "No gate, an exception": no `FeatureKey`, no seed row, no route, no API call (ADR-0023 "Beta exception"; ADR-0018 note 2026-10-19). Not a `.claude/rules/beta-features.md` breach.
- **No ticket keys** in code, docs, commits or changelogs. This file carries K-labels only.

### Release (one; no Release A/B)
- One release, every ticket. No migration, no backend runtime change, nothing by hand in prod (`.claude/rules/prod-release-runbook.md` 4 has nothing to split). Tag `0017-release` (annotated, local) on the K5 tip (Plan corrections 15).
- Owner merges the branch into `develop` (`--no-ff`). `develop` → `main` is the owner's release:
  - `backend-cd.yaml` and `frontend-cd.yaml` both republish (K4 touches `backend/**` and `frontend/**`); no runtime change (Plan corrections 14);
  - `cli-cd.yaml` publishes `cli/pyproject.toml`'s version; the owner numbers it (plan `## Open` 1). The update reaches users only through that publish, and only users who install that version by hand first (ADR-0023 Consequences).
- Owner before the publish: Windows (plan `## Open` 2), `uv tool upgrade` / `pipx upgrade` while `applika.exe` runs. Flagged, not tested here.
- Rollback: repo layout = `git revert`; CLI = publish a higher fixed version (clients never downgrade); a user opts out with `APPLIKA_DISABLE_AUTOUPDATE=1`. Nothing in the database.
- Build never waits for prod. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`, never pushes, never publishes to PyPI.

### Plan corrections (checked against the code, 2026-10-19)
1. **Uncommitted docs on `develop`.** PRD 0017, plan 0017, this tasks file, ADR-0023, ADR-0018's 2026-10-19 note, `.claude/agent-memory/` (never `.claude/agent-memory-local/`). K1 T001 commits them alone, first, on the integration branch.
2. **Base.** The plan's line numbers were read on a `develop` that carries 0016 (`cli/CHANGELOG.md` `[Unreleased]` names `--keep-open`; `frontend/CLAUDE.md` describes close mode). K1 T001 checks it.
3. **Ticket keys in files K4 rewrites.** `backend/tests/unit/test_cv_diff_fixtures.py` l.3 ("KODI-017 T091 (R-024/R-025)"), fixtures `README.md` l.3, `cv-diff.fixtures.test.ts` l.10 ("KODI-017 part 3") and l.14 ("T091"). The rewritten docstring, README line and comment carry none. `scripts/e2e.sh` l.74 (`# KODI-057: …`) stays: the plan keeps the runner unchanged past l.3, l.14-16, l.19, so git records a rename.
4. **Wrong suite name.** `test_cv_diff_fixtures.py` l.11 and fixtures `README.md` l.6 name `cv-diff.test.ts`; the suite that reads the folder is `cv-diff.fixtures.test.ts`. Plan fixes the README only; K4 fixes both.
5. **Import cycle.** `commands/version.py` will import `PYPI_JSON_URL` from `lib/updater.py`, so `lib/updater.py` never imports `applika.commands.version`: it owns `PACKAGE_NAME` and reads the installed version itself (`importlib.metadata`). `installed_version()` stays in `version.py`: `app.py` l.11 imports it, `test_commands.py` l.849, l.858, l.880 patch it there.
6. **State folder.** `FakeStore` (`cli/tests/conftest.py` l.81-90) has no `path`, and most command tests swap `cli_app.SessionStore` for it. The updater's folder is a module seam `_state_dir()` = `Path.home() / '.config' / 'applika'` (the folder of `session.json`, `lib/session.py` l.20-22), never `config.store.path`. The conftest points it at `tmp_path`, or `applika update` tests write the developer's real `~/.config/applika/update.json`.
7. **Guards must fail, not only refuse.** `after_command` swallows every exception, so a refusing `_transport` / `_run` raising `AssertionError` inside it is swallowed too and the test passes. The autouse guards record each call; the fixture fails the test at teardown on a guarded call the test did not install itself.
8. **CI env.** `cli-ci.yaml` runs pytest on GitHub Actions: `CI=true`, no TTY. Tests never read the real `CI` or streams: they patch the updater's env and stream seams. The gate adds `CI=true uv run pytest`.
9. **Version compare pads.** ADR-0023 compares numeric release parts only; a plain tuple compare calls `1.2.0` newer than `1.2`. Pad with zeros: `1.2` = `1.2.0`.
10. **Local non-editable install.** `uv tool install --force .` (cli/README.md l.714, cli/CLAUDE.md Commands) leaves a `file:` URL in `direct_url.json`: a source checkout, never updated. README's Updates section says so beside the editable install (l.42-45).
11. **Refusal lines.** Contract: one stderr line per blocker; the URL reason "+" its way back. K3 prints the way back on the same line, after the reason: line count = blocker count (R-016).
12. **Install timeout text.** Contract has `Update failed: <argv> exited <code>.`; a timeout has no exit code. K3: `Update failed: <argv> timed out after 120 s.` + `Run it yourself: <argv>`, exit 1. Owner may reword.
13. **ty on touched backend files.** `cv_diff.py` and `seed_e2e.py` get docstring edits only but count as changed: `.claude/rules/quality-gates.md` wants them clean. K4 checks; a pre-existing diagnostic goes to the owner, never a drive-by fix.
14. **CD and images.** K4 touches `backend/**` and `frontend/**`: `backend-cd.yaml` and `frontend-cd.yaml` both fire on `main` (plan `## Risks` names frontend only). `frontend/docker/Dockerfile` builder `COPY . .` sees `scripts/e2e.sh`; the nginx stage copies `/app/out` only: it never ships. `backend/Dockerfile` copies `migrations`, `alembic.ini`, `app`: fixtures never ship.
15. **Tag.** One release → one annotated tag, `0017-release`, on the K5 tip. The plan names none.
16. **Backend changelog.** `backend/CHANGELOG.md` has only `## [Unreleased]`, no released heading. l.307 is an older entry (`.claude/rules/changelogs.md` 5): untouched. The move is a new first line under `### Changed` (l.335).
17. **CLI version.** `cli/pyproject.toml` 1.1.0, never published; `cli/CHANGELOG.md` has a dated `## [1.1.0] - 2026-10-15` and an `## [Unreleased]` with 0016's lines. K2/K3 lines join `[Unreleased]`. No bump (plan `## Open` 1).
18. **SKILL.md.** Plan leaves `cli/src/applika/skills/applika-cli/SKILL.md` alone: the bundled agent skill does not teach `applika update`. Kept.

## K1 — applika-cli updater foundation: update record, lock, PyPI read, version compare, test guards   side: cli   covers: — (foundation)   deps: —
Goal: `cli/src/applika/lib/updater.py` (new) holds what both update paths share: the `update.json` record (load, atomic save, due), `update.lock`, the PyPI read (`PYPI_JSON_URL` moved out of `commands/version.py`), the numeric version compare, and the seams `_transport`, `_run`, `_state_dir`. Conftest guards: no test reaches PyPI, spawns an installer or touches `~/.config/applika/`. No command, no hook, no install. `applika version` byte-identical.
Owner's words: "add a daily auto update to the cli and a command "applika update" to update the cli to the latest version automatically, same how claude cli does, if the api base url have been overriden, the auto update must be disabled and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the operation."
Assumptions: "Once a day" means 24 hours since the last check started, whether it succeeded or not. The update record lives next to the saved session, in the CLI's own config folder.
Covers: — (foundation)
Release: one. Plan: `## Data`, `## CLI` (`lib/updater.py`), `## Tests`. Tasks: Plan corrections 1, 2, 5, 6, 7, 8, 9.
Touch:
- docs/prd/0017-cli-self-update-and-repo-layout.md, docs/plan/0017-cli-self-update-and-repo-layout.md, docs/plan/0017-cli-self-update-and-repo-layout.tasks.md, docs/adr/0023-cli-self-update-from-pypi.md, docs/adr/0018-beta-features-registry-and-allowlist.md, .claude/agent-memory/ (T001 commit only, content unchanged)
- cli/src/applika/lib/updater.py (new)
- cli/src/applika/commands/version.py
- cli/tests/conftest.py
- cli/tests/test_updater.py (new)
Pattern:
- cli/src/applika/commands/version.py (PyPI JSON read, `info.version`)
- cli/src/applika/lib/session.py l.33-47 (atomic write)
- cli/src/applika/commands/auth.py l.35 `_transport` + cli/tests/conftest.py l.59-69 (refusing `MockTransport`)
Contract: none (no command).
Steps:
- T001 [US1] Base, branch, docs commit:
  - `git -C applika branch --show-current` → `develop`; `git -C applika show develop:cli/CHANGELOG.md | grep -q -- --keep-open` → yes (0016 in, Plan corrections 2). Else stop, ask the owner;
  - `git -C applika status --porcelain` → only the Plan corrections 1 set. Anything else → stop, ask the owner;
  - `git switch -c integration/0017-cli-self-update-and-repo-layout develop` (the uncommitted files ride along);
  - commit that set alone: `docs(plan): cli self-update and repository layout`.
- T002 [US1] cli/src/applika/lib/updater.py (new), PyPI and versions:
  - `PACKAGE_NAME = 'applika-cli'`; `PYPI_JSON_URL = f'https://pypi.org/pypi/{PACKAGE_NAME}/json'` (moved from commands/version.py l.7-8);
  - `installed_version()` via `importlib.metadata`, `'unknown'` when missing. Never import `applika.commands.version` (Plan corrections 5);
  - `_transport: httpx.BaseTransport | None = None`; `fetch_latest(timeout) -> str`: `httpx.Client(transport=_transport, timeout=timeout)`, GET `PYPI_JSON_URL`, `raise_for_status()`, `['info']['version']`; raises on HTTP, JSON or key error (callers decide);
  - `parse_release(v) -> tuple[int, ...] | None` (`^\d+(\.\d+)*$`); `is_newer(latest, installed) -> bool | None`: `None` when either does not parse; zero-padded, `1.2` = `1.2.0` (Plan corrections 9);
  - `_run(argv, timeout)` = `subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)`, no shell. Defined here so the guard has a seam; K2 uses it.
- T003 [US1] cli/src/applika/lib/updater.py, record and lock:
  - `_state_dir() -> Path` = `Path.home() / '.config' / 'applika'`; never `config.store.path` (Plan corrections 6);
  - `UpdateState(checked_at, latest_version)`: `load()` → missing, unreadable, bad JSON or bad `checked_at` = never checked; `save()` atomic (pattern session.py l.33-47), mode `0o644`, `{"checked_at": "<ISO-8601 UTC>", "latest_version": str|null}`, no secret; `due(now)` → never checked, or `now - checked_at >= 24 h`;
  - lock `update.lock`: `os.open(path, O_CREAT|O_EXCL|O_WRONLY)`; exists with mtime > 600 s → unlink, retry once; held → not acquired; release unlinks it (context manager).
- T004 [P] [US1] cli/src/applika/commands/version.py:
  - import `PYPI_JSON_URL` from `applika.lib.updater`;
  - `installed_version()` and `httpx.get(…, timeout=10)` stay here;
  - `applika version` output byte-identical; test_commands.py l.848-892 untouched and green.
- T005 [P] [US1] cli/tests/conftest.py, autouse beside `_no_network_from_auth_commands` (l.59-69):
  - `updater._transport` → recording, refusing `httpx.MockTransport`; `updater._run` → recording refuser;
  - `updater._state_dir` → `tmp_path`;
  - teardown fails the test on any guarded call the test did not install itself (Plan corrections 7).
- T006 [P] [US1] cli/tests/test_updater.py (new):
  - `parse_release` / `is_newer`: equal, `1.2` vs `1.2.0`, newer, older, `1.2.0rc1`, garbage, `'unknown'`;
  - `fetch_latest`: 200, 500, bad JSON, no `info.version`, `ConnectError`; exact URL; timeout passed;
  - `UpdateState`: missing, damaged, unreadable (skip as root / on Windows) → due; 23 h → not due; 24 h → due; save atomic, `0o644`, both keys;
  - lock: free → acquired; fresh held → not acquired; stale (601 s) → acquired; released → gone;
  - the guard fails a test whose code fetches without its own transport.
- T007 [US1] Gate, close:
  - `cd cli && make format && make lint && make test`;
  - `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest`, `CI=true uv run pytest`, `uv run --python 3.10 pytest` → 0 failed each;
  - no file under `~/.config/applika/` written by the runs;
  - commits conventional, no ticket key (e.g. `feat(cli): add update record and PyPI read`); not a merge point.
AC:
- The update record on disk is missing, unreadable or damaged: the CLI treats it as never checked. (PRD 0017 Edge cases)
- The installed version is newer than PyPI's, as with a local build: it counts as up to date. (PRD 0017 Edge cases)
- Two terminals finish a command at the same moment: one updates, the other skips. (PRD 0017 Edge cases)
- "Once a day" means 24 hours since the last check started, whether it succeeded or not. (PRD 0017 Assumptions)
- No CLI test triggers an install, and no CI job or AI agent run installs anything unless it runs `applika update`. (PRD 0017 Success signals)
- Commit messages are conventional commits **without** a ticket key: `feat(cv): add base CV table`. The board is local and the repo is moving to a new remote, so nothing in git history points at a ticket. (.claude/rules/branches-and-commits.md 2)

## K2 — applika-cli daily auto update after a command: install detection, five gates, silent install   side: cli   covers: R-001, R-002, R-003, R-004, R-006, R-007, R-008, R-009, R-010, R-019 (auto half)   deps: K1
Goal: After any command, signed in or out, at most once a day and only when no gate blocks: check PyPI (3 s), install a newer release with the tool the CLI came from (120 s), print `Updated applika-cli <old> → <new>` on stderr. Every failure silent, Ctrl-C included; the command's output and exit status never change. No Applika API call.
Owner's words: "add a daily auto update to the cli and a command "applika update" to update the cli to the latest version automatically, same how claude cli does, if the api base url have been overriden, the auto update must be disabled and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the operation."
Clarified: "Install silently (Recommended)": "Like Claude Code: at most once a day, after a command finishes, it checks PyPI and installs the newer version with the same tool it was installed with (uv tool, pipx or pip). It prints one line, "Updated applika-cli 1.1.0 → 1.2.0". The next run uses it. Costs: an install can fail (no network, permissions), which must never break the user's command." "Any non-default URL (Recommended)". "Env var + safe skips (Recommended)". "No gate, an exception (Recommended)".
Covers: R-001, R-002, R-003, R-004, R-006, R-007, R-008, R-009, R-010, R-019 (auto half)
Release: one (ships in the next applika-cli publish). Plan: `## CLI`, `## Contract` (auto mode), `## Tests`. Tasks: Plan corrections 6, 7, 8, 10, 17.
Touch:
- cli/src/applika/lib/updater.py
- cli/src/applika/config.py (`is_default_api_base_url`)
- cli/src/applika/app.py (`_root` l.58-63)
- cli/tests/test_updater.py
- cli/CHANGELOG.md, cli/README.md, cli/CLAUDE.md
Pattern:
- cli/src/applika/lib/updater.py after K1 (seams `_transport`, `_run`, `_state_dir`, `UpdateState`, lock)
- cli/src/applika/config.py `resolve_api_base_url` l.15-27 (flag → env → session → default)
- ADR-0023 `## Decision` (detection order, gate order, auto mode)
Contract: none on the wire. Auto mode prints only `Updated applika-cli <old> → <new>` on stderr. Env: `APPLIKA_DISABLE_AUTOUPDATE` (new), `CI` (read).
Steps:
- T008 [US1] Build on `integration/0017-cli-self-update-and-repo-layout` after the K1 tip.
- T009 [US1] cli/src/applika/lib/updater.py, install detection:
  - `Install(method, argv, detail)`, method `editable|uv_tool|pipx|pip|unknown`; `detect_install()` with distribution, prefix, `which` and user site injectable;
  - order (ADR-0023): `distribution('applika-cli')` `direct_url.json` `dir_info.editable` true or a `file:` url → editable (`detail` = the path; `uv tool install --force .` lands here, Plan corrections 10); `Path(sys.prefix)/'uv-receipt.toml'` + `shutil.which('uv')` → `['uv','tool','upgrade','applika-cli']`; `Path(sys.prefix)/'pipx_metadata.json'` + `which('pipx')` → `['pipx','upgrade','applika-cli']`; `INSTALLER` == `pip` → `[sys.executable,'-m','pip','install','--upgrade','applika-cli']`, + `--user` when the dist sits under `site.getusersitepackages()`; else unknown;
  - marker present, tool not on PATH → unknown. No string read from PyPI ever enters argv.
- T010 [US1] [US3] [US4] [US5] Gates:
  - cli/src/applika/config.py `is_default_api_base_url(url)`: `rstrip('/')`, lower-case scheme and host, rest exact, == `DEFAULT_API_BASE_URL`; `http://applika.dev/api` → not default;
  - updater `blockers(config, install, env, streams, *, auto, force) -> list[Blocker]`, in order: `URL_OVERRIDDEN` (`config.api_base_url`, already flag → env → session), `NOT_INTERACTIVE` (only when `auto`: not all of stdin, stdout, stderr `isatty()`, or `CI` set), `SOURCE_CHECKOUT`, `UNKNOWN_METHOD`, `DISABLED_BY_ENV` (value not in `''`, `'0'`, `'false'`); `force` drops `DISABLED_BY_ENV` only;
  - `Blocker` carries its kind and detail (URL, path); K3 adds the URL's source.
- T011 [US1] updater `install(install, latest, timeout=120) -> InstallResult(ok, code, stderr_tail, kept, timed_out, new_version)`:
  - `_run(install.argv, timeout)`; exit ≠ 0 → not ok, last 20 stderr lines; `TimeoutExpired` → not ok, `timed_out`;
  - verify in a fresh process `[sys.executable,'-I','-c','import importlib.metadata as m; print(m.version("applika-cli"))']` (in-process metadata may be stale): == latest → ok; ≠ latest → `kept` (a pin);
  - `KeyboardInterrupt` propagates (`subprocess.run` kills the child); the caller decides.
- T012 [US1] updater `after_command(config)`, env, streams and clock read through seams:
  - whole body in `try/except (Exception, KeyboardInterrupt): return`;
  - `blockers(…, auto=True, force=False)` → return; `UpdateState.load().due(now)` false → return; lock not acquired → return;
  - save `checked_at` first; `fetch_latest(3)`; save `latest_version`; `is_newer` true → `install(…, 120)`; ok → `typer.echo(f'Updated applika-cli {old} → {new}', err=True)`; `→` → `->` when stderr cannot encode it; everything else silent;
  - lock released in `finally`; no `ApiClient`, no session read beyond `config.api_base_url`: works signed out.
- T013 [US1] cli/src/applika/app.py `_root`: after `ctx.obj = AppConfig(…)` (l.60-63), `ctx.call_on_close(lambda: updater.after_command(ctx.obj))`. `--version` and bare `applika` exit before (l.52-57): no auto update there. K3 adds the `update` exclusion.
- T014 [P] [US1] Docs (no ticket keys):
  - cli/CHANGELOG.md `## [Unreleased]` `### Added`: `- daily auto update: at most once a day, after a command finishes, applika-cli checks PyPI and installs a newer release with the tool it was installed with (uv tool, pipx or pip), then prints "Updated applika-cli <old> → <new>" on stderr. It stays off when the API base URL is not https://applika.dev/api (flag, APPLIKA_API_BASE_URL or saved session), when APPLIKA_DISABLE_AUTOUPDATE is set, outside an interactive terminal (CI, pipes, AI agents) and for source or editable installs. A failed check or install prints nothing and never changes the command's exit status.`; no version bump (Plan corrections 17);
  - cli/README.md: new `## Updates` after `## Global options` (l.612), auto half: when it runs, the one stderr line, the gates, `APPLIKA_DISABLE_AUTOUPDATE`, the editable install (l.42-45) and `uv tool install --force .` (l.714) never update, the manual command per installer; env table row `APPLIKA_DISABLE_AUTOUPDATE` beside l.622;
  - cli/CLAUDE.md: package tree `lib/updater.py`; Environment Variables `APPLIKA_DISABLE_AUTOUPDATE`, `CI` (read); Key Patterns: tests never reach PyPI, spawn an installer or touch `~/.config/applika/` (conftest guards).
- T015 [P] [US1] [US3] [US4] [US5] cli/tests/test_updater.py:
  - `detect_install` (tmp prefix, fake distribution): editable, `file:` url, uv receipt with and without `uv`, pipx with and without `pipx`, pip, pip `--user`, `INSTALLER` = `uv` → unknown, no distribution → unknown;
  - `is_default_api_base_url`: trailing slash, `HTTPS://Applika.DEV/api` → default; `http://applika.dev/api`, `/api/v2`, another host → not;
  - `blockers`: each alone; all five → in order; `force` drops env only; `auto=False` → no TTY gate; env `1`, `yes` → blocks; `0`, `false`, empty → not;
  - `after_command`: each blocker → no fetch, no run, no `update.json`; URL via CliRunner from `--api-base-url`, `APPLIKA_API_BASE_URL` and a saved session → skipped; not due → no fetch; lock held → no fetch; fetch error → silent, `checked_at` saved, `latest_version` null; not newer, not comparable → no run; newer → exact argv, one stderr line `Updated applika-cli 1.1.0 → 1.2.0`, stdout untouched; the command's exit code unchanged (0 and 1) through CliRunner with interactive env and streams patched in; install fails, times out, kept, Ctrl-C → silent, exit unchanged; signed out → runs; no request to the Applika API.
- T016 [US1] Gate, close:
  - `cd cli && make format && make lint && make test`; `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest`, `CI=true uv run pytest`, `uv run --python 3.10 pytest` → 0 failed each;
  - the changelogs verify command (.claude/rules/changelogs.md);
  - commits conventional, no ticket key (e.g. `feat(cli): add daily auto update`); not a merge point.
AC:
- The system checks PyPI for a newer applika-cli at most once every 24 hours per machine, after a command has finished.
- The system installs a newer version with the same tool the CLI was installed with: uv tool, pipx or pip.
- The system prints one line after a successful install, "Updated applika-cli <old> → <new>", and the next run uses the new version.
- The system keeps the command's own output and exit status whatever the update does. A failed check or install prints nothing and is not retried before the next day.
- The system skips the auto update quietly when the API base URL the CLI would use is not `https://applika.dev/api`, whether it comes from `--api-base-url`, `APPLIKA_API_BASE_URL` or the saved session.
- The system skips the auto update quietly when `APPLIKA_DISABLE_AUTOUPDATE` is set.
- The system skips the auto update quietly when it is not running in an interactive terminal: CI, a pipe, a redirect, or a program such as an AI agent running the CLI.
- The system skips the auto update quietly when the CLI runs from a source or editable checkout, or when it cannot tell how the CLI was installed.
- The system bounds the wait: the check gives up after a few seconds, the install after two minutes, and Ctrl-C stops the install without changing the command's result.
- The system ships the update to every CLI user, with no beta flag and no call to the Applika API, and it works signed out.
- A command fails: the auto update still runs after it, under the same rules. (PRD 0017 Edge cases)
- `applika/cli/CHANGELOG.md` records every CLI change, and every backend change that changes what a CLI version sends or receives (a route, a request field, a response field, an enum value, a deprecation). (.claude/rules/changelogs.md 1)
- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go under `## [Unreleased]` with `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. The CLI's version heading matches `applika/cli/pyproject.toml` when it is released. (.claude/rules/changelogs.md 4)

## K3 — applika-cli: applika update [--force] updates now or lists every reason why not   side: cli   covers: R-005, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-018, R-019 (command half), R-020   deps: K2
Goal: `applika update [--force]`: no TTY check (CI, pipe, AI agent all fine); every blocking gate printed on stderr with its way back, exit 1; else check PyPI now (10 s), report up to date, updated, failed with the command to run by hand, or kept by a pin. `--force` lifts only `APPLIKA_DISABLE_AUTOUPDATE`. The overridden-URL refusal names the URL and its source (flag, env, saved session). Every check restarts the daily clock; no auto update after it. Old commands and routes unchanged.
Owner's words: "add a daily auto update to the cli and a command "applika update" to update the cli to the latest version automatically, same how claude cli does, if the api base url have been overriden, the auto update must be disabled and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the operation."
Clarified: "Any non-default URL (Recommended)": "Whatever URL the CLI would actually use (flag, env var or saved session): if it isn't https://applika.dev/api, auto update is off and `applika update` refuses with the reason and the source." "Env var + safe skips (Recommended)": "`applika update` explains each case, the same way it does for the overridden URL. Ignoring the env var is the only thing --force does." "Allow it when typed": "Only the daily auto update skips non-interactive runs. An explicit `applika update` works in CI and from an AI agent."
Covers: R-005, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-018, R-019 (command half), R-020
Release: one (ships in the next applika-cli publish). Plan: `## CLI` (`config.py`, `commands/update.py`, `app.py`), `## Contract`, `## Tests`. Tasks: Plan corrections 11, 12, 17, 18.
Touch:
- cli/src/applika/config.py, cli/src/applika/app.py
- cli/src/applika/commands/update.py (new)
- cli/src/applika/lib/updater.py (`Blocker` gains the source)
- cli/tests/test_update_command.py (new), cli/tests/test_updater.py
- cli/CHANGELOG.md, cli/README.md, cli/CLAUDE.md
Pattern:
- cli/src/applika/commands/version.py (a root command, `app.command(…)` in app.py l.23-27)
- cli/src/applika/lib/updater.py after K2 (`detect_install`, `blockers`, `install`, `UpdateState`, lock)
- cli/tests/test_commands.py l.857-892 (CliRunner + patched PyPI)
Contract: CLI surface pinned, no HTTP change. `applika update [--force]`: exit 0 = updated or up to date; 1 = anything else.
Steps:
- T017 [US2] Build on `integration/0017-cli-self-update-and-repo-layout` after the K2 tip.
- T018 [US3] cli/src/applika/config.py:
  - `ApiBaseUrlSource(str, Enum)`: `FLAG='flag'`, `ENV='env'`, `SESSION='session'`, `DEFAULT='default'` (Python 3.10, no `StrEnum`);
  - `resolve_api_base_url_with_source(explicit_value, explicit_source, store) -> tuple[str, ApiBaseUrlSource]`; `resolve_api_base_url` keeps its signature (wraps it); callers unchanged;
  - `AppConfig` + `api_base_url_source: ApiBaseUrlSource = ApiBaseUrlSource.DEFAULT` (existing `AppConfig(api_base_url=…, store=…)` test ctors unchanged).
- T019 [US3] cli/src/applika/app.py `_root`: `--api-base-url` has `envvar` (l.38), so the source is `ctx.get_parameter_source('api_base_url')`: `COMMANDLINE` → flag, `ENVIRONMENT` → env, else session (a session loaded) or default; into `AppConfig`. Updater `Blocker` for `URL_OVERRIDDEN` carries the source.
- T020 [US2] [US3] [US4] [US5] cli/src/applika/commands/update.py (new): `update(ctx, force: Annotated[bool, typer.Option('--force', help='Update even when APPLIKA_DISABLE_AUTOUPDATE is set. Changes nothing else.')] = False)`, docstring "Update applika-cli to the latest version on PyPI.":
  - `detect_install()`; `blockers(config, install, env, streams, auto=False, force=force)`. No TTY check. One stderr line per blocker, in order, reason then way back on the same line (Plan corrections 11), then exit 1:
    - `Cannot update: the API base URL is <url> (from --api-base-url | from APPLIKA_API_BASE_URL | from your saved session), not https://applika.dev/api. --force does not change this.` + ` Run without --api-base-url.` | ` Unset APPLIKA_API_BASE_URL.` | ` Run applika logout, then applika login without --api-base-url.`;
    - `Cannot update: applika-cli runs from a source checkout (<path>). Update it with git.`;
    - `Cannot update: can't tell how applika-cli was installed. Upgrade with the tool you used: uv tool upgrade applika-cli, pipx upgrade applika-cli, or python -m pip install --upgrade applika-cli.`;
    - `Updates are turned off by APPLIKA_DISABLE_AUTOUPDATE. Run applika update --force to update anyway.`;
  - lock not acquired → stderr `Another applika update is running.`, exit 1;
  - save `checked_at` first (every check restarts the clock); `fetch_latest(10)`; save `latest_version`;
  - results: PyPI error → stderr `Could not reach PyPI: <reason>`, exit 1; not comparable → stderr `Cannot compare installed <a> with published <b>.`, exit 1; not newer (equal or installed newer) → stdout `applika-cli <v> is up to date.`, exit 0; newer → stdout `Updating applika-cli <old> → <new> (<argv>)…`, `install(…, 120)`:
    - ok → stdout `Updated applika-cli <old> → <new>`, exit 0;
    - failed → stderr `Update failed: <argv> exited <code>.` + the last 20 installer stderr lines + `Run it yourself: <argv>`, exit 1;
    - timed out → stderr `Update failed: <argv> timed out after 120 s.` + `Run it yourself: <argv>`, exit 1 (Plan corrections 12);
    - kept → stderr `<tool> kept applika-cli <old>: your install pins that version. Reinstall without the pin to update.`, exit 1;
  - `→` → `->` when the stream cannot encode it; no `require_session`, no `ApiClient`: works signed out.
- T021 [US2] cli/src/applika/app.py: import `update`; `app.command('update')(update)` after l.27; the `call_on_close` from K2 runs only `if ctx.invoked_subcommand != 'update'` (R-005).
- T022 [P] [US2] Docs (no ticket keys):
  - cli/CHANGELOG.md `## [Unreleased]` `### Added`: `- applika update [--force]: checks PyPI now and installs the latest applika-cli with the tool it was installed with, in a terminal, in CI, in a pipe or from an AI agent. It lists every reason it refuses: an API base URL other than https://applika.dev/api (with where it comes from and the way back, --force or not), a source or editable install, an install it cannot identify, or APPLIKA_DISABLE_AUTOUPDATE (lifted by --force, the only thing --force does).`;
  - cli/README.md `## Updates`: `applika update`, `--force`, each refusal and its way back, the results, the manual command per installer; a `### applika update [--force]` entry under `## Commands`;
  - cli/CLAUDE.md: CLI Commands row `applika update [--force]`; package tree `commands/update.py`, `config.py` (URL source);
  - SKILL.md untouched (Plan corrections 18).
- T023 [P] [US2] [US3] [US4] [US5] cli/tests/test_update_command.py (new) + cli/tests/test_updater.py:
  - refusals, each with and without `--force`, exit 1, no fetch: URL from flag, env, saved session (three ways back); source checkout; unknown;
  - env set → refused, names `--force`; `--force` → updates; `0`, `false` → updates;
  - several blockers → every line, in order, exit 1;
  - non-TTY streams + `CI=true` → updates, no refusal;
  - up to date (equal; installed newer); updated (stdout lines, exact argv, exit 0); failed (code, 20 lines, `Run it yourself:`, exit 1); timed out; kept (exit 1); PyPI down; not comparable (`1.2.0rc1`);
  - lock held → `Another applika update is running.`, exit 1; `checked_at` saved on every check, failed ones included;
  - no auto update after `update`: one fetch, at most one install;
  - signed out → works; no request to the Applika API;
  - `applika --help` lists `update`; `applika update --help` lists `--force` (colour-proof through the autouse fixture);
  - source via CliRunner: flag, env, session, default; `resolve_api_base_url` signature unchanged.
- T024 [US2] Checks, close:
  - `cd cli && make format && make lint && make test`; `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest`, `CI=true uv run pytest`, `uv run --python 3.10 pytest` → 0 failed each;
  - test_commands.py (0.1.4 commands, `applika version`) and test_timeline_and_finalize.py untouched and green;
  - `cd backend && uv run pytest tests -k "steps or finalize or supports"` green (R-020); `git -C applika diff develop --name-only -- backend/` → empty;
  - with `HOME=$(mktemp -d)`: `uv run applika update` → the source-checkout refusal, exit 1; `uv run applika --api-base-url http://127.0.0.1:8000/api update --force` → URL line (from --api-base-url) then source-checkout line, exit 1; nothing installed;
  - the changelogs verify command;
  - commits conventional, no ticket key (e.g. `feat(cli): add applika update`); not a merge point.
AC:
- The system never runs the auto update after `applika update` itself.
- The system offers `applika update`, which checks PyPI at once and installs the latest version with the tool the CLI was installed with. It runs in an interactive terminal and outside one alike: in CI, in a pipe, or typed by an AI agent.
- The system says the CLI is up to date, with its version, when PyPI has nothing newer.
- The system refuses `applika update`, with or without `--force`, when the API base URL is overridden. It names the URL in use, where it comes from (the flag, the environment variable or the saved session) and how to go back to the default.
- The system refuses `applika update`, with or without `--force`, when the CLI runs from a source or editable checkout, or when it cannot tell how the CLI was installed. It says why and what to run instead.
- The system refuses `applika update` without `--force` when `APPLIKA_DISABLE_AUTOUPDATE` is set, says so and names `--force`. With `--force` it updates. Ignoring that variable is the only thing `--force` does.
- The system lists every reason that blocks `applika update`, not only the first one.
- The system reports a failed check or install with the reason and the command to run by hand, and exits with an error.
- The system restarts the once-a-day clock after every `applika update` check.
- The system ships the update to every CLI user, with no beta flag and no call to the Applika API, and it works signed out.
- The system keeps every installed CLI version working. The API never refuses an old CLI and never asks it to upgrade.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- New capabilities ship in a new CLI version with new commands. The old commands keep working. (.claude/rules/cli-compatibility.md 4)
- `applika/cli/CHANGELOG.md` records every CLI change, and every backend change that changes what a CLI version sends or receives (a route, a request field, a response field, an enum value, a deprecation). (.claude/rules/changelogs.md 1)

## K4 — Repo layout: CV diff fixtures into backend tests, E2E runner into frontend   side: both (backend tests, frontend, root, CI)   covers: R-021, R-022, R-023, R-024, R-025   deps: K1 (branch only)
Goal: `fixtures/cv-diff` → `backend/tests/fixtures/cv-diff` (beside `jobs/`), both suites read it there, the frontend suite fails when it is missing. `scripts/e2e.sh` → `frontend/scripts/e2e.sh` (beside `frontend/e2e`), same commands, same CI job. `docker-compose.e2e.yml` stays at the root. Every live reference, CI and the workspace rule updated. Root keeps `backend`, `cli`, `docs`, `frontend`, `legacy` and root files only.
Owner's words: "And lastly I would like to reorganize the main repository directory since the folder @../fixtures/ and @../scripts/ dont seems to be in the right place"
Clarified: "Into the owning project (Recommended)": "fixtures/cv-diff → backend/tests/fixtures/cv-diff, next to the existing jobs fixtures; the backend owns them and the frontend test's relative path is updated. scripts/e2e.sh → frontend/scripts/e2e.sh, next to the Playwright suite in frontend/e2e; docker-compose.e2e.yml stays at the root beside docker-compose.yml. CI paths, READMEs, CLAUDE.md files and the workspace rules are updated. Old planning docs keep their history."
Covers: R-021, R-022, R-023, R-024, R-025
Release: one (no deploy effect; CD republishes both images on `main`, Plan corrections 14). Plan: `## Backend`, `## Frontend`, `## Repo root and CI`, `## Tests`. Tasks: Plan corrections 3, 4, 13, 14, 16.
Touch:
- moved (`git mv`): fixtures/cv-diff/ (9 JSON + README.md) → backend/tests/fixtures/cv-diff/; scripts/e2e.sh → frontend/scripts/e2e.sh
- backend/tests/unit/test_cv_diff_fixtures.py, backend/app/application/services/cv_diff.py (l.7), backend/app/scripts/seed_e2e.py (l.4), backend/CLAUDE.md (l.49), backend/CHANGELOG.md
- frontend/src/components/tailored-cvs/cv-diff.fixtures.test.ts, frontend/src/components/tailored-cvs/cv-diff.ts (l.8), frontend/playwright.config.ts (l.6), frontend/e2e/support/auth.ts, frontend/e2e/profile-discord.spec.ts (l.11), frontend/e2e/shell-responsive.spec.ts (l.15), frontend/CLAUDE.md
- README.md (l.224), docker-compose.e2e.yml (l.11, l.28), .github/workflows/frontend-ci.yaml
- outside the repo, no applika commit: /home/luis0ares/projects/applika-upgrade/.claude/rules/quality-gates.md (l.32)
Pattern:
- backend/tests/fixtures/jobs/ (a backend-owned fixture folder another suite reads: docker-compose.e2e.yml mounts it)
- backend/tests/unit/test_cv_diff_fixtures.py l.40-41 (`test_fixtures_directory_is_not_empty`, a missing folder fails)
Contract: none (no route).
Steps:
- T025 [US6] Build on `integration/0017-cli-self-update-and-repo-layout` after the K3 tip.
- T026 [US6] Fixtures into the backend:
  - `git mv fixtures/cv-diff backend/tests/fixtures/cv-diff`; root `fixtures/` gone (remove it if left empty on disk);
  - backend/tests/unit/test_cv_diff_fixtures.py l.25 → `Path(__file__).resolve().parents[1] / 'fixtures' / 'cv-diff'`; docstring l.1-13: the new path, no ticket key, suite `cv-diff.fixtures.test.ts` (Plan corrections 3, 4); `test_fixtures_directory_is_not_empty` stays;
  - moved README.md: l.3 without "KODI-017 (T091, R-024/R-025)."; l.6 → `applika/frontend/src/components/tailored-cvs/cv-diff.fixtures.test.ts`; every path names the new folder;
  - backend/app/application/services/cv_diff.py l.7 → `backend/tests/fixtures/cv-diff/` (text only).
- T027 [P] [US6] Runner into the frontend:
  - `git mv scripts/e2e.sh frontend/scripts/e2e.sh` (mode 100755 kept); root `scripts/` gone;
  - l.19 `ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`; l.3, l.14-16 → `frontend/scripts/e2e.sh` (from the repo root) / `./scripts/e2e.sh` (from `frontend/`); the rest unchanged: commands, arguments, environment, l.74 included (Plan corrections 3);
  - backend/app/scripts/seed_e2e.py l.4 docstring and backend/CLAUDE.md l.49 → `frontend/scripts/e2e.sh`.
- T028 [US6] frontend/src/components/tailored-cvs/cv-diff.fixtures.test.ts:
  - l.20 → `resolve(__dirname, "../../../../backend/tests/fixtures/cv-diff")`;
  - drop `hasFixtures` and `describe.skipIf` (l.33-35) → plain `describe`; first `it` asserts `existsSync(FIXTURES_DIR)` with a message naming the path, then files > 0; `readdirSync` only when the folder exists (nothing throws at collection);
  - comment l.8-19: the backend owns the folder; a missing folder fails the suite; no ticket key;
  - cv-diff.ts l.8 → the new path.
- T029 [P] [US6] Frontend E2E references → `frontend/scripts/e2e.sh`: playwright.config.ts l.6; e2e/support/auth.ts l.6, l.27, l.51, l.77 (thrown text: "Run the suite through \`frontend/scripts/e2e.sh\` from the repo root"), l.149; e2e/profile-discord.spec.ts l.11; e2e/shell-responsive.spec.ts l.15.
- T030 [P] [US6] frontend/CLAUDE.md: l.78-80 → `./scripts/e2e.sh …` (run from `frontend/`); l.84, l.89, l.1496, l.1498 → `frontend/scripts/e2e.sh`; l.773 and l.847-850 → `applika/backend/tests/fixtures/cv-diff/`, and the suite fails when the folder is missing (replaces the `describe.skipIf` sentence). No ticket keys.
- T031 [US6] Root and CI:
  - README.md l.224 → `frontend/scripts/e2e.sh`; docker-compose.e2e.yml comments l.11, l.28 (the file stays at the root);
  - .github/workflows/frontend-ci.yaml: drop `"scripts/e2e.sh"` at l.22 and l.31 (now inside `frontend/**`); comments l.3-9 and l.160-161; l.185 `run: ./frontend/scripts/e2e.sh` (the script cds to the root itself); `backend/**` already triggers vitest and E2E;
  - backend-ci.yaml, backend-cd.yaml, frontend-cd.yaml unchanged (`backend/**` now covers fixture edits);
  - backend/CHANGELOG.md `## [Unreleased]` `### Changed`, first line: `- the CV diff fixtures moved from the repository root (fixtures/cv-diff/) to backend/tests/fixtures/cv-diff/, beside the jobs fixtures; the backend and frontend suites read them there, and the frontend suite fails instead of skipping when they are missing. The E2E runner moved to frontend/scripts/e2e.sh. No runtime change.`; l.307 untouched (Plan corrections 16).
- T032 [US6] Workspace rule, outside the repo, no applika commit: /home/luis0ares/projects/applika-upgrade/.claude/rules/quality-gates.md l.32 → ``Stack: `applika/frontend/scripts/e2e.sh` and `applika/docker-compose.e2e.yml`.``
- T033 [US6] Checks, close:
  - repo root lists `backend`, `cli`, `docs`, `frontend`, `legacy` and root files; no `fixtures/`, no `scripts/`;
  - `git -C applika grep -n -e "scripts/e2e.sh" -e "fixtures/cv-diff"`: every hit names `frontend/scripts/e2e.sh`, `./scripts/e2e.sh` (from `frontend/`) or `backend/tests/fixtures/cv-diff`, except docs/plan, docs/prd, backend/CHANGELOG.md l.307 and `.claude/agent-memory/`; no `../scripts/e2e.sh` left;
  - `git -C applika ls-files -s frontend/scripts/e2e.sh` → `100755`; `git -C applika diff develop -M --stat` shows both moves as renames;
  - backend: `uv run pytest tests/unit/test_cv_diff_fixtures.py` → 10 passed; `uv run ty check` clean on test_cv_diff_fixtures.py, cv_diff.py, seed_e2e.py (Plan corrections 13); `make format && make lint && make test`;
  - frontend: `pnpm test src/components/tailored-cvs/cv-diff.fixtures.test.ts` → 10 passed, 0 skipped; folder renamed for a moment → the suite fails with the path in its message; renamed back, `git status` clean; `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - E2E: from the repo root `frontend/scripts/e2e.sh` → green; from `frontend/` `./scripts/e2e.sh e2e/smoke.spec.ts` → green; no applika-e2e container, network or volume left;
  - frontend-ci.yaml read back: `e2e` runs `./frontend/scripts/e2e.sh` from the checkout root; paths keep `frontend/**`, `backend/**`, `docker-compose.e2e.yml`;
  - commits conventional, no ticket key: `chore(repo): move cv-diff fixtures into backend tests`, `chore(repo): move e2e runner into frontend`; not a merge point.
AC:
- The system keeps the CV diff fixtures in the backend project's tests, beside its other test fixtures. The backend and frontend suites both read them from there.
- The system fails the frontend's CV diff fixture test, instead of skipping it, when the fixtures cannot be found.
- The system keeps the E2E runner in the frontend project, beside its E2E suite. The E2E stack definition stays at the repository root beside the dev stack.
- The system runs the E2E suite the same way locally and in CI from the runner's new place. CI still runs the backend and frontend jobs when the moved files change.
- The system leaves no `fixtures/` and no `scripts/` folder at the repository root. Current guides and contributor instructions point at the new places. Past planning documents, released changelog entries and agent notes keep their history.
- `applika/backend/CHANGELOG.md` records every backend change. (.claude/rules/changelogs.md 2)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)
- Commit messages are conventional commits **without** a ticket key: `feat(cv): add base CV table`. The board is local and the repo is moving to a new remote, so nothing in git history points at a ticket. (.claude/rules/branches-and-commits.md 2)

## K5 — Closing 0017: full gate, E2E from the moved runner, ADR-0023, CLI update walk, one release   side: both (backend, frontend, cli)   covers: — (closing)   deps: K3, K4
Goal: Prove 0017 whole: the full gate in CLAUDE.md order plus the target gates, the whole E2E suite through `frontend/scripts/e2e.sh`, ADR-0023 Accepted, no infra left, a walk by hand of the auto update and `applika update` in a disposable venv against a fake PyPI, the repo layout, and the `0017-release` tag. No new feature work. Never publish, never touch the user's installed CLI or `~/.config/applika/`.
Owner's words: "add a daily auto update to the cli and a command "applika update" to update the cli to the latest version automatically, same how claude cli does, if the api base url have been overriden, the auto update must be disabled and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the operation. And lastly I would like to reorganize the main repository directory since the folder @../fixtures/ and @../scripts/ dont seems to be in the right place"
Clarified: success signals: with an overridden URL, `applika update` prints the URL, its source and the way back, every time, with and without `--force`; no CLI test triggers an install; both suites run all nine CV diff cases from the new folder and the frontend suite fails when it is missing; the CI E2E job passes from the runner's new place; the root lists `backend`, `cli`, `docs`, `frontend`, `legacy` and the root files only.
Covers: — (closing)
Release: one, tag `0017-release` on this tip. Plan: docs/plan/0017-cli-self-update-and-repo-layout.md. Tasks: Plan corrections 14, 15, 17.
Touch:
- docs/adr/0023-cli-self-update-from-pypi.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only; the walk lives in a scratch dir outside the repo
Pattern: .claude/rules/quality-gates.md; docs/plan/0016-close-with-event-and-teal-palette.tasks.md K5
Contract: none new.
Steps:
- T034 On `integration/0017-cli-self-update-and-repo-layout` after the K4 tip. Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T035 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; touched files clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`; `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest`, `CI=true uv run pytest`, `uv run --python 3.10 pytest` → 0 failed each.
- T036 E2E: the whole suite from the repo root through `frontend/scripts/e2e.sh`, green. `.github/workflows/frontend-ci.yaml` `e2e` runs `./frontend/scripts/e2e.sh`. No new spec: 0017 adds no screen. Cheaper layers carry the rest:
  - auto update gates, once a day, lock, silent failures, untouched exit code: `cli/tests/test_updater.py`;
  - `applika update` refusals (URL × 3 sources, with and without `--force`), env + `--force`, CI and pipe, every result: `cli/tests/test_update_command.py`;
  - `applika version` unchanged: `cli/tests/test_commands.py` l.857-892;
  - fixtures: `backend/tests/unit/test_cv_diff_fixtures.py` (10) and `cv-diff.fixtures.test.ts` (10, fails when the folder is missing);
  - old CLI routes: `cd backend && uv run pytest tests -k "steps or finalize or supports"`.
- T037 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` → empty; no network or volume from docker-compose.e2e.yml; no testcontainers Postgres or Redis left;
  - the T039 scratch dir (venvs, wheels, fake HOME, harness) deleted;
  - `~/.config/applika/` untouched by any run; the user's installed applika-cli, uv tools and pipx venvs untouched; the owner's dev containers untouched.
- T038 ADRs, rules, repo:
  - ADR-0023 reads Accepted (2026-10-19); its Decision matches the build (PyPI source, detection order, gate order, auto mode, `--force`, beta exception). A departure → a dated as-built note under Consequences; the Decision stays untouched;
  - ADR-0018 carries the 2026-10-19 PRD 0017 note; ADR-0009 reads Accepted, its Non-goal holds;
  - `git -C applika diff develop --name-only -- backend/app` → `application/services/cv_diff.py` and `scripts/seed_e2e.py` only (docstrings); `-- backend/migrations` → empty; `-- backend/app/core/features.py` → empty (no `FeatureKey`); `cli/pyproject.toml` unchanged;
  - the changelogs verify command; cli/CHANGELOG.md `[Unreleased]` `### Added` × 2 (K2, K3); backend/CHANGELOG.md `### Changed` × 1 (K4);
  - commit-format verify on `develop..integration/0017-cli-self-update-and-repo-layout` → no output; no ticket key added outside this tasks file (`git -C applika diff develop -U0 -- . ':!docs/plan/0017-cli-self-update-and-repo-layout.tasks.md' | grep '^+' | grep -E 'KODI-[0-9]+'` → empty);
  - workspace rule `.claude/rules/quality-gates.md` l.32 names `applika/frontend/scripts/e2e.sh`.
- T039 Walk by hand. CLI in a disposable venv against a fake PyPI; never publish, never touch the user's installed CLI or `~/.config/applika/`:
  - **Setup** (`$W` = a fresh dir under the session scratchpad, outside the repo; `export HOME=$W/home` for every walk command):
    - `cd applika/cli && uv build --out-dir $W/dist` → the branch wheel (1.1.0);
    - newer wheel: `cp -r applika/cli $W/cli-next`, `version = "9.9.9"` in `$W/cli-next/pyproject.toml` only, `uv build --out-dir $W/index`; the repo's pyproject stays 1.1.0;
    - `python3 -m venv $W/venv && $W/venv/bin/pip install $W/dist/applika_cli-1.1.0-*.whl` (method pip);
    - every walk command also exports `PIP_NO_INDEX=1 PIP_FIND_LINKS=$W/index`: the installer sees only `$W/index`;
    - harness `$W/walk.py`: sets `applika.lib.updater._transport` to an `httpx.MockTransport` answering `{"info": {"version": "$WALK_LATEST"}}` (`WALK_PYPI=down` → `ConnectError`), logs each request to `$W/requests.log`, then calls `applika.main.main()`; `WALK_DRY_RUN=1` swaps `_run` for a printer. Run as `$W/venv/bin/python $W/walk.py <args>`; a TTY through `script -qec '<cmd>' /dev/null`;
    - reset between cases: `$W/venv/bin/pip install --force-reinstall --no-deps $W/dist/applika_cli-1.1.0-*.whl`; `rm -f $HOME/.config/applika/update.json`.
  - **Auto update** (TTY, `CI` unset, signed out):
    - `walk.py whoami` → its own error, then one stderr line `Updated applika-cli 1.1.0 → 9.9.9`; exit code = the same run with `APPLIKA_DISABLE_AUTOUPDATE=1`; `walk.py --version` → 9.9.9; `update.json` holds `checked_at` and `"9.9.9"`;
    - again at once (wheel reset, `update.json` kept) → no request, nothing printed;
    - silent, no request, no `update.json`: `--api-base-url http://127.0.0.1:8000/api`; `APPLIKA_API_BASE_URL=http://127.0.0.1:8000/api`; a saved session (`$HOME/.config/applika/session.json`, the four keys, `api_base_url` local); `APPLIKA_DISABLE_AUTOUPDATE=1`; `CI=1`; `| cat`; `> $W/out.txt`; `< /dev/null`; editable (`cd applika/cli && uv run python $W/walk.py whoami` in a TTY);
    - silent, `checked_at` saved, nothing installed: `WALK_PYPI=down`; `WALK_LATEST=1.1.0`; `WALK_LATEST=1.2.0rc1`;
    - `APPLIKA_DISABLE_AUTOUPDATE=0` and `=false` → it runs.
  - **`applika update`:**
    - `walk.py update` → `Updating applika-cli 1.1.0 → 9.9.9 (… -m pip install --upgrade applika-cli)…`, `Updated applika-cli 1.1.0 → 9.9.9`, exit 0; one request (no auto update after it); again → `applika-cli 9.9.9 is up to date.`, exit 0;
    - typed outside a TTY: `CI=1 walk.py update | cat` and `walk.py update < /dev/null > $W/out.txt 2>&1` → updates, exit 0;
    - overridden URL from each source, with and without `--force` → exit 1, no request, the URL, its source and the way back: flag (`Run without --api-base-url.`), env (`Unset APPLIKA_API_BASE_URL.`), saved session (`Run applika logout, then applika login without --api-base-url.`); `http://applika.dev/api` → refused; `HTTPS://Applika.dev/api/` → allowed;
    - `APPLIKA_DISABLE_AUTOUPDATE=1 walk.py update` → refused, names `--force`, exit 1; with `--force` → updates;
    - env var + flag URL together → two lines, URL first;
    - source checkout: `cd applika/cli && uv run python $W/walk.py update [--force]` → refused with the path and "Update it with git."; unknown: `$W/venv2` filled by `uv pip install --python $W/venv2/bin/python $W/dist/applika_cli-1.1.0-*.whl` (`INSTALLER` = uv) → the "can't tell" line with the three commands;
    - failure: `PIP_FIND_LINKS=$W/empty` → `Update failed: … exited 1.`, the stderr tail, `Run it yourself: …`, exit 1;
    - kept: `PIP_FIND_LINKS=$W/dist` (only 1.1.0) with `WALK_LATEST=9.9.9` → `pip kept applika-cli 1.1.0: …`, exit 1;
    - `WALK_PYPI=down` → `Could not reach PyPI: …`, exit 1; `WALK_LATEST=1.2.0rc1` → `Cannot compare installed 1.1.0 with published 1.2.0rc1.`, exit 1;
    - a fresh `$HOME/.config/applika/update.lock` → `Another applika update is running.`, exit 1; 11 min old → it runs;
    - signed out throughout: no `session.json`, no request to any Applika API.
  - **uv tool, pipx** (detection and argv only): `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `PIPX_HOME`, `PIPX_BIN_DIR` under `$W`; install the branch wheel there; run the harness with that tool's interpreter and `WALK_DRY_RUN=1` → `['uv','tool','upgrade','applika-cli']` / `['pipx','upgrade','applika-cli']`; with `uv` / `pipx` off the PATH → the "can't tell" line.
  - **Repo layout:** root listing; the runner from the root and from `frontend/` (T036, K4 T033); the fixture suite with the folder renamed fails, then passes.
  - **Not walked:** Windows (plan `## Open` 2), flagged to the owner before the publish.
  - **Owner, after the publish** (plan `## Tests` Manual): uv-tool install of the published version, delete `update.json`, run a command → the "Updated" line; `applika --api-base-url http://127.0.0.1:8000/api update --force` → the refusal.
- T040 Record at close:
  - annotated tag `0017-release` on the K5 tip (local; Plan corrections 15);
  - the owner steps of `### Release`: merge `--no-ff` into `develop`; `develop` → `main` is the owner's release (both images republished, no runtime change; the CLI publishes at the version the owner sets); Windows check before the publish; rollback = `git revert` for the layout, a higher fixed version for the CLI;
  - the agent never touches prod or `main`, never pushes, never publishes.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics beyond 171, coverage ≥ 90%, prettier, tsc; CLI under FORCE_COLOR, CI=true and Python 3.10).
- Every ADR the feature drafted reads Accepted (ADR-0023, Accepted 2026-10-19; ADR-0018 carries the PRD 0017 owner-exception note; bound ADR-0009 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases, testcontainers, walk venvs or fake HOME.
- The E2E the feature earned (no new spec: no screen; the whole suite through the moved runner frontend/scripts/e2e.sh, locally and in the CI e2e job) runs inside the gate and is green; the update paths are carried by cli/tests/test_updater.py and cli/tests/test_update_command.py, the fixtures by test_cv_diff_fixtures.py and cv-diff.fixtures.test.ts.
- By-hand walk done in a disposable venv against a fake PyPI: the auto update and its silent skips, applika update with the overridden URL from the flag, the environment variable and the saved session (with and without --force), the APPLIKA_DISABLE_AUTOUPDATE off-switch and --force, typed in CI and in a pipe; nothing published, the user's installed CLI and ~/.config/applika untouched; Windows flagged to the owner, not tested.
- No new feature work.
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | applika-cli updater foundation: update record, lock, PyPI read, version compare, test guards | cli | — (foundation) | — | one |
| K2 | applika-cli daily auto update after a command: install detection, five gates, silent install | cli | R-001, R-002, R-003, R-004, R-006, R-007, R-008, R-009, R-010, R-019 | K1 | one |
| K3 | applika-cli: applika update [--force] updates now or lists every reason why not | cli | R-005, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-018, R-019, R-020 | K2 | one |
| K4 | Repo layout: CV diff fixtures into backend tests, E2E runner into frontend | both | R-021, R-022, R-023, R-024, R-025 | K1 (branch only) | one |
| K5 | Closing 0017: full gate, E2E from the moved runner, ADR-0023, CLI update walk, one release | both | — (closing) | K3, K4 | one, tag `0017-release` |

## Matrix
| R | K |
|---|---|
| R-001 | K2 |
| R-002 | K2 |
| R-003 | K2 |
| R-004 | K2 |
| R-005 | K3 |
| R-006 | K2 |
| R-007 | K2 |
| R-008 | K2 |
| R-009 | K2 |
| R-010 | K2 |
| R-011 | K3 |
| R-012 | K3 |
| R-013 | K3 |
| R-014 | K3 |
| R-015 | K3 |
| R-016 | K3 |
| R-017 | K3 |
| R-018 | K3 |
| R-019 | K2 (auto), K3 (command) |
| R-020 | K3 (K5 T038 checks `backend/app`) |
| R-021 | K4 |
| R-022 | K4 |
| R-023 | K4 |
| R-024 | K4 |
| R-025 | K4 |

Uncovered: none. Orphans: K1 (foundation, by design), K5 (closing, by design).

## Owner's words not served
None. Checked clause by clause:
- "add a daily auto update to the cli": K2 (with K1's record and lock).
- "and a command "applika update" to update the cli to the latest version automatically": K3.
- "same how claude cli does": K2 (silent install after a command, one line; clarified "Like Claude Code").
- "if the api base url have been overriden, the auto update must be disabled": K2 (R-006: flag, env, saved session).
- "and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the operation": K3 (R-013, the URL, its source, the way back; R-016 every reason).
- "And lastly I would like to reorganize the main repository directory since the folder @../fixtures/ and @../scripts/ dont seems to be in the right place": K4.
