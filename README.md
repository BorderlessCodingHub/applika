# Applika.dev

A job application tracker for active job seekers. Log every application,
follow its timeline (interviews, offers, denials), see your statistics and
agenda, and file biweekly reports — from the web or from the terminal.

**Use it:** <https://applika.dev> · **CLI:** [`applika-cli` on PyPI](https://pypi.org/project/applika-cli/)

## What's in this repository

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend/README.md) | The API and its background worker | Python 3.14, FastAPI, PostgreSQL, Redis, taskiq |
| [`frontend/`](frontend/README.md) | The web app | Next.js 16 (static export), React 19, Tailwind 4 |
| [`cli/`](cli/README.md) | `applika`, the command-line client | Python 3.10+, Typer |
| [`docs/`](docs/) | Product requirements, architecture decisions, plans, infrastructure | |

## Run it locally

You need Docker. Everything else runs in containers.

```bash
cp .env.example .env
make run-fake-auth      # a fake Borderless sign-in; prints the .env values to paste
make up-build           # api, web, worker, scheduler, Postgres and Redis
```

- Web app: <http://127.0.0.1:8080>
- API docs: <http://127.0.0.1:8000/api/docs>

Sign-in goes through [Borderless](https://borderlesscoding.com). Locally, the
fake Borderless stands in for it: paste the values `make run-fake-auth` prints
into `.env`, run `make up` again, and sign in with one of the accounts in
`backend/tests/fixtures/borderless/accounts.json`.

```bash
make stop               # stop the stack, keep the data
make stop-fake-auth     # stop the fake Borderless
docker compose down -v  # remove everything, database included
make help               # every target
```

### Working on the web app

The web app is a static export, so the stack only shows a frontend change
after a rebuild. For a fast loop, run the frontend on your machine instead:

```bash
docker compose up -d --wait api worker scheduler
cd frontend && pnpm install && pnpm dev     # http://127.0.0.1:8080
```

Set `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api` in `frontend/.env.local`.

### Behind a tunnel or a custom domain

Set the public URLs in `.env` together — `API_BASE_URL`, `CORS_ORIGINS`,
`WEB_SIGNIN_URI`, `BORDERLESS_REDIRECT_URI` and the others listed in
`.env.example` — then rebuild with `make up-build`.

## Beta features

New features start in beta and are visible only to the users on their beta
list (admins see them too). Today: the CV builder (`cvs`) and the job board
(`jobs`). Manage them in the web app at **Admin → Features**. Releasing one to
everyone is a click there, not a deploy.

## Checks before a pull request

```bash
make full-gate      # secrets scan, then backend, frontend, CLI and end-to-end tests
```

Or one part at a time: `make api-gate`, `make front-gate`, `make cli-gate`,
`make e2e-gate`, `make leaks`.

Work goes to `develop`; merging `develop` into `main` is a release.
Database migrations never drop a column or table
([ADR-0005](docs/adr/0005-non-destructive-migrations.md)).

## Documentation

- [docs/infrastructure.md](docs/infrastructure.md) — how production fits together
- [docs/prd/](docs/prd/) — product requirements ([0000](docs/prd/0000-product-vision.md) is the vision)
- [docs/adr/](docs/adr/) — architecture decisions
- [docs/plan/](docs/plan/) — technical plans per feature
- [docs/error-codes.md](docs/error-codes.md) — every API error code
- Changelogs: [backend](backend/CHANGELOG.md), [CLI](cli/CHANGELOG.md)

See also [CONTRIBUTORS.md](CONTRIBUTORS.md) and [SECURITY.md](SECURITY.md).
