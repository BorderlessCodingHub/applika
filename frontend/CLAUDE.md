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

The `(protected)/layout.tsx` wraps children with `AuthProvider` + `SupportsProvider` and redirects unauthenticated users to `/login`.

### Service Layer & DI

All HTTP calls go through typed service classes in `src/services/implementations/`. A singleton container at `src/container/services.ts` exposes them:

```typescript
import { services } from "@/container/services";
services.applications.getApplications();
services.companies.search(name);
```

The Axios instance in `src/lib/api-client.ts` handles cookie-based auth with automatic silent token refresh on 401 (queues requests while refreshing).

### State Management

- **Server state**: TanStack React Query with a 5-minute stale time and `retry: false`
- **Auth state**: `AuthContext` (wraps the entire app)
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
| `src/container/services.ts` | Service DI container (single import point for all API calls) |
| `src/lib/api-client.ts` | Axios instance with cookie auth + silent token refresh |
| `src/lib/query-client.ts` | React Query configuration |
| `src/contexts/auth-context.tsx` | Auth state + user query |
| `src/contexts/supports-context.tsx` | Shared lookup data (platforms, steps, feedbacks) |
| `src/hooks/use-applications.ts` | Application list, client-side filtering, CRUD mutations |
| `src/components/ui/date-picker.tsx` | Timezone-safe date picker (use instead of `<input type="date">`) |

---

## MCP Usage

Use available MCP servers when possible — prefer them over bash equivalents.

- **Git MCP**: use for all git operations (`git_add`, `git_commit`, `git_diff`, etc.). Commit after each logical unit of work using conventional commits (`feat(frontend):`, `fix(frontend):`, etc.)
- **Context7 MCP**: look up docs for Next.js, React Query, Zod, react-hook-form, shadcn/ui before guessing API signatures

---

## Backend Context

The backend is a FastAPI app in `../backend/` with its own `CLAUDE.md`. It runs on port 8000. Auth uses HTTP-only JWT cookies (`__access` + `__refresh`). GitHub OAuth is the only login method. See `../backend/CLAUDE.md` for backend-specific guidance.
