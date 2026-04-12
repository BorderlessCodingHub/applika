# Admin Dashboard — Implementation Plan

> Fully functional admin panel for Applika.dev, integrated with the API.
> Covers: analytics dashboard, user management, company management, and support-data CRUD.

---

## Table of Contents

1. [Access Control (Backend)](#1-access-control)
2. [Admin API Endpoints (Backend)](#2-admin-api-endpoints)
3. [Database Changes](#3-database-changes)
4. [Backend Implementation Details](#4-backend-implementation-details)
5. [Frontend Service & Hooks](#5-frontend-service--hooks)
6. [Frontend Pages & Components](#6-frontend-pages--components)
7. [Implementation Order](#7-implementation-order)

---

## 1. Access Control

### 1.1 — Add `is_admin` to `UserModel`

Add a boolean column to `users`:

```python
# backend/app/domain/models.py  —  UserModel
is_admin: Mapped[bool] = mapped_column(
    sa.Boolean, default=False, server_default='false', nullable=False
)
```

- Create an Alembic migration: `uv run task autorevision` (message: "add is_admin to users").
- The first admin(s) can be seeded via a direct SQL `UPDATE users SET is_admin = true WHERE github_id = <your_id>;` or a one-off script. No self-service "become admin" flow.

### 1.2 — Expose `is_admin` to the Frontend

- Add `is_admin: bool` to `UserDTO` (backend DTO) and `UserProfile` (Pydantic response schema) — both in read-only mode (not in `UpdateUserProfile`).
- The frontend `User` type already has `is_admin?: boolean` — it will start receiving the real value automatically from `GET /users/me`.

### 1.3 — Backend Admin Guard Dependency

Create a reusable FastAPI dependency:

```python
# backend/app/presentation/dependencies.py

async def get_admin_user(
    user: CurrentUserDp,
) -> UserDTO:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

AdminUserDp = Annotated[UserDTO, Depends(get_admin_user)]
```

Every admin endpoint uses `AdminUserDp` instead of `CurrentUserDp`.

### 1.4 — Frontend Admin Guard (already exists)

`frontend/src/components/admin/admin-guard.tsx` already checks `user?.is_admin` and redirects to `/dashboard`. Once the backend sends the real flag, remove the TODO comment and the guard works as-is.

The sidebar in `app-layout.tsx` already conditionally shows the Admin nav item when `user?.is_admin` is true.

---

## 2. Admin API Endpoints

All endpoints are prefixed with `/admin` and require `AdminUserDp`.

### 2.1 — Dashboard Analytics

| Method | Route | Description | Response Type |
|--------|-------|-------------|---------------|
| GET | `/admin/stats` | Platform-wide KPIs | `AdminPlatformStats` |
| GET | `/admin/users` | All users with app counts | `list[AdminUserRow]` |
| GET | `/admin/users/growth` | Monthly user growth (last 12 months) | `list[UserGrowthPoint]` |
| GET | `/admin/users/seniority` | Users grouped by seniority level | `list[SeniorityBreakdown]` |
| GET | `/admin/stats/top-platforms` | Most-used job platforms | `list[TopPlatformStat]` |
| GET | `/admin/stats/activity-heatmap` | Hour × day-of-week activity counts | `list[ActivityHeatmapPoint]` |

**Note on System Health:** The existing `SystemHealth` mock (API latency, uptime, DB connections, etc.) is infrastructure monitoring — not application data. This should come from an external tool (Prometheus/Grafana, UptimeRobot, etc.), not from the app itself. Options:
- **Option A (recommended):** Remove the system health panel from the admin dashboard for now. It's cosmetic until real infra monitoring exists.
- **Option B:** Add a minimal `/admin/health` endpoint that returns DB pool size and Redis ping latency. Not a priority.

### 2.2 — User Management

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/users` | List all users (shared with analytics, supports pagination/search) |
| GET | `/admin/users/{id}` | Single user detail (profile + stats) |
| PATCH | `/admin/users/{id}` | Update user fields (including `is_admin`) |
| DELETE | `/admin/users/{id}` | Soft-delete or hard-delete a user |

**Query params for `GET /admin/users`:**
- `search` (string) — filter by username/email (case-insensitive ILIKE)
- `seniority` (enum, optional) — filter by seniority level
- `sort_by` (string) — `username`, `joined_at`, `last_activity`, `total_applications` (default: `joined_at`)
- `sort_order` — `asc` | `desc` (default: `desc`)
- `page` / `per_page` — pagination (default: 1 / 25)

**Response for each user row** (matches existing `AdminUserRow` frontend type):
```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "github_id": "string",
  "seniority_level": "string | null",
  "location": "string | null",
  "is_admin": false,
  "total_applications": 0,
  "offers": 0,
  "denials": 0,
  "active_applications": 0,
  "last_activity": "ISO date",
  "joined_at": "ISO date"
}
```

### 2.3 — Company Management

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/companies` | List all companies (paginated, searchable) |
| POST | `/admin/companies` | Create a new company |
| PATCH | `/admin/companies/{id}` | Update company (name, url, is_active) |
| DELETE | `/admin/companies/{id}` | Delete company (only if 0 linked applications) |

**Query params for `GET /admin/companies`:**
- `search` (string) — filter by name (ILIKE)
- `is_active` (bool, optional) — filter active/inactive
- `sort_by` — `name`, `created_at`, `applications_count` (default: `name`)
- `page` / `per_page`

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "url": "string",
  "is_active": true,
  "applications_count": 0,
  "created_by_username": "string | null",
  "created_at": "ISO date"
}
```

### 2.4 — Supports Data Management (Platforms, Steps, Feedbacks)

These are the lookup tables that all users depend on. Currently they are seeded and read-only.

#### Platforms

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/platforms` | List all platforms |
| POST | `/admin/platforms` | Create platform |
| PATCH | `/admin/platforms/{id}` | Update platform name/url |
| DELETE | `/admin/platforms/{id}` | Delete (only if 0 linked applications) |

#### Step Definitions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/step-definitions` | List all step definitions |
| POST | `/admin/step-definitions` | Create step definition |
| PATCH | `/admin/step-definitions/{id}` | Update name/color/strict |
| DELETE | `/admin/step-definitions/{id}` | Delete (only if 0 linked steps) |

#### Feedback Definitions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/feedback-definitions` | List all feedback definitions |
| POST | `/admin/feedback-definitions` | Create feedback definition |
| PATCH | `/admin/feedback-definitions/{id}` | Update name/color |
| DELETE | `/admin/feedback-definitions/{id}` | Delete (only if 0 linked applications) |

**Delete safety:** All delete endpoints must check for linked records first and return `409 Conflict` with a clear message if the entity is in use.

---

## 3. Database Changes

### 3.1 — Migration: `is_admin` Column

Single Alembic migration:

```python
# Add is_admin boolean to users table
op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))
```

No other schema changes are needed — all admin queries are aggregations over existing tables.

### 3.2 — Admin Stat Queries (no new tables)

All dashboard analytics are computed from existing data:

| Metric | SQL Source |
|--------|-----------|
| `total_users` | `SELECT COUNT(*) FROM users` |
| `active_users_30d` | Users with at least 1 application or step in last 30 days |
| `total_applications` | `SELECT COUNT(*) FROM applications` |
| `total_offers` | Applications where `feedback_def.name = 'Accepted'` (or similar) |
| `total_denials` | Applications where `feedback_def.name = 'Rejected'` |
| `avg_applications_per_user` | `total_applications / total_users` |
| `global_success_rate` | `total_offers / total_applications * 100` |
| `new_users_7d` | Users with `created_at` in last 7 days |
| User growth | `GROUP BY date_trunc('month', created_at)` with running cumulative |
| Seniority breakdown | `GROUP BY seniority_level` |
| Top platforms | `GROUP BY platform_id` with JOIN to platforms |
| Activity heatmap | `GROUP BY EXTRACT(dow/hour FROM application_steps.created_at)` |

---

## 4. Backend Implementation Details

Follow the existing Clean Architecture patterns exactly.

### 4.1 — File Structure

```
backend/app/
├── domain/repositories/
│   └── admin_repository.py          # Read-only aggregate queries
├── application/
│   ├── dto/admin.py                  # Admin-specific DTOs
│   └── use_cases/admin/
│       ├── __init__.py
│       ├── get_platform_stats.py     # KPI aggregation
│       ├── list_admin_users.py       # User list with app counts
│       ├── get_user_growth.py        # Monthly growth
│       ├── get_seniority_breakdown.py
│       ├── get_top_platforms.py
│       ├── get_activity_heatmap.py
│       ├── get_admin_user_detail.py  # Single user detail
│       ├── update_admin_user.py      # Admin updates a user
│       ├── delete_admin_user.py
│       ├── manage_companies.py       # CRUD for companies (admin)
│       ├── manage_platforms.py       # CRUD for platforms
│       ├── manage_step_definitions.py
│       └── manage_feedback_definitions.py
├── presentation/
│   ├── api/admin.py                  # All admin routes
│   └── schemas/admin.py             # Request/response schemas
```

### 4.2 — Admin Repository

A single `AdminRepository` with read-only aggregate methods. It does **not** manage individual entity CRUD — that stays in existing repos (`UserRepository`, `CompanyRepository`, etc.). The admin repository only handles cross-entity analytics queries.

```python
class AdminRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_platform_stats(self) -> dict: ...
    async def get_user_rows(self, search, seniority, sort_by, sort_order, page, per_page) -> tuple[list, int]: ...
    async def get_user_growth(self, months: int = 12) -> list[dict]: ...
    async def get_seniority_breakdown(self) -> list[dict]: ...
    async def get_top_platforms(self, limit: int = 10) -> list[dict]: ...
    async def get_activity_heatmap(self) -> list[dict]: ...
```

### 4.3 — Admin Dependency

```python
# backend/app/presentation/dependencies.py

def get_admin_repository(session: DbSession):
    return AdminRepository(session)

AdminRepositoryDp = Annotated[AdminRepository, Depends(get_admin_repository)]
```

### 4.4 — Router Registration

```python
# backend/app/main.py
from app.presentation.api.admin import router as admin_router
app.include_router(admin_router, prefix=f'{API_PREFIX}/admin')
```

### 4.5 — Supports CRUD (admin-only)

For platforms, step definitions, and feedback definitions:

- **Create/Update** use cases follow the existing pattern (single `execute()` method, repo injection).
- **Delete** use cases first check for linked records:
  - Platform → `SELECT COUNT(*) FROM applications WHERE platform_id = :id`
  - StepDefinition → `SELECT COUNT(*) FROM application_steps WHERE step_id = :id`
  - FeedbackDefinition → `SELECT COUNT(*) FROM applications WHERE feedback_id = :id`
  - If count > 0 → raise `ResourceConflict("Cannot delete: X applications/steps reference this entity")`

---

## 5. Frontend Service & Hooks

### 5.1 — Admin Service

```typescript
// frontend/src/services/interfaces/admin-service.interface.ts
// frontend/src/services/implementations/admin-service.ts

class AdminService {
  // Dashboard
  getStats(): Promise<AdminPlatformStats>
  getUsers(params?: AdminUsersParams): Promise<PaginatedResponse<AdminUserRow>>
  getUserGrowth(): Promise<UserGrowthPoint[]>
  getSeniorityBreakdown(): Promise<SeniorityBreakdown[]>
  getTopPlatforms(): Promise<TopPlatformStat[]>
  getActivityHeatmap(): Promise<ActivityHeatmapPoint[]>

  // User management
  getUser(id: string): Promise<AdminUserDetail>
  updateUser(id: string, data: AdminUpdateUser): Promise<AdminUserDetail>
  deleteUser(id: string): Promise<void>

  // Company management
  getCompanies(params?: AdminCompaniesParams): Promise<PaginatedResponse<AdminCompanyRow>>
  createCompany(data: CreateCompany): Promise<AdminCompanyRow>
  updateCompany(id: string, data: UpdateCompany): Promise<AdminCompanyRow>
  deleteCompany(id: string): Promise<void>

  // Supports CRUD
  createPlatform(data: { name: string; url?: string }): Promise<Platform>
  updatePlatform(id: string, data: { name: string; url?: string }): Promise<Platform>
  deletePlatform(id: string): Promise<void>

  createStepDefinition(data: { name: string; color: string; strict: boolean }): Promise<Step>
  updateStepDefinition(id: string, data: { name: string; color: string; strict: boolean }): Promise<Step>
  deleteStepDefinition(id: string): Promise<void>

  createFeedbackDefinition(data: { name: string; color: string }): Promise<Feedback>
  updateFeedbackDefinition(id: string, data: { name: string; color: string }): Promise<Feedback>
  deleteFeedbackDefinition(id: string): Promise<void>
}
```

Register in `services.ts`: `admin = new AdminService()`.

### 5.2 — Types (extend existing)

```typescript
// frontend/src/services/types/admin.ts — add these

export interface AdminUsersParams {
  search?: string;
  seniority?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AdminUserDetail extends AdminUserRow {
  is_admin: boolean;
  first_name?: string;
  last_name?: string;
  current_role?: string;
  current_company?: string;
  bio?: string;
  linkedin_url?: string;
  tech_stack?: string[];
  availability?: string;
}

export interface AdminUpdateUser {
  is_admin?: boolean;
  seniority_level?: string;
  location?: string;
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  applications_count: number;
  created_by_username?: string;
  created_at: string;
}

export interface CreateCompany {
  name: string;
  url: string;
}

export interface UpdateCompany {
  name?: string;
  url?: string;
  is_active?: boolean;
}
```

### 5.3 — Hooks

Update `frontend/src/hooks/use-admin.ts`:
- Replace all mock imports with `services.admin.*` calls.
- Add mutation hooks: `useUpdateAdminUser`, `useDeleteAdminUser`, `useCreateCompany`, `useUpdateCompany`, `useDeleteCompany`, and all supports CRUD mutations.
- Add query hooks for companies and individual user detail.
- Invalidate `["admin", "users"]` after user mutations, `["admin", "companies"]` after company mutations, `["supports"]` after supports mutations (so the global SupportsContext refreshes).

---

## 6. Frontend Pages & Components

### 6.1 — Route Structure

```
frontend/src/app/(protected)/admin/
├── layout.tsx                  # AdminGuard (exists)
├── page.tsx                    # Dashboard tab (exists, renders admin-page.tsx)
├── admin-page.tsx              # Dashboard content (exists)
├── users/
│   ├── page.tsx                # User management page
│   └── users-page.tsx          # User management content
├── companies/
│   ├── page.tsx                # Company management page
│   └── companies-page.tsx      # Company management content
└── supports/
    ├── page.tsx                # Supports management page
    └── supports-page.tsx       # Tabs: Platforms | Steps | Feedbacks
```

### 6.2 — Admin Sub-Navigation

Add a tabbed sub-navigation at the top of the admin area (below the header) with four tabs:
- **Dashboard** → `/admin` (existing analytics)
- **Users** → `/admin/users`
- **Companies** → `/admin/companies`
- **Supports** → `/admin/supports`

Component: `frontend/src/components/admin/admin-nav.tsx` — a horizontal tab bar using the existing amber theme. Include it in the admin `layout.tsx` so it appears on all admin pages.

### 6.3 — Users Page

| Feature | Details |
|---------|---------|
| Search bar | Filters by username/email |
| Seniority filter | Dropdown with seniority levels |
| Sortable columns | Username, joined, last activity, total apps |
| User rows | Reuse/adapt existing `UserActivityTable` |
| Row actions | View detail (sheet/drawer), toggle admin, delete |
| User detail drawer | Shows full profile + stats, edit `is_admin` toggle |
| Delete confirmation | Dialog with username confirmation |

The existing `UserActivityTable` component (`frontend/src/components/admin/user-activity-table.tsx`) already renders a sortable, searchable table of users. Extend it with:
- Pagination controls (currently renders all rows)
- Row action buttons (view, toggle admin, delete)
- An "Admin" badge next to admin users

### 6.4 — Companies Page

| Feature | Details |
|---------|---------|
| Search bar | Filter by company name |
| Active/inactive filter | Toggle or dropdown |
| Table columns | Name, URL, active status, application count, created by, created at |
| Row actions | Edit (inline or sheet), toggle active, delete |
| Create button | Opens a sheet/dialog with name + URL fields |
| Delete safety | Disabled if `applications_count > 0`, with tooltip explaining why |

### 6.5 — Supports Page

Three tabs, one per entity type. Each tab shows:

**Platforms tab:**
- Table: Name, URL, actions (edit, delete)
- Create button → dialog with name + URL
- Delete disabled if platform has linked applications

**Step Definitions tab:**
- Table: Name, Color (swatch), Strict (badge), actions
- Create button → dialog with name + color picker + strict toggle
- Delete disabled if step has linked application steps

**Feedback Definitions tab:**
- Table: Name, Color (swatch), actions
- Create button → dialog with name + color picker
- Delete disabled if feedback has linked applications

All three tabs follow the same pattern: a `DataTable` with inline editing or sheet-based editing, plus create/delete actions.

### 6.6 — Component Reuse

- Use the existing `shadcn/ui` table, dialog, sheet, badge, button, input, select components.
- Use `sonner` toast for success/error feedback on all mutations.
- Use `react-hook-form` + `zod` for all create/edit forms.
- Use `framer-motion` for consistent page enter animations (matching existing admin page style).

---

## 7. Implementation Order

Work in this order to always have a working, testable system at each step.

### Phase 1 — Access Control (backend + migration)

1. Add `is_admin` column to `UserModel` + create Alembic migration.
2. Add `is_admin` to `UserDTO`, `UserProfile` schema (read-only).
3. Create `AdminUserDp` dependency in `dependencies.py`.
4. Manually set `is_admin = true` for your user in the DB.
5. Verify: `GET /users/me` now returns `is_admin: true` → frontend `AdminGuard` unlocks.

### Phase 2 — Dashboard Analytics API (backend)

6. Create `AdminRepository` with aggregate query methods.
7. Create DTOs in `application/dto/admin.py`.
8. Create use cases: `GetPlatformStats`, `ListAdminUsers`, `GetUserGrowth`, `GetSeniorityBreakdown`, `GetTopPlatforms`, `GetActivityHeatmap`.
9. Create schemas in `presentation/schemas/admin.py`.
10. Create `presentation/api/admin.py` router with GET endpoints.
11. Register router in `main.py`.
12. Test all endpoints via Swagger.

### Phase 3 — Connect Frontend Dashboard (frontend)

13. Create `AdminService` with dashboard GET methods.
14. Register in `services.ts`.
15. Update `use-admin.ts` hooks to call real API instead of mocks.
16. Update `AdminUserRow` type to include `is_admin` if needed.
17. Verify: existing admin dashboard components now show real data.

### Phase 4 — User Management (backend → frontend)

18. Add `GET /admin/users/{id}`, `PATCH /admin/users/{id}`, `DELETE /admin/users/{id}` endpoints.
19. Add corresponding use cases.
20. Add admin service methods + hooks on frontend.
21. Create `/admin/users` page with the extended `UserActivityTable`.
22. Add user detail drawer, admin toggle, delete confirmation.
23. Add admin sub-navigation component + wire into admin layout.

### Phase 5 — Company Management (backend → frontend)

24. Add admin company CRUD endpoints (`GET`, `POST`, `PATCH`, `DELETE`).
25. Add use cases + schemas.
26. Add admin service methods + hooks on frontend.
27. Create `/admin/companies` page with table + create/edit/delete UI.

### Phase 6 — Supports CRUD (backend → frontend)

28. Add admin CRUD endpoints for platforms, step definitions, feedback definitions.
29. Add delete-safety checks (409 if entity is in use).
30. Add admin service methods + hooks on frontend.
31. Create `/admin/supports` page with three tabs.
32. Invalidate `["supports"]` query key on mutations so the global `SupportsContext` updates.

### Phase 7 — Polish

33. Add pagination to the users table (frontend + backend).
34. Remove `frontend/src/lib/admin-mock.ts` (no longer needed).
35. Update seed script to set one user as admin.
36. Write backend tests for admin endpoints (use `async_client` fixture, seed an admin user).
37. Add `is_admin` to the existing `UserUpdateDTO` exclusion list so regular users can't self-promote via `PATCH /users/me`.

---

## Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| `is_admin` boolean (not roles/permissions) | Simplest approach for now. Only two roles: user and admin. If needed later, migrate to a `role` enum or a `user_roles` join table — but YAGNI today. |
| Single `/admin` router (not per-resource) | All admin endpoints behind one guard, one prefix. Easy to audit. |
| `AdminRepository` for analytics (not reusing existing repos) | Analytics queries span multiple tables with aggregations — they don't fit the existing single-entity repository pattern. Keeps existing repos clean. |
| System Health panel deferred | Real infra monitoring requires Prometheus/Grafana, not an app endpoint. Don't fake it. |
| Soft-delete users vs hard-delete | Start with hard delete (CASCADE takes care of FK). Add soft-delete (`deleted_at` column) later if needed for audit trails. |
| Pagination only on list endpoints | Dashboard analytics endpoints return small, bounded datasets. Only user/company lists need pagination. |
