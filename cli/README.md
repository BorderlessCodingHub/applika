# applika-cli

Track your job applications on [Applika.dev](https://applika.dev) from the
terminal — and let your AI assistant do it for you.

```bash
applika applications new --company "Stripe" --role "Backend Engineer" \
  --platform LinkedIn --mode active --date 2026-11-08
```

## Install

Requires Python 3.10 or newer.

```bash
uv tool install applika-cli     # or: pipx install applika-cli
```

This gives you the `applika` command. It keeps itself up to date (see
[Updates](#updates)).

## Sign in

```bash
applika login
```

Your browser opens on the Borderless sign-in page; once you sign in, the
terminal picks the session up by itself. Each sign-in shows up as a device in
your profile's **Devices** tab on the website, where you can revoke it.

| Situation | Command |
|---|---|
| The browser is on another machine | `applika login --manual` — paste the code it shows |
| No browser at all (SSH, containers) | `applika login --device` — approve a short code from any signed-in browser |
| Name this device | `applika login --device-name "Work laptop"` |
| Check who you are | `applika whoami` |
| Sign out | `applika logout` |

## Everyday use

```bash
# Your applications (filter with --search, --mode, --status, --platform, --from, --to)
applika applications list
applika applications list --search stripe --output-format json

# Log a new one
applika applications new --company "Stripe" --role "Backend Engineer" \
  --platform LinkedIn --mode active --date 2026-11-08

# Change it (only the flags you pass change; --clear <field> empties one)
applika applications edit <id> --role "Staff Engineer"

# Record what happened
applika applications timeline add <id> --type interview \
  --interview-type technical --date 2026-11-12 --start-time 14:00 --end-time 15:00

# Close it with an offer or a denial — or with no outcome at all
applika applications finalize <id> --outcome offer \
  --salary 180000 --currency USD --period annually
applika applications finalize <id> --outcome denied --reason skills_mismatch
applika applications finalize <id>

# Changed your mind? Closing is reversible
applika applications reopen <id>
```

`<id>` is the `id` field from `applications list --output-format json`.
Every command explains its flags with `--help`.

### Applications

- `--mode` is `active` (you applied) or `passive` (a recruiter reached out).
- Salary fields (`--expected-salary`, `--salary-min`, `--salary-max`) need
  `--currency` and `--salary-period` too.
- `new` and `edit` also accept the whole application as a file:
  `--file application.json` (JSON or YAML, `-` for stdin). Add the job posting
  with `--job-description` or `--job-description-file jd.md`.

### Timeline

Each event is an `interview`, an `offer` or a `denied`.

```bash
applika applications timeline list <id>
applika applications timeline add <id> --type interview --date 2026-11-12
applika applications timeline edit <id> <event-id> --observation "Went well"
applika applications timeline delete <id> <event-id>
```

- Interview types: `unknown` (default), `initial_screening`, `technical`,
  `cultural`, `hiring_manager`, `take_home`, `final`.
- An offer needs `--salary`, `--currency` and `--period` (`monthly` or `annually`).
- Adding an offer or a denial also closes the application, unless you pass
  `--keep-open`.
- A closed application's timeline can't be edited until you `reopen` it.

## Use it from your AI assistant

```bash
applika skill
```

Installs a skill that teaches Claude Code, Codex, Gemini or OpenCode how to use
this CLI. Then just ask: *"log my application to Stripe for the backend role"*.
Use `--local` to install it in the current project only, `--force` to replace
an older copy.

## CVs (beta)

Master CVs (`applika cvs`) and an application's tailored CV copy
(`applika applications cv`) are part of the CV builder beta on Applika.dev.
They don't appear in `applika --help`; if you're in the beta, see
`applika cvs --help` and `applika applications cv --help`. Without beta
access these commands answer `Not Found`.

## Updates

Once a day, after a command finishes, `applika` checks PyPI and installs a
newer version with the tool you installed it with. It prints one line when it
does, and never changes a command's output or exit code. It stays off in CI,
in pipes and scripts, and when you point the CLI at another API.

```bash
applika update                       # update right now
export APPLIKA_DISABLE_AUTOUPDATE=1  # turn the daily check off
applika version                      # installed vs. latest version
```

## Configuration

| | |
|---|---|
| `--api-base-url URL` / `APPLIKA_API_BASE_URL` | Use another API (default `https://applika.dev/api`) |
| `APPLIKA_DISABLE_AUTOUPDATE` | Turn the daily update off |
| `~/.config/applika/session.json` | Where your session is stored |

Exit codes: `0` success · `1` the API refused the request (its message is
printed) · `2` invalid input, nothing was sent.

## Development

```bash
git clone https://github.com/BorderlessCodingHub/applika.git
cd applika/cli
uv sync
uv run applika --help
make test && make lint && make format
```

`uv tool install --force --editable .` points your global `applika` at the
checkout. Changes are listed in
[CHANGELOG.md](https://github.com/BorderlessCodingHub/applika/blob/develop/cli/CHANGELOG.md).

## License

MIT
