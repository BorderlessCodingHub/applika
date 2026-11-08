# Applika.dev — Frontend

The Applika.dev web app. Built with Next.js as a **static export** and served
by nginx; it talks to the [backend](../backend/README.md) API with cookie
sessions. In English and Brazilian Portuguese.

## Run it

You need Node.js 22 and pnpm 10, and a running API. The quickest API is the
root stack without its `web` service:

```bash
docker compose up -d --wait api worker scheduler   # from the repository root
```

Then, in this folder:

```bash
echo "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api" > .env.local
pnpm install
pnpm dev                                           # http://127.0.0.1:8080
```

## Commands

| Command                                              |                                   |
| ---------------------------------------------------- | --------------------------------- |
| `pnpm dev`                                           | Development server on port 8080   |
| `pnpm build`                                         | Static export to `out/`           |
| `pnpm test`                                          | Unit and component tests (Vitest) |
| `pnpm lint` · `pnpm format:check` · `pnpm typecheck` | Checks                            |
| `./scripts/e2e.sh`                                   | End-to-end tests (below)          |

Before a pull request: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`.
`make front-gate` from the repository root runs the same checks without the build.

## End-to-end tests

Playwright runs against the real stack — the built API and web images, a real
Postgres and Redis, and a fake Borderless sign-in. Nothing is mocked.

```bash
./scripts/e2e.sh                       # start the stack, seed it, test, tear it down
./scripts/e2e.sh e2e/smoke.spec.ts     # one spec (arguments go to playwright test)
KEEP_STACK=1 ./scripts/e2e.sh          # keep the stack up to debug
```

`pnpm e2e` alone won't work: the specs need the users the script seeds.

## Build settings

Values are baked into the bundle at build time, so changing one needs a
rebuild. With Docker they are build arguments (`docker/Dockerfile`); in
development they go in `.env.local`.

| Build argument       | Variable in the app              | Default                                         |
| -------------------- | -------------------------------- | ----------------------------------------------- |
| `API_BASE_URL`       | `NEXT_PUBLIC_API_BASE_URL`       | —                                               |
| `BORDERLESS_SIGN_UP` | `NEXT_PUBLIC_BORDERLESS_SIGN_UP` | `https://platform.borderlesscoding.com/sign-up` |
| `APPLIKA_CLI`        | `NEXT_PUBLIC_APPLIKA_CLI`        | `https://pypi.org/project/applika-cli/`         |

## Where things are

```
src/
├── app/            # pages: (public)/ landing, cookie policy, /cli
│                   #        (protected)/ everything behind sign-in
│                   #        login/, cli/code/ — no app shell
├── components/     # UI by feature; ui/ holds the shadcn/ui primitives
├── hooks/          # data fetching and mutations (TanStack Query)
├── services/       # typed API clients
├── i18n/messages/  # en.json and pt-BR.json — every visible word
└── lib/            # API client and helpers
e2e/                # Playwright specs
```

- Every word on screen comes from `src/i18n/messages/`; lint fails on literal
  text in JSX.
- Pages behind a beta feature are wrapped in `<FeatureGate feature="…">` and
  render "page not found" for users without it.

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack
Query, React Hook Form + Zod, next-intl, Vitest, Playwright.

More detail on each area: [CLAUDE.md](CLAUDE.md).
