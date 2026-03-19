# Frontend Architecture Guidelines

**Next.js App Router (Static Export) + React Query + Service Layer**

This document defines the recommended architecture and conventions for this project.
The goal is to keep the codebase **scalable, predictable, and maintainable** as the application grows.

The project follows a **layered architecture** instead of feature-based modules.

> **Rendering strategy:** This application is built as a **fully static, client-side-rendered (CSR) SPA**. There is no server-side rendering, no server-side data fetching, and no server-managed cache. All data is fetched at runtime in the browser via React Query + axios. Authentication is handled entirely client-side using HTTP-only cookies.

---

# Phase 0: Migrate to Next.js

Before applying the architectural migration, the project must be converted from **Vite + React + react-router-dom** to **Next.js (App Router)** configured for **static export**.

## Why Next.js

- File-based routing via the App Router (replaces react-router-dom)
- First-class support for layouts, loading states, and error boundaries per route group
- Ecosystem compatibility and tooling (shadcn/ui, next-themes, etc.)
- Easy static export — output is plain HTML + JS files deployable anywhere (CDN, S3, Nginx)

> Server Components, server actions, and ISR/SSR features are **not used**. The App Router is used purely for its file-based routing, layout nesting, and route groups.

## Migration Steps

### 1. Bootstrap Next.js

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

> Run this in a temporary folder and manually copy the config files (`next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `tailwind.config.ts`) into the existing project to avoid overwriting source code.

### 2. Configure static export

In `next.config.ts`, set `output: 'export'` to disable the Node.js server and generate a static `out/` folder:

```ts
// next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // required for static export (no image optimization server)
  },
}

// eslint-disable-next-line import/no-default-export
export default nextConfig
```

This means:
- `pnpm build` produces a static `out/` folder ready to be served by any static host
- No SSR, no server actions, no API routes are used
- Dynamic routes that need to exist at build time require `generateStaticParams` (not applicable here — all routes are authenticated and rendered client-side)

### 3. Install required dependencies

Carry over all existing dependencies:

```bash
pnpm add @tanstack/react-query axios zod react-hook-form @hookform/resolvers \
  framer-motion recharts next-themes sonner lucide-react \
  class-variance-authority clsx tailwind-merge
```

### 4. Remove Vite and react-router-dom

```bash
pnpm remove vite @vitejs/plugin-react-swc react-router-dom
```

Delete `vite.config.ts` and `src/vite-env.d.ts`.

### 5. Replace entry point

- Delete `src/main.tsx` and `src/App.tsx`
- The new entry point is `src/app/layout.tsx` (root layout) + `src/app/page.tsx` (index route)

### 6. Adapt environment variables

Rename all `VITE_*` env vars to `NEXT_PUBLIC_*` (e.g. `VITE_API_BASE_URL` → `NEXT_PUBLIC_API_BASE_URL`).

Update `src/lib/api-client.ts`:

```ts
baseURL: process.env.NEXT_PUBLIC_API_BASE_URL
```

### 7. Adapt CSS

Move `src/index.css` contents into `src/app/globals.css`.

Next.js expects global CSS to be imported once in the root layout.

### 8. shadcn/ui

Re-initialize shadcn/ui for Next.js:

```bash
pnpm dlx shadcn@latest init
```

Existing `src/components/ui/` files can be kept as-is — only `components.json` needs to be updated.

### 9. Configure ESLint

Install the required plugins:

```bash
pnpm add -D eslint-plugin-import eslint-plugin-unicorn
```

Update `eslint.config.mjs`:

```js
// eslint.config.mjs
import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"
import importPlugin from "eslint-plugin-import"
import unicornPlugin from "eslint-plugin-unicorn"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Global rules applied to all source files
  {
    plugins: {
      import: importPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      // Enforce named exports — prevents accidental default exports
      "import/no-default-export": "error",

      // Enforce kebab-case for all file names (e.g. application-item.tsx)
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },

  // Next.js App Router requires default exports for special files.
  // Disable import/no-default-export for them via config — no inline comments needed.
  {
    files: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/error.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/not-found.tsx",
      "src/app/**/template.tsx",
      "src/app/**/global-error.tsx",
    ],
    rules: {
      "import/no-default-export": "off",
    },
  },

  // Next.js special file names are controlled by the framework (e.g. not-found.tsx).
  // Disable the filename rule inside app/ to avoid conflicts.
  {
    files: ["src/app/**"],
    rules: {
      "unicorn/filename-case": "off",
    },
  },
]
```

**Rules summary:**

| Rule | Scope | Rationale |
|------|-------|-----------|
| `import/no-default-export` | All `src/` except `app/**` special files | Named exports are explicit, easier to refactor, and prevent accidental re-exports |
| `unicorn/filename-case` (kebabCase) | All `src/` except `src/app/**` | Consistent, OS-agnostic file names (avoids case-sensitivity issues on Linux/macOS) |

---

# 1. Architectural Principles

The application is divided into clear layers:

```
Route (app/) → Page → Hooks → Services → HTTP Client → API
```

Responsibilities:

| Layer          | Responsibility                          |
| -------------- | --------------------------------------- |
| **app/**       | File-based routing and layout nesting   |
| **pages/**     | Page-level UI and layout composition    |
| **hooks/**     | React Query data logic and state        |
| **services/**  | API communication layer                 |
| **container/** | Dependency injection                    |
| **types/**     | API DTO definitions                     |
| **components/**| Reusable UI components                  |
| **lib/**       | Infrastructure and utilities            |

Each layer **must not leak responsibilities into another**.

Example:

❌ A page calling axios directly
✅ A page calling a hook

---

# 2. Folder Structure

```
src
│
├─ app/
│
├─ pages/
│
├─ components/
│
├─ hooks/
│
├─ services/
│
├─ container/
│
├─ types/
│
└─ lib/
```

---

## `app/`

The `app` directory is the **Next.js App Router**. It contains routes and layouts only — no business logic, no data fetching.

All files here are **thin wrappers** that import from `pages/`.

> File names inside `app/` follow Next.js conventions (`page.tsx`, `layout.tsx`, `not-found.tsx`, etc.) and are excluded from the kebab-case ESLint rule.

Example structure:

```
app
├─ layout.tsx              # Root layout: providers, fonts, global CSS
├─ globals.css
├─ page.tsx                # / (landing — public)
│
├─ (public)/
│  └─ login/
│     └─ page.tsx          # /login
│
└─ (protected)/
   ├─ layout.tsx           # Client-side auth guard + AppLayout
   ├─ dashboard/
   │  └─ page.tsx          # /dashboard
   ├─ applications/
   │  └─ page.tsx          # /applications
   └─ profile/
      └─ page.tsx          # /profile
```

### Route Groups

- `(public)/` — routes accessible without authentication
- `(protected)/` — routes that require authentication; share the `app-layout` sidebar

### Root Layout

The root layout mounts global providers:

```tsx
// src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/components/layout/providers"

export const metadata: Metadata = { title: "Applika" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Providers Component

```tsx
// src/components/layout/providers.tsx
"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { AuthProvider } from "@/contexts/auth-context"
import { queryClient } from "@/lib/query-client"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <TooltipProvider>
            <Sonner />
            {children}
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
```

### Auth Guard Layout

The `(protected)/layout.tsx` handles client-side authentication — no server involvement:

```tsx
// src/app/(protected)/layout.tsx
"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { AppLayout } from "@/components/layout/app-layout"

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login")
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading || !isAuthenticated) return null

  return <AppLayout>{children}</AppLayout>
}
```

### Route Files

Route files are thin wrappers — they just render the corresponding page component:

```tsx
// src/app/(protected)/dashboard/page.tsx
"use client"

import { DashboardPage } from "@/pages/dashboard/dashboard-page"

export default function DashboardRoute() {
  return <DashboardPage />
}
```

> `app/` layout and page files are allowed to use `export default` — Next.js requires it. The ESLint rule is disabled for these files via the config override (no inline comments needed).

---

## `pages/`

The `pages` directory contains **page-level UI components** — the actual screen implementations.

All page components are Client Components and use **named exports**.

Pages may:

* use hooks
* compose multiple components
* handle UI state

Pages must **not contain direct API calls**.

Example structure:

```
pages
├─ home/
│  └─ home-page.tsx
│
├─ dashboard/
│  └─ dashboard-page.tsx
│
├─ applications/
│  └─ applications-page.tsx
│
└─ profile/
   └─ profile-page.tsx
```

Example:

```tsx
// src/pages/dashboard/dashboard-page.tsx
"use client"

import { useGeneralStats } from "@/hooks/use-statistics"

export function DashboardPage() {
  const { data, isLoading } = useGeneralStats()

  if (isLoading) return <div>Loading...</div>

  return <div>{data?.total_applications}</div>
}
```

Pages should be named with the `Page` suffix to distinguish them from reusable components.

---

## `components/`

The `components` folder contains **reusable UI components**.

Structure:

```
components
├─ ui/        # shadcn/ui primitives (do not manually edit)
├─ layout/    # layout building blocks + Providers
└─ shared/    # reusable UI components
```

### `components/ui`

Contains shadcn/ui components. These should remain close to their original structure to allow future CLI updates.

> shadcn generates files with its own naming convention. If names conflict with the kebab-case rule, add an `// eslint-disable-next-line unicorn/filename-case` comment at the top of the generated file.

### `components/layout`

Contains layout components — all use named exports and kebab-case file names:

```
providers.tsx        # Global provider tree
app-layout.tsx       # Sidebar + main content wrapper
navbar.tsx
sidebar.tsx
```

### `components/shared`

Contains reusable UI components used across multiple pages:

```
data-table.tsx
empty-state.tsx
loader.tsx
confirmation-dialog.tsx
pagination.tsx
```

All exports are named:

```tsx
// src/components/shared/empty-state.tsx
export function EmptyState({ message }: { message: string }) {
  return <div>{message}</div>
}
```

---

## `hooks/`

The `hooks` folder contains **domain-specific React hooks** integrating with React Query.

Example structure:

```
hooks
├─ use-users.ts
├─ use-statistics.ts
│
└─ applications/
   ├─ use-applications.ts
   ├─ use-application-steps.ts
   └─ use-finalize-application.ts
```

All hooks use named exports:

```ts
// src/hooks/use-statistics.ts
import { useQuery } from "@tanstack/react-query"
import { services } from "@/container/services"

export function useGeneralStats() {
  return useQuery({
    queryKey: ["statistics", "general"],
    queryFn: () => services.statistics.getGeneralStats(),
  })
}
```

Hooks should:

* call services via the container
* define query keys
* manage mutations
* handle caching logic

---

## `services/`

The `services` folder contains the **API communication layer**.

Structure:

```
services
├─ interfaces/
│  ├─ i-user-service.ts
│  ├─ i-application-service.ts
│  ├─ i-statistics-service.ts
│  ├─ i-supports-service.ts
│  └─ i-company-service.ts
│
└─ implementations/
   ├─ user-service.ts
   ├─ application-service.ts
   ├─ statistics-service.ts
   ├─ supports-service.ts
   └─ company-service.ts
```

### `interfaces`

Defines contracts for each service — named exports only:

```ts
// src/services/interfaces/i-user-service.ts
import type { User, UpdateUserPayload } from "@/types/users"

export interface IUserService {
  getMe(): Promise<User>
  updateMe(data: UpdateUserPayload): Promise<User>
}
```

### `implementations`

Concrete classes implementing the service interfaces — named exports only:

```ts
// src/services/implementations/user-service.ts
import { api } from "@/lib/api-client"
import type { IUserService } from "../interfaces/i-user-service"
import type { User, UpdateUserPayload } from "@/types/users"

export class UserService implements IUserService {
  async getMe(): Promise<User> {
    const { data } = await api.get("/users/me")
    return data
  }

  async updateMe(payload: UpdateUserPayload): Promise<User> {
    const { data } = await api.patch("/users/me", payload)
    return data
  }
}
```

---

## `container/`

The `container` folder provides **dependency injection for services**.

```ts
// src/container/services.ts
import { UserService } from "@/services/implementations/user-service"
import { ApplicationService } from "@/services/implementations/application-service"
import { StatisticsService } from "@/services/implementations/statistics-service"
import { SupportsService } from "@/services/implementations/supports-service"
import { CompanyService } from "@/services/implementations/company-service"

class ServiceContainer {
  users = new UserService()
  applications = new ApplicationService()
  statistics = new StatisticsService()
  supports = new SupportsService()
  companies = new CompanyService()
}

export const services = new ServiceContainer()
```

Hooks access services through this singleton.

---

## `types/`

The `types` folder contains **TypeScript definitions related to the backend API**.

```
types
├─ users.ts
├─ auth.ts
├─ applications.ts
├─ statistics.ts
├─ supports.ts
└─ common.ts
```

All types use named exports:

```ts
// src/types/users.ts
export interface User {
  id: number
  username: string
  email: string
  first_name?: string
  last_name?: string
  // ...
}

export type UpdateUserPayload = Partial<Pick<User, "first_name" | "last_name" | "bio">>
```

---

## `lib/`

The `lib` directory contains **shared infrastructure utilities**.

```
lib
├─ api-client.ts     # Axios instance with auto-refresh interceptor
├─ query-client.ts   # React Query client instance
├─ utils.ts          # cn() and other helpers
└─ calendar.ts       # ICS export utility
```

### `api-client.ts`

```ts
// src/lib/api-client.ts
import axios from "axios"

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  withCredentials: true,
})

// auto-refresh interceptor (handles token refresh on 401/403)
// ...
```

### `query-client.ts`

```ts
// src/lib/query-client.ts
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 5 * 60 * 1000 },
  },
})
```

---

# 3. Naming Conventions

## File names — kebab-case

All files outside of `src/app/` must use **kebab-case**:

| Before | After |
|--------|-------|
| `AppLayout.tsx` | `app-layout.tsx` |
| `ApplicationItem.tsx` | `application-item.tsx` |
| `DashboardPage.tsx` | `dashboard-page.tsx` |
| `UserService.ts` | `user-service.ts` |
| `IUserService.ts` | `i-user-service.ts` |
| `useApplications.ts` | `use-applications.ts` |
| `AuthContext.tsx` | `auth-context.tsx` |
| `SupportsContext.tsx` | `supports-context.tsx` |

Files inside `src/app/` follow Next.js framework conventions (`page.tsx`, `layout.tsx`, `not-found.tsx`) and are **excluded from the rule**.

## Exports — named only, no default exports

All source files must use **named exports**. Default exports are only allowed in `src/app/**/page.tsx`, `src/app/**/layout.tsx`, and other Next.js special files — enforced via ESLint config override (no inline disable comments needed).

| ❌ Avoid | ✅ Use |
|---------|--------|
| `export default function DashboardPage` | `export function DashboardPage` |
| `export default class UserService` | `export class UserService` |
| `export default { ... }` | `export const config = { ... }` |

Named exports make imports explicit, refactoring safe, and prevent accidental barrel re-exports.

---

# 4. "use client" Rule

Since the app is a **fully client-side SPA** (static export), the `"use client"` directive is required on any file that uses React hooks, browser APIs, or event handlers.

| File location | Must be `"use client"`? |
|---|---|
| `app/layout.tsx` | No (just imports `Providers` which is client) |
| `app/**/page.tsx` | Yes — delegates to a page component |
| `app/(protected)/layout.tsx` | Yes — uses `useAuth`, `useRouter` |
| `pages/**/*.tsx` | Yes — always uses hooks |
| `components/layout/providers.tsx` | Yes — context providers |
| `components/layout/app-layout.tsx` | Yes — uses hooks/state |
| `components/shared/**` | Yes if using hooks or events; No if purely JSX |
| `hooks/**` | N/A (imported only into client components) |
| `services/**` | No (plain TypeScript classes) |
| `container/services.ts` | No (plain module) |
| `types/**` | No (type definitions only) |
| `lib/**` | No (utilities and config) |
| `contexts/**` | Yes — React context |

> **Rule of thumb:** if it touches React state, effects, context, or browser APIs — it needs `"use client"`.

---

# 5. General Best Practices

### Keep route files minimal

Route files in `app/` should only import and render a page component.

---

### No server-side data fetching

Do not use `fetch()` in Server Components, `generateStaticParams`, or `cookies()`/`headers()` from `next/headers`. All data is fetched client-side by React Query.

---

### Use hooks for all server communication

Never call services directly from components. Always go through a hook.

---

### Keep services stateless

Services contain only API logic — no state, no React.

---

### Prefer composition over duplication

If a UI pattern repeats more than twice, extract a component to `components/shared/`.

---

# 6. Example Request Flow

```
app/(protected)/applications/page.tsx       (Next.js route — default export allowed)
  ↓
pages/applications/applications-page.tsx    ("use client", named export)
  ↓
hooks/use-applications.ts                   (React Query — named export)
  ↓
services.applications.getAll()              (container singleton)
  ↓
ApplicationService.getAll()                 (application-service.ts — named export)
  ↓
lib/api-client.ts                           (axios instance, withCredentials)
  ↓
Backend API
```

---

# 7. Summary

This architecture ensures:

* Clear separation of concerns
* Predictable, fully client-side data flow
* Easy static deployment (CDN, S3, Nginx)
* Maintainable and testable codebase

The migration is done in two phases:

1. **Phase 0** — Convert from Vite + react-router-dom to Next.js App Router with `output: "export"` (static SPA) + configure ESLint rules
2. **Phase 1+** — Apply the layered architecture (types → services → container → hooks → pages → routes) following kebab-case filenames and named exports throughout
