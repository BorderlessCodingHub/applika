# ADR-0023: applika-cli updates itself from PyPI

**Status:** Accepted by LuisMSoares on 2026-10-19 · **Date:** 2026-10-19 · **Deciders:** LuisMSoares

## Context

PRD 0017. The owner: "add a daily auto update to the cli and a command "applika update" to update the cli to the
latest version automatically, same how claude cli does, if the api base url have been overriden, the auto update must
be disabled and if the user runs "applika update" even with "--force" the cli must explain why it cannot complete the
operation". In the grilling he chose "Install silently", "Any non-default URL", "Env var + safe skips" and "No gate,
an exception". He then chose "Allow it when typed": only the daily auto update skips non-interactive runs.

Users run `applika-cli` from PyPI and do not upgrade in lockstep with the API (`.claude/rules/cli-compatibility.md`).
Today `applika version` reads `https://pypi.org/pypi/applika-cli/json` and prints the installed and published
versions. No code updates the CLI. The CLI resolves its API base URL from the flag, then `APPLIKA_API_BASE_URL`, then
the saved session (`~/.config/applika/session.json`), then the default `https://applika.dev/api`.

This needs an ADR because the CLI starts to run an external installer on the user's machine after every command, keeps
a new state file, and makes an exception to ADR-0018.

## Decision

- **Source.** The latest version is `info.version` from the PyPI JSON above. No Applika API call. Versions are compared
  by their numeric release parts only (`X.Y.Z`). When either side is not a plain version number, nothing is
  installed. No new dependency is added: no `packaging`.
- **Install method,** detected in this order. (1) The `applika-cli` distribution's `direct_url.json` (PEP 610) says
  editable or points at a local `file:` URL: this is a source checkout and is never updated. (2) `uv-receipt.toml`
  sits in `sys.prefix` and `uv` is on the PATH: `uv tool upgrade applika-cli`. (3) `pipx_metadata.json` sits in
  `sys.prefix` and `pipx` is on the PATH: `pipx upgrade applika-cli`. (4) The distribution's `INSTALLER` reads `pip`:
  `<sys.executable> -m pip install --upgrade applika-cli`, plus `--user` when the package sits in the user site.
  (5) Anything else is unknown, and nothing is installed. Commands are fixed argument lists run without a shell, and
  no string read from PyPI ever goes into them. Success means the installer exits 0 and a fresh interpreter reads
  the new version.
- **Gates,** checked in this order: the API base URL in use is not the default (a trailing slash and the case of the
  scheme and host are ignored); not an interactive terminal (stdin, stdout and stderr are all TTYs and `CI` is
  unset), **auto mode only**; a source checkout; an unknown install method; `APPLIKA_DISABLE_AUTOUPDATE` set to any
  non-empty value except `0` and `false`. Every other gate applies to both paths.
- **Auto mode.** It runs after any command except `update`. It runs only when no gate blocks and 24 hours have passed
  since the last check started. Its state is `~/.config/applika/update.json` (`checked_at`, `latest_version`), next
  to the session and written atomically. `checked_at` is written before the network call, so a failure waits a day.
  A missing or damaged file means "due". A lock (`update.lock`, created exclusively, stale after 10 minutes) lets
  only one process update; any other process skips. The check gives up after 3 seconds and the install after 120.
  The installer's output is captured and never shown. On success, one line goes to stderr:
  `Updated applika-cli <old> → <new>`. Every failure is silent, Ctrl-C included, and the command's exit status never
  changes.
- **`applika update [--force]`.** It does not check for an interactive terminal: typed, it runs in CI, in a pipe and
  from an AI agent. It runs the other gates, prints one reason per blocking gate, and exits 1. The
  overridden-URL reason names the URL, its source (flag, environment variable or saved session) and the way back.
  `--force` only lifts the `APPLIKA_DISABLE_AUTOUPDATE` gate. Otherwise the command checks PyPI at once, installs,
  and reports up to date, updated, or failed with the command to run by hand. Each check restarts the daily clock.
- **Beta exception (exception to the ADR-0018 Consequence "Every later user-facing feature adds a `FeatureKey`
  member, a seed row and `require_feature` on its routes").** The owner chose "No gate, an exception" on 2026-10-19.
  The feature has no `FeatureKey`, no seed row, no route and no API call. ADR-0018 holds for every other feature.

## Consequences

- The API is unchanged. ADR-0009's Non-goal "Forcing users to upgrade the CLI" still holds: the update runs on the
  client, users opt out with one variable, and old versions keep working.
- Only users who install this version by hand get later versions automatically. Every version published before it
  stays manual.
- A bad or compromised PyPI release reaches interactive users within a day. Publishing stays the job of
  `.github/workflows/cli-cd.yaml` on a push to `main`. The way to roll back is to publish a higher, fixed version,
  because the update never downgrades.
- An AI agent or a script that types `applika update` can replace the CLI in the middle of a session. The owner
  accepted this trade for scripts.
- The install-method markers are installer internals. If one changes, that install becomes "unknown", and the CLI
  installs nothing.
- On Windows the running CLI's files can be locked. The install then fails like any other failure, and
  `applika update` prints the command to run by hand.

## Non-goals

- Downgrades, version pinning from the CLI, and pre-release channels.
- A server-side version check or minimum version. A background service or a scheduled task.
- Installers other than uv tool, pipx and pip.
- Telemetry about updates.
