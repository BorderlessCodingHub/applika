# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this CLI.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it when the CLI changes in ways that affect how you work here.**

Update when:
- A new command group or handler structure is introduced
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
make help

# Run linter with auto-fix
make lint

# Run formatter
make format

# Run tests
make test
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

## Structure

- `src/main.py` keeps the entrypoint small
- `src/cli_parser.py` owns argparse setup
- `src/auth_commands.py` owns login/logout flows
- `src/applications/` owns application-specific command logic
- `src/session.py` owns local session persistence
- `src/api.py` owns HTTP client behavior

Keep new feature-specific logic grouped by feature instead of expanding `main.py`.
