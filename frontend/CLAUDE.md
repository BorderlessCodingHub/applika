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

# Unit / component tests (vitest, jsdom)
pnpm test
pnpm test:watch
pnpm test src/path/to/file.test.ts   # a single file

# Lint / format / types
pnpm lint
pnpm lint-fix
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
pnpm typecheck       # tsc --noEmit
```

### The gate

A PR to `develop` is ready only when the whole chain is green
(`.claude/rules/quality-gates.md`):

```bash
pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build
```

`pnpm lint` currently emits warnings on pre-existing files (React Compiler vs.
`react-hook-form`'s `watch()`, and an unused local in `step-form-dialog.tsx`).
Warnings do not fail the gate; errors do. Do not add new ones.

### E2E

Playwright drives the REAL stack — the built API image, the built static
frontend behind nginx, a real Postgres migrated with `alembic upgrade head` and
a real Redis. Nothing is mocked, and there is no `webServer` block.

```bash
../scripts/e2e.sh                          # full run: up -> seed -> test -> down
../scripts/e2e.sh e2e/smoke.spec.ts        # args are forwarded to `playwright test`
KEEP_STACK=1 ../scripts/e2e.sh             # leave the stack up to debug
```

`pnpm e2e` on its own will NOT work: `e2e/support/auth.ts` needs the `E2E_*`
variables that `scripts/e2e.sh` exports after seeding the real users. The suite
runs serially (`workers: 1`) against one shared real database, so specs must be
read-only or clean up after themselves.

---

## Architecture

This is a **Next.js 16 App Router** frontend (static export) for Applika.dev — a job application tracker. It communicates with a FastAPI backend running on port 8000.

### Routing

Route groups control access:

- `src/app/(public)/` — Unauthenticated pages (home, login)
- `src/app/(protected)/` — Auth-guarded pages (dashboard, applications, profile, admin)

Each protected route has a thin `page.tsx` shell that renders a `*-page.tsx` component containing the actual logic.

`/login` lives at `src/app/login/`, OUTSIDE the `(public)` group, so it renders no landing header or footer. The URL is unchanged.

### Providers

Providers are split into two layers:

- **`RootProviders`** (`src/components/layout/root-providers.tsx`) — wraps the entire app in the root layout. Includes QueryClientProvider, ThemeProvider, AuthProvider, TooltipProvider, and Sonner.
- **`ProtectedProviders`** (`src/components/layout/protected-providers.tsx`) — wraps protected routes only. Adds a nested AuthProvider for protected-scope auth state.

The `(protected)/layout.tsx` wraps children with `ProtectedProviders` + `SupportsProvider` + `CycleProvider`, redirects unauthenticated users to `/login`, and renders everything inside `<AppShell>` (see **App shell** below).

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

Built on shadcn/ui (Radix UI + Tailwind, `new-york` style, the unified `radix-ui`
package). Components live in `src/components/ui/`. Use `cn()` from `src/lib/utils`
for conditional class merging.

Tailwind 4 is CSS-first: every token lives in `@theme` in `src/app/globals.css`.
There is no `tailwind.config.ts`.

**`cn()` and custom utilities.** `shadow-card` and `shadow-elevated` are custom
`@utility` rules, so stock tailwind-merge does not know they are shadows and
would keep BOTH sides of an override — leaving the loser to win on stylesheet
order. `src/lib/utils.ts` registers them in the `shadow` group via
`extendTailwindMerge`. **Any new custom `@utility` that competes with a built-in
Tailwind group must be registered there too**, or overriding it will silently do
nothing.

Registering a utility in one group also takes it OUT of the group it was falling
through to. `shadow-card`/`shadow-elevated` used to land in `shadow-color`, so a
`shadow-<color>` class no longer conflicts with them. Nothing in `src/` uses a
shadow-color class today; if one is ever added, a later `shadow-card` will not
override it.

**`SheetContent` props (applika-only, kept across the new-york regeneration):**

- `hideClose` — suppress the default X button when the panel owns its own
  Cancel/Submit footer.
- `size?: "form" | "nav"` — the width/padding preset, default `"form"`.
  `"form"` is `w-full p-6 sm:max-w-2xl`, the wide form panel every sheet in the
  app uses; `"nav"` is `w-[17rem] gap-0 p-0 sm:max-w-[17rem]`, the mobile
  navigation panel. The preset is applied AFTER `className`, so a caller cannot
  widen or pad a sheet from the outside — add a preset here instead.

**Fonts.** `font-display` is the heading family (Inter, self-hosted via
`next/font`); `font-numeric` is the `@utility` in `globals.css` that switches a
run of digits to JetBrains Mono with tabular, slashed-zero figures. Use
`font-numeric` for headline metrics, counts and table numbers so columns line
up; use `font-display` for headings and titles. Never mix the two on one element.

**Stacking contract.** Layers, lowest first. Keep new chrome inside it:

| z      | layer                               | members                                                               |
| ------ | ----------------------------------- | --------------------------------------------------------------------- |
| `z-30` | in-column sticky chrome             | the shell `Header`                                                    |
| `z-40` | fixed/sticky page chrome, no portal | `LandingHeader`, `CookieConsent`                                      |
| `z-50` | the Radix portal layer              | Sheet overlay/content, Dialog, DropdownMenu, Popover, Tooltip, Sonner |

`CookieConsent` MUST stay at `z-40`. It is rendered after `children` in
`root-providers.tsx`, so at `z-50` it ties with the sheet and wins on document
order — which floated it over the open mobile navigation menu.
`e2e/shell-responsive.spec.ts` hit-tests this with real geometry.

### App shell

Every signed-in page renders inside `AppShell`
(`src/components/layout/app-shell.tsx`), which owns the mobile-menu and feedback
state and hoists a SINGLE `FeedbackDialog`. It renders `CliPromoBanner` and the
`max-w-6xl` content container itself, so no page component needs to.

- Nav entries live in `src/components/layout/nav.ts`. `navItemsFor(isAdmin)`
  appends the `/admin` entry, which is deliberately kept OUT of `PRIMARY_NAV` so
  a non-admin render can never leak it. `isNavItemActive` matches `exact` items
  on the pathname only, and everything else on `href` or `href + "/"` — the
  trailing slash is what stops `/reports` lighting up a `/report` entry.
- The ACTIVE entry is marked with `aria-current="page"` and nothing else.
  Assert on that, never on a class.
- **`md` (48rem) is the only breakpoint.** At or above it: a fixed `w-60` rail
  and a one-row `h-14` header, with the account menu in the rail footer
  (`variant="card"`). Below it: the rail is hidden, the nav opens in a
  `Sheet side="left" size="nav"` named "Navigation", and the header wraps to two
  rows with the account menu in it (`variant="avatar"`).
- `AppShell` has a `matchMedia("(min-width: 48rem)")` effect that force-closes
  the sheet on a resize past `md`. Do not remove it: without it Radix keeps focus
  trapped and body scroll locked behind an `md:hidden` panel.
- Below `md` the account menu is mounted TWICE (header and sheet). Scope test
  locators by container or Playwright's strict mode will fail.
- Accessible names the tests depend on: `Open navigation menu`,
  `Close navigation menu`, `Applika.dev home`, the `Primary` navigation
  landmark, and `Open account menu` — which the `card` variant extends to
  `Open account menu for <username>`, because the username is its VISIBLE label
  and WCAG 2.5.3 requires the accessible name to contain it. Playwright's
  `getByRole(..., { name })` is a substring match, so both variants match
  `"Open account menu"`; Testing Library's is exact, so a vitest locator needs
  the full string or a regex.
- The group divider (`System`) is NOT `aria-hidden`: with the old amber
  treatment gone it is the only thing marking the Admin entry as privileged.
  Grouped entries point at it with `aria-describedby`, which describes without
  renaming — `admin-gating.spec.ts` asserts the name is exactly `Admin`.

---

## Key Files

| File                                            | Purpose                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `src/services/services.ts`                      | Service DI container (single import point for all API calls)     |
| `src/lib/api-client.ts`                         | Axios instance with cookie auth (`withCredentials`)              |
| `src/lib/query-client.ts`                       | React Query configuration                                        |
| `src/contexts/auth-context.tsx`                 | Auth state + polling-based token refresh                         |
| `src/contexts/supports-context.tsx`             | Shared lookup data (platforms, steps, feedbacks)                 |
| `src/components/layout/root-providers.tsx`      | Root-level providers (QueryClient, Theme, Auth, Tooltip, Sonner) |
| `src/components/layout/protected-providers.tsx` | Protected-route providers (nested AuthProvider)                  |
| `src/components/layout/app-shell.tsx`           | Signed-in shell: rail, header, mobile sheet, feedback dialog     |
| `src/components/layout/nav.ts`                  | Nav entries, `navItemsFor()` admin filter, `isNavItemActive()`   |
| `src/components/layout/sidebar.tsx`             | Rail body: brand, nav, account menu (rail AND mobile sheet)      |
| `src/components/layout/sidebar-nav.tsx`         | Nav entry list; owns `aria-current="page"`                       |
| `src/components/layout/header.tsx`              | Shell header: menu trigger, cycle selector, agenda, theme        |
| `src/components/layout/user-menu.tsx`           | Account menu (`card` in the rail, `avatar` in the header)        |
| `src/app/globals.css`                           | ALL design tokens (`@theme`) and `@utility` definitions          |
| `src/hooks/use-applications.ts`                 | Application list, client-side filtering, CRUD mutations          |
| `src/components/ui/date-picker.tsx`             | Timezone-safe date picker (use instead of `<input type="date">`) |

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

## Tooling

- **Git**: plain `git` via the shell. There is no Git MCP in this workspace.
  Commit after each logical unit of work using conventional commits with the
  ticket key after the scope: `feat(frontend): KODI-004 ...`. Branch from
  `develop` and open the PR against `develop`
  (`.claude/rules/branches-and-commits.md`).
- **shadcn/ui**: add or compose primitives through the CLI and fetch the
  canonical docs before using a pattern. Do not hand-roll what the registry has.
- **Context7 MCP** (when available): look up docs for Next.js, React Query, Zod,
  react-hook-form and shadcn/ui before guessing API signatures.

---

## Backend Context

The backend is a FastAPI app in `../backend/` with its own `CLAUDE.md`. It runs on port 8000. Auth uses HTTP-only JWT cookies (`__access`). GitHub OAuth is the only login method. See `../backend/CLAUDE.md` for backend-specific guidance.
