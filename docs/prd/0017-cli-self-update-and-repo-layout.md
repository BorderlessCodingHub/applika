---
PRD: 0017
title: CLI self-update and repository layout
status: Approved
owner: LuisMSoares
created: 2026-10-19
related-adrs: [0009, 0018, 0019, 0023]
related-prds: [0013-beta-features.md, 0014-cli-device-sign-in-and-devices.md]
---

# PRD 0017 — CLI self-update and repository layout

## In the owner's words

> add a daily auto update to the cli and a command "applika update" to update the cli to the latest version automatically, same how claude cli does, if the api base url have been overriden, the auto update must be disabled and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the operation. And lastly I would like to reorganize the main repository directory since the folder @../fixtures/ and @../scripts/ dont seems to be in the right place

## Clarifications

- Q: What should the daily auto update do once a day when PyPI has a newer applika-cli? → A: "Install silently (Recommended)": "Like Claude Code: at most once a day, after a command finishes, it checks PyPI and installs the newer version with the same tool it was installed with (uv tool, pipx or pip). It prints one line, "Updated applika-cli 1.1.0 → 1.2.0". The next run uses it. Costs: an install can fail (no network, permissions), which must never break the user's command."
- Q: What counts as "the API base URL has been overridden"? → A: "Any non-default URL (Recommended)": "Whatever URL the CLI would actually use (flag, env var or saved session): if it isn't https://applika.dev/api, auto update is off and `applika update` refuses with the reason and the source. This covers someone logged into a local or staging API without passing the flag every time."
- Q: Where should fixtures/ and scripts/ go? → A: "Into the owning project (Recommended)": "fixtures/cv-diff → backend/tests/fixtures/cv-diff, next to the existing jobs fixtures; the backend owns them and the frontend test's relative path is updated. scripts/e2e.sh → frontend/scripts/e2e.sh, next to the Playwright suite in frontend/e2e; docker-compose.e2e.yml stays at the root beside docker-compose.yml. CI paths, READMEs, CLAUDE.md files and the workspace rules are updated. Old planning docs keep their history."
- Q: Besides an overridden URL, when else should the daily auto update stay off? → A: "Env var + safe skips (Recommended)": "APPLIKA_DISABLE_AUTOUPDATE=1 turns it off. It also skips quietly when not in an interactive terminal (CI, pipes), when the install is a source/editable checkout, and when it can't tell how it was installed. `applika update` explains each case, the same way it does for the overridden URL. Ignoring the env var is the only thing --force does."
- Q: Should the CLI update feature start in beta? → A: "No gate, an exception (Recommended)": "Ships to every CLI user, with no FeatureKey and no API call. It's recorded as an owner exception on ADR-0018, like 0014. Self-update protects users on old versions, works when signed out, and an outdated CLI can't be gated after the fact anyway."
- Q: Should `applika update` refuse outside an interactive terminal (CI, pipes, an AI agent running it), even with --force? → A: "Allow it when typed": "Only the daily auto update skips non-interactive runs. An explicit `applika update` works in CI and from an AI agent. Handier for scripts, but an agent could replace the CLI mid-session."

## Problem

Users install applika-cli from PyPI and keep whatever version they installed. Nothing tells them a newer one
exists, and nothing updates it. Fixes and new commands reach them only when they upgrade by hand, so the API keeps
old routes alive for versions nobody remembers to replace. A developer who points the CLI at a local or staging API
must not have the CLI swap itself for the published version under them.

Separately, the repository root holds two folders that each belong to one project. `fixtures/` holds the CV diff
cases the backend owns and both test suites read. `scripts/` holds the E2E runner that drives the frontend's
Playwright suite. At the root they read as shared tooling, and a wrong path to the fixtures makes the frontend test
skip itself instead of failing.

## Users and stories

US1 (P1) As a CLI user, my CLI updates itself at most once a day after a command, and tells me in one line when it did.
US2 (P1) As a CLI user, I run `applika update` and get the latest version now, or a clear reason why not.
US3 (P1) As a developer pointing the CLI at another API, the CLI never updates itself, and `applika update` tells me why, even with `--force`.
US4 (P2) As a CLI user, I turn the auto update off with an environment variable and still update on demand with `applika update --force`.
US5 (P2) As a CLI user in CI, in a pipe, or through an AI agent, the CLI never installs anything on its own.
US6 (P3) As a contributor, I find the CV diff fixtures in the backend's tests and the E2E runner in the frontend, and every test and CI job still finds them.

## Requirements

### Daily auto update

- R-001 The system checks PyPI for a newer applika-cli at most once every 24 hours per machine, after a command has finished.
- R-002 The system installs a newer version with the same tool the CLI was installed with: uv tool, pipx or pip.
- R-003 The system prints one line after a successful install, "Updated applika-cli <old> → <new>", and the next run uses the new version.
- R-004 The system keeps the command's own output and exit status whatever the update does. A failed check or install prints nothing and is not retried before the next day.
- R-005 The system never runs the auto update after `applika update` itself.
- R-006 The system skips the auto update quietly when the API base URL the CLI would use is not `https://applika.dev/api`, whether it comes from `--api-base-url`, `APPLIKA_API_BASE_URL` or the saved session.
- R-007 The system skips the auto update quietly when `APPLIKA_DISABLE_AUTOUPDATE` is set.
- R-008 The system skips the auto update quietly when it is not running in an interactive terminal: CI, a pipe, a redirect, or a program such as an AI agent running the CLI.
- R-009 The system skips the auto update quietly when the CLI runs from a source or editable checkout, or when it cannot tell how the CLI was installed.
- R-010 The system bounds the wait: the check gives up after a few seconds, the install after two minutes, and Ctrl-C stops the install without changing the command's result.

### `applika update`

- R-011 The system offers `applika update`, which checks PyPI at once and installs the latest version with the tool the CLI was installed with. It runs in an interactive terminal and outside one alike: in CI, in a pipe, or typed by an AI agent.
- R-012 The system says the CLI is up to date, with its version, when PyPI has nothing newer.
- R-013 The system refuses `applika update`, with or without `--force`, when the API base URL is overridden. It names the URL in use, where it comes from (the flag, the environment variable or the saved session) and how to go back to the default.
- R-014 The system refuses `applika update`, with or without `--force`, when the CLI runs from a source or editable checkout, or when it cannot tell how the CLI was installed. It says why and what to run instead.
- R-015 The system refuses `applika update` without `--force` when `APPLIKA_DISABLE_AUTOUPDATE` is set, says so and names `--force`. With `--force` it updates. Ignoring that variable is the only thing `--force` does.
- R-016 The system lists every reason that blocks `applika update`, not only the first one.
- R-017 The system reports a failed check or install with the reason and the command to run by hand, and exits with an error.
- R-018 The system restarts the once-a-day clock after every `applika update` check.

### Reach

- R-019 The system ships the update to every CLI user, with no beta flag and no call to the Applika API, and it works signed out.
- R-020 The system keeps every installed CLI version working. The API never refuses an old CLI and never asks it to upgrade.

### Repository layout

- R-021 The system keeps the CV diff fixtures in the backend project's tests, beside its other test fixtures. The backend and frontend suites both read them from there.
- R-022 The system fails the frontend's CV diff fixture test, instead of skipping it, when the fixtures cannot be found.
- R-023 The system keeps the E2E runner in the frontend project, beside its E2E suite. The E2E stack definition stays at the repository root beside the dev stack.
- R-024 The system runs the E2E suite the same way locally and in CI from the runner's new place. CI still runs the backend and frontend jobs when the moved files change.
- R-025 The system leaves no `fixtures/` and no `scripts/` folder at the repository root. Current guides and contributor instructions point at the new places. Past planning documents, released changelog entries and agent notes keep their history.

## Permissions and tenancy

The update acts only on the user's own machine, with the user's own permissions. It never asks for elevated rights
and never installs for another user. It installs only the applika-cli package from PyPI, and it runs only the
installer the CLI was installed with. It sends nothing to the Applika API, carries no session or token, and works
whether the user is signed in or not. It does not change the saved session or the API base URL in it, so it changes
neither who the CLI signs in as nor whose data the CLI can reach. The repository move changes no access rule.

## Edge cases

- No network, or PyPI is down: the auto update stays silent; `applika update` says PyPI could not be reached.
- The installed version is newer than PyPI's, as with a local build: it counts as up to date.
- PyPI's latest version is a pre-release or not a plain version number: no auto update; `applika update` says it cannot compare the two.
- uv or pipx is no longer on the PATH: it counts as "cannot tell how it was installed".
- The user pinned a version at install: the installer keeps the pin; the auto update stays silent; `applika update` says the pin kept the old version and how to reinstall without it.
- Two terminals finish a command at the same moment: one updates, the other skips.
- The installer has no permission to write, as with a system Python: the auto update stays silent; `applika update` explains and prints the command to run by hand.
- Windows locks the files of the running CLI: the install fails like any other failure.
- The saved session points at a local API: the auto update stays off until the user signs out or signs in again against the default API.
- The update record on disk is missing, unreadable or damaged: the CLI treats it as never checked.
- A command fails: the auto update still runs after it, under the same rules.
- An AI agent types `applika update`: the CLI updates, and the agent's later commands in the same session run the new version.

## Non-goals

- Downgrading, choosing a version, or release channels for pre-releases.
- An Applika API route, a server-side version check, or the API refusing or nagging old CLIs (ADR-0009 Non-goal "Forcing users to upgrade the CLI").
- Updating CLIs older than the first version with this feature: their users upgrade by hand once.
- Installers other than uv tool, pipx and pip, standalone binaries, and package managers such as Homebrew or conda.
- A background service, a scheduled task, or an update while a command runs.
- Telemetry about updates.
- Moving `legacy/`, either compose file, or any other root item. Rewriting past plans, released changelog entries or agent notes.

## Success signals

- After the next CLI release, an interactive user of this version runs it within a day without doing anything.
- With an overridden URL, `applika update` prints the URL, its source and the way back, every time, with and without `--force`.
- No CLI test triggers an install, and no CI job or AI agent run installs anything unless it runs `applika update`.
- The backend and frontend suites both run all nine CV diff cases from the new folder, and the frontend suite fails when the folder is missing.
- The CI E2E job passes from the runner's new place.
- The repository root lists `backend`, `cli`, `docs`, `frontend`, `legacy` and the root files only.

## Assumptions

- "Interactive" means standard input, standard output and standard error are all terminals and `CI` is not set.
- `APPLIKA_DISABLE_AUTOUPDATE` turns updates off for any non-empty value except `0` and `false`.
- The default URL comparison ignores a trailing slash and the case of the scheme and host. Anything else, `http://applika.dev/api` included, counts as overridden.
- "Once a day" means 24 hours since the last check started, whether it succeeded or not.
- The check gives up after 3 seconds, the install after 120 seconds.
- The "Updated" line of the auto update goes to standard error, so command output stays clean.
- The update record lives next to the saved session, in the CLI's own config folder.
- The update installs whatever PyPI marks as latest. It never pins and never downgrades.
- A version the user pinned at install stays pinned.
- Windows gets the same flow. A locked file fails the install like any other failure.
- The update ships in the next CLI version the owner publishes, and the owner picks its number.
- "No gate, an exception" is the owner's exception to the beta-features rule for this feature only.
- The frontend fixture test reads the backend's folder through the repository checkout, as it reads the root folder today.
- The E2E runner keeps its commands, arguments and environment. Only its location changes.
