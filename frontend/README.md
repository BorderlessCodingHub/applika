# Applika.dev v2 - Frontend

Job application tracker built with Next.js 16, App Router, and static export. Communicates with a FastAPI backend via cookie-based JWT authentication (GitHub OAuth).

## Project Structure

```
frontend/
├── docker/              # Docker configuration
│   ├── Dockerfile       # Multi-stage build (Node + Nginx)
│   └── nginx.conf       # Nginx config with SPA routing and caching
├── public/              # Static files
│   └── images/          # Image assets
├── src/
│   ├── app/             # Next.js App Router pages
│   │   ├── (public)/        # Unauthenticated pages (home, login)
│   │   └── (protected)/     # Auth-guarded pages
│   │       ├── admin/           # Admin panel
│   │       ├── applications/    # Application tracking
│   │       ├── dashboard/       # Dashboard & statistics
│   │       ├── profile/         # User profile
│   │       └── reports/         # Daily reports
│   ├── components/      # UI components (by feature + shared)
│   │   ├── admin/
│   │   ├── applications/
│   │   ├── dashboard/
│   │   ├── landing/
│   │   ├── layout/          # App layout, root & protected providers
│   │   ├── profile/
│   │   ├── reports/
│   │   └── ui/              # shadcn/ui primitives (Radix + Tailwind)
│   ├── contexts/        # React contexts
│   │   ├── auth-context.tsx     # Auth state & polling-based token refresh
│   │   └── supports-context.tsx # Shared lookup data
│   ├── hooks/           # Custom hooks (data fetching & mutations)
│   ├── lib/             # Utilities, Axios client, React Query config
│   ├── services/        # Service layer (DI pattern)
│   │   ├── implementations/    # Concrete API service classes
│   │   ├── interfaces/         # Service contracts
│   │   ├── types/              # Request/response types
│   │   └── services.ts         # Singleton DI container
│   └── test/            # Test utilities
```

## Prerequisites

- Node.js 22 or higher
- pnpm (latest version recommended)

## Environment Setup

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
```

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Run the development server:
```bash
pnpm dev
```

3. Build for production:
```bash
pnpm build
```

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server on port 8080 |
| `pnpm build` | Create production build (static export to `out/`) |
| `pnpm start` | Serve production build locally on port 8080 |
| `pnpm test` | Run tests with Vitest |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Run ESLint |
| `pnpm lint-fix` | Run ESLint with auto-fix |

## Docker

The project includes a multi-stage Docker build (Node.js build + Nginx) and Docker Compose:

```bash
docker compose up --build
```

The `API_BASE_URL` build argument defaults to `http://127.0.0.1/api` and is baked into the static bundle at build time. Override it by setting `NEXT_PUBLIC_API_BASE_URL` in your environment before building.

The Nginx image runs as a non-root user with gzip compression, SPA routing, and long-lived caching for static assets.

## Accessing the Application

After starting the development server or Docker container, the application will be available at:

- **Dev server:** [http://127.0.0.1:8080](http://127.0.0.1:8080)
- **Docker:** [http://127.0.0.1:8080](http://127.0.0.1:8080)

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16 (App Router, static export) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui (Radix UI) |
| State | TanStack React Query + React Context |
| Forms | React Hook Form + Zod |
| HTTP | Axios (cookie-based JWT auth) |
| Charts | Recharts |
| Testing | Vitest + Testing Library |
| Linting | ESLint + Prettier |

## Architecture Notes

- The app is exported as static HTML/JS/CSS — no Node.js server in production
- Authentication uses HTTP-only JWT cookies with GitHub OAuth
- Token refresh is handled via polling in AuthContext (10-min interval when connected, 30-sec on failure)
- Protected routes redirect unauthenticated users to `/login`
- All API calls go through typed service classes with a DI container (`src/services/services.ts`)
- Environment variables must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser
