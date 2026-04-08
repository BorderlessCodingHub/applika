# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it when the project changes in ways that affect how to work here.**

Update when:
- A new UI pattern or component convention is established (e.g., a new reusable primitive)
- A new hook or service is added with non-obvious usage
- Authentication or token refresh behavior changes
- New environment variables become required
- The routing structure changes significantly
- A new form/validation convention replaces an existing one

Do NOT add:
- Implementation details already visible in the code
- Ephemeral task notes or in-progress work
- Anything already in git history or comments

---

## Commands

```bash
# Install dependencies
pnpm install

# Start dev server on port 8080
pnpm dev

# Production build (static export)
pnpm build

# Serve production build locally
pnpm start

# Run tests
pnpm test

# Run a single test file
pnpm test src/path/to/file.test.ts

# Lint
pnpm lint
pnpm lint-fix
```

---

## Architecture

This is a **Next.js 16 App Router** frontend (static export) for Applika.dev — a job application tracker. It communicates with a FastAPI backend running on port 8000.

### Routing

Route groups control access:
- `src/app/(public)/` — Unauthenticated pages (home, login)
- `src/app/(protected)/` — Auth-guarded pages (dashboard, applications, profile, admin)

Each protected route has a thin `page.tsx` shell that renders a `*-page.tsx` component containing the actual logic.

### Providers

Providers are split into two layers:

- **`RootProviders`** (`src/components/layout/root-providers.tsx`) — wraps the entire app in the root layout. Includes QueryClientProvider, ThemeProvider, AuthProvider, TooltipProvider, and Sonner.
- **`ProtectedProviders`** (`src/components/layout/protected-providers.tsx`) — wraps protected routes only. Adds a nested AuthProvider for protected-scope auth state.

The `(protected)/layout.tsx` wraps children with `ProtectedProviders` + `SupportsProvider` and redirects unauthenticated users to `/login`.

### Service Layer & DI

All HTTP calls go through typed service classes in `src/services/implementations/`. A singleton container at `src/services/services.ts` exposes them:

```typescript
import { services } from "@/services/services";
services.applications.getApplications();
services.companies.search(name);
```

The Axios instance in `src/lib/api-client.ts` handles cookie-based auth with `withCredentials: true`.

### Auth & Token Refresh

Authentication uses HTTP-only JWT cookies. Token refresh is handled via **polling in AuthContext** (not via Axios interceptor):

- Polls `services.auth.refresh()` using React Query's `refetchInterval`
- **10-minute interval** when authenticated
- **30-second interval** on failure (for reconnection)
- Polls in background (`refetchIntervalInBackground: true`)

User profile is fetched separately via `useUserProfile()` only after auth succeeds.

### State Management

- **Server state**: TanStack React Query with a 5-minute stale time and `retry: false`
- **Auth state**: `AuthContext` (wraps the entire app via `RootProviders`)
- **Supports data**: `SupportsContext` — shared lookup data (platforms, step definitions, feedback definitions) available via `useSupports()`
- **Feature state**: custom hooks in `src/hooks/` (e.g., `useApplications`, `useApplicationSteps`)

Mutations always call `queryClient.invalidateQueries()` on success and show a `sonner` toast on error.

### Forms

All forms use **React Hook Form + Zod**:

```typescript
const schema = z.object({ field: z.string().min(1, "Required") });
type FormValues = z.infer<typeof schema>;
const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { ... } });
```

- Show inline error messages below each field using `form.formState.errors.field?.message`
- Highlight invalid fields with `cn(error && "border-destructive focus-visible:ring-destructive")`
- Trigger validation on Select/custom inputs with `form.setValue("field", value, { shouldValidate: true })`

### Date Inputs

**Always use `<DatePickerInput>` from `src/components/ui/date-picker.tsx`** — never `<input type="date">`.

The component avoids browser timezone off-by-one issues by parsing dates as local time. It accepts `value` as a `Date | string | undefined` and returns a `Date` via `onChange`.

### UI Components

Built on shadcn/ui (Radix UI + Tailwind). Components live in `src/components/ui/`. Use `cn()` from `src/lib/utils` for conditional class merging.

`SheetContent` accepts a `hideClose` prop to suppress the default X button when a Cancel button is preferred inside the form.

---

## Key Files

| File | Purpose |
|---|---|
| `src/services/services.ts` | Service DI container (single import point for all API calls) |
| `src/lib/api-client.ts` | Axios instance with cookie auth (`withCredentials`) |
| `src/lib/query-client.ts` | React Query configuration |
| `src/contexts/auth-context.tsx` | Auth state + polling-based token refresh |
| `src/contexts/supports-context.tsx` | Shared lookup data (platforms, steps, feedbacks) |
| `src/components/layout/root-providers.tsx` | Root-level providers (QueryClient, Theme, Auth, Tooltip, Sonner) |
| `src/components/layout/protected-providers.tsx` | Protected-route providers (nested AuthProvider) |
| `src/hooks/use-applications.ts` | Application list, client-side filtering, CRUD mutations |
| `src/components/ui/date-picker.tsx` | Timezone-safe date picker (use instead of `<input type="date">`) |

---

## Docker

The frontend is built as a static export and served via Nginx:

- **Dockerfile**: `docker/Dockerfile` — multi-stage build (Node 22 + Nginx 1.27, non-root user)
- **Nginx config**: `docker/nginx.conf` — SPA routing, gzip, static asset caching
- **Build arg**: `API_BASE_URL` is baked into the JS bundle at build time via `NEXT_PUBLIC_API_BASE_URL`

```bash
docker compose up --build
```

The `docker-compose.yml` defaults `API_BASE_URL` to `http://127.0.0.1/api` if not set in the environment.

---

## MCP Usage

Use available MCP servers when possible — prefer them over bash equivalents.

- **Git MCP**: use for all git operations (`git_add`, `git_commit`, `git_diff`, etc.). Commit after each logical unit of work using conventional commits (`feat(frontend):`, `fix(frontend):`, etc.)
- **Context7 MCP**: look up docs for Next.js, React Query, Zod, react-hook-form, shadcn/ui before guessing API signatures

---

## Backend Context

The backend is a FastAPI app in `../backend/` with its own `CLAUDE.md`. It runs on port 8000. Auth uses HTTP-only JWT cookies (`__access`). GitHub OAuth is the only login method. See `../backend/CLAUDE.md` for backend-specific guidance.
