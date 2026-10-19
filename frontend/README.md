# Applika.dev - Frontend

The Applika.dev web app: built with Next.js 16 (App Router) as a **static export** and served by
nginx. It talks to the FastAPI backend with cookie-based sessions (GitHub OAuth). In production the
two share the host `applika.dev`: Traefik sends `/api` to the API and everything else to this app
([docs/infrastructure.md](../docs/infrastructure.md)).

## Project Structure

```
frontend/
├── docker/                 # Dockerfile (Node 22 build + nginx 1.27) and nginx.conf
├── e2e/                    # Playwright specs, run against the real stack
├── public/                 # Static files
├── scripts/e2e.sh          # Brings the E2E stack up, seeds it, runs Playwright, tears it down
├── src/
│   ├── app/                # App Router pages
│   │   ├── (public)/       # Landing page, cookie policy
│   │   ├── (protected)/    # Signed-in pages: dashboard, applications, agenda, cvs, jobs,
│   │   │                   #   reports, cycles, profile, device, admin
│   │   ├── login/          # Sign-in page (no shell)
│   │   └── cli/code/       # Shows a CLI sign-in code to paste (no session)
│   ├── components/         # UI by feature (applications, timeline, base-cvs, tailored-cvs,
│   │                       #   jobs, agenda, admin, profile, features…) + ui/ (shadcn/ui)
│   ├── contexts/           # Auth and shared lookup data
│   ├── hooks/              # Data fetching and mutations (TanStack Query)
│   ├── lib/                # Axios client, query client, utilities
│   ├── services/           # Typed API service classes + the DI container
│   └── test/               # Vitest setup
└── playwright.config.ts, vitest.config.ts, next.config.ts
```

## Prerequisites

- Node.js 22
- pnpm 10 (`packageManager` in `package.json`)

## Environment Setup

Create `.env.local` in this folder:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
```

The value is baked into the bundle at build time. The API must allow the app's origin
(`http://127.0.0.1:8080`) in `CORS_ORIGINS`; the root `docker-compose.yml` already does.

## Running

The quickest backend is the root compose stack without its `web` service:

```bash
docker compose up -d --wait api worker scheduler   # from the repository root
cd frontend
pnpm install
pnpm dev                                          # http://127.0.0.1:8080
```

## Available Scripts

| Command             | Description                                   |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | Development server on port 8080               |
| `pnpm build`        | Production build (static export to `out/`)    |
| `pnpm start`        | Serve the built `out/` locally on port 8080   |
| `pnpm test`         | Unit and component tests (Vitest, jsdom)      |
| `pnpm test:watch`   | Vitest in watch mode                          |
| `pnpm lint`         | ESLint                                        |
| `pnpm lint-fix`     | ESLint with auto-fix                          |
| `pnpm format`       | Prettier, write                               |
| `pnpm format:check` | Prettier, check                               |
| `pnpm typecheck`    | `tsc --noEmit`                                |
| `./scripts/e2e.sh`  | Playwright against the real stack (see below) |

The gate for a change to `develop`:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

## E2E tests

Playwright drives the **real** stack: the built API image, this app built and served by nginx, a
real Postgres migrated with `alembic upgrade head` and a real Redis (`docker-compose.e2e.yml` at
the repository root). Nothing is mocked.

```bash
./scripts/e2e.sh                       # up -> seed -> test -> down
./scripts/e2e.sh e2e/smoke.spec.ts     # arguments go to `playwright test`
KEEP_STACK=1 ./scripts/e2e.sh          # leave the stack up to debug
```

`pnpm e2e` alone does not work: the specs need the users and sessions `scripts/e2e.sh` seeds.

## Docker

```bash
docker compose up --build              # this folder's own stack; the root compose supersedes it
```

`docker/Dockerfile` is a multi-stage build (Node 22 builds the export, nginx 1.27 serves it as a
non-root user, with SPA routing, gzip and long-lived caching for static assets). The `API_BASE_URL`
build argument becomes `NEXT_PUBLIC_API_BASE_URL` in the bundle; `frontend-cd.yaml` sets it for
production.

## Beta features

Features in beta are hidden from users who are not on their beta list
([ADR-0018](../docs/adr/0018-beta-features-registry-and-allowlist.md)). The API is the rule (a
gated route answers 404); the web only follows it:

- `useHasFeature(key)` and `useMyFeatures()` (`src/hooks/use-features.ts`) read
  `GET /users/me/features`;
- `<FeatureGate feature="…">` (`src/components/features/`) renders the page, or the app's
  "page not found";
- a nav item with `feature` (`src/components/layout/nav.ts`) shows only with that feature, marked
  "Beta" while it is in beta.

Gated today: `cvs` (CV builder, CV copies, drafts) and `jobs` (job board).

## Tech Stack

| Category  | Technology                                       |
| --------- | ------------------------------------------------ |
| Framework | Next.js 16 (App Router, static export), React 19 |
| Language  | TypeScript                                       |
| Styling   | Tailwind CSS 4 + shadcn/ui (Radix UI, new-york)  |
| State     | TanStack Query 5 + React Context                 |
| Forms     | React Hook Form + Zod                            |
| HTTP      | Axios (cookie sessions, `withCredentials`)       |
| Charts    | Recharts                                         |
| Testing   | Vitest + Testing Library, Playwright             |
| Linting   | ESLint + Prettier                                |

## Architecture Notes

- Exported as static HTML/JS/CSS: no Node.js server in production.
- Sessions are HTTP-only cookies set by the API. `AuthContext` refreshes them by polling (every
  10 minutes, every 30 seconds after a failure); a 429 or 503 is retried, never a sign-out.
- Protected routes send signed-out users to `/login`.
- Every API call goes through a typed service class in the DI container (`src/services/services.ts`).
- Only `NEXT_PUBLIC_*` variables reach the browser.
- More detail on each area lives in [`CLAUDE.md`](CLAUDE.md).
