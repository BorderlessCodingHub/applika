# Admin Dashboard — Backend Implementation Plan

This document maps every frontend mock to the real API endpoint, DB changes, and permissions needed.

---

## 1. User Model — Add `is_admin` field

**What:** Add a boolean `is_admin` column to the User table.

**DB migration:**
```
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
```

**Serializer:** Include `is_admin` (read-only) in the `/users/me` response.

**How to grant:** Direct DB update or a management command (`python manage.py set_admin <username>`). No self-service — admins are promoted manually.

**Frontend cleanup:** Remove the `is_admin: true` hardcode from `src/api/users.ts` `getMe()` once this ships.

---

## 2. Admin Permission Guard

**What:** A DRF permission class that rejects non-admin users on all `/api/admin/` routes.

```python
class IsAdminUser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin
```

Apply to every admin viewset/view via `permission_classes = [IsAuthenticated, IsAdminUser]`.

---

## 3. API Endpoints

All endpoints live under **`/api/admin/`** and require the `IsAdminUser` permission.

### 3.1 `GET /api/admin/stats`

**Consumed by:** `AdminStatCards` component → `useAdminStats()` hook

**Response shape:**
```json
{
  "total_users": 20,
  "active_users_30d": 14,
  "total_applications": 543,
  "total_offers": 31,
  "total_denials": 89,
  "avg_applications_per_user": 27.2,
  "global_success_rate": 5.7,
  "new_users_7d": 3
}
```

**Backend logic:**
- `total_users` — `User.objects.count()`
- `active_users_30d` — Users with at least one application updated in the last 30 days, or a login/activity timestamp if tracked
- `total_applications` — `Application.objects.count()`
- `total_offers` — `Application.objects.filter(result='offer').count()` (or however finalization is stored)
- `total_denials` — `Application.objects.filter(result='denial').count()`
- `avg_applications_per_user` — `total_applications / total_users`, rounded to 1 decimal
- `global_success_rate` — `(total_offers / total_applications) * 100`, rounded to 1 decimal
- `new_users_7d` — `User.objects.filter(date_joined__gte=now - 7days).count()`

**DB requirement:** If "active in 30d" is based on application activity, no new columns needed. If based on login, add a `last_active_at` timestamp to User.

---

### 3.2 `GET /api/admin/users`

**Consumed by:** `UserActivityTable` component → `useAdminUsers()` hook

**Response shape:** Array of:
```json
{
  "id": 1,
  "username": "devcarla",
  "email": "devcarla@email.com",
  "github_id": 10001,
  "seniority_level": "senior",
  "location": "São Paulo, BR",
  "total_applications": 42,
  "offers": 3,
  "denials": 8,
  "active_applications": 31,
  "last_activity": "2026-03-14T10:30:00Z",
  "joined_at": "2025-09-01T00:00:00Z"
}
```

**Backend logic:**
- Annotate each user with aggregated application counts:
  ```python
  User.objects.annotate(
      total_applications=Count('applications'),
      offers=Count('applications', filter=Q(applications__result='offer')),
      denials=Count('applications', filter=Q(applications__result='denial')),
  )
  ```
- `active_applications = total - offers - denials` (can compute in serializer or annotate)
- `last_activity` — `Max('applications__updated_at')` or a dedicated `last_active_at` field
- `joined_at` — `date_joined` (Django default)

**Optional query params** (for server-side search/sort if the user base grows):
- `?search=` — filter by username, email, location
- `?ordering=` — sort by any column
- `?page=` / `?page_size=` — pagination

For now the frontend handles search/sort/pagination client-side, so returning the full list is fine for <500 users.

---

### 3.3 `GET /api/admin/users/growth`

**Consumed by:** `UserGrowthChart` + `NewUsersBarChart` → `useUserGrowth()` hook

**Response shape:** Array of:
```json
{
  "date": "2026-03-01",
  "label": "Mar 26",
  "total_users": 45,
  "new_users": 4
}
```

**Backend logic:**
- Group users by month of `date_joined`
- For each month: count new users, compute cumulative total
- Return last 12 months
- `label` can be formatted server-side or left to frontend

```python
User.objects.annotate(month=TruncMonth('date_joined'))
    .values('month')
    .annotate(new_users=Count('id'))
    .order_by('month')
```

Then compute running `total_users` in a loop.

---

### 3.4 `GET /api/admin/users/seniority`

**Consumed by:** `SeniorityDonut` → `useSeniorityBreakdown()` hook

**Response shape:** Array of:
```json
{
  "level": "senior",
  "count": 6,
  "color": "#f59e0b"
}
```

**Backend logic:**
```python
User.objects.values('seniority_level')
    .annotate(count=Count('id'))
    .order_by('-count')
```

**Color mapping:** Define a dict server-side mapping seniority levels to hex colors, or let the frontend own the mapping (cleaner — remove `color` from response and map in the component).

---

### 3.5 `GET /api/admin/platforms`

**Consumed by:** `TopPlatformsPanel` → `useTopPlatforms()` hook

**Response shape:** Array of:
```json
{
  "name": "LinkedIn",
  "total_across_users": 142,
  "unique_users": 18
}
```

**Backend logic:**
```python
Platform.objects.annotate(
    total_across_users=Count('applications'),
    unique_users=Count('applications__user', distinct=True),
).order_by('-total_across_users')[:10]
```

Depends on how applications reference platforms — adjust the relation path accordingly.

---

### 3.6 `GET /api/admin/activity/heatmap`

**Consumed by:** `ActivityHeatmap` → `useActivityHeatmap()` hook

**Response shape:** Array of 168 points (7 days × 24 hours):
```json
{
  "hour": 14,
  "day": 2,
  "count": 5
}
```
- `day`: 0=Monday, 6=Sunday
- `hour`: 0–23

**Backend logic:**
- Extract `day_of_week` and `hour` from application `created_at`:
  ```python
  Application.objects.annotate(
      dow=ExtractWeekDay('created_at'),  # adjust for 0=Mon
      hour=ExtractHour('created_at'),
  ).values('dow', 'hour').annotate(count=Count('id'))
  ```
- Note: Django's `ExtractWeekDay` returns 1=Sunday by default (depends on DB). Normalize to 0=Mon in Python.
- Fill in missing (day, hour) pairs with `count: 0`.

**DB requirement:** Needs `created_at` timestamp on Application (likely already exists).

---

### 3.7 `GET /api/admin/system/health`

**Consumed by:** `SystemHealthPanel` → `useSystemHealth()` hook (auto-refreshes every 15s)

**Response shape:**
```json
{
  "api_latency_ms": 23,
  "uptime_pct": 99.97,
  "error_rate_pct": 0.12,
  "db_connections": 14,
  "db_connections_max": 50,
  "cache_hit_rate": 94.2,
  "queue_depth": 3,
  "last_deploy": "2026-03-16T02:15:00Z"
}
```

**Backend logic — this is the most infrastructure-dependent endpoint:**

| Metric | Source |
|---|---|
| `api_latency_ms` | Middleware that tracks average response time over last N minutes, or pull from Prometheus/metrics |
| `uptime_pct` | External uptime monitor API (UptimeRobot, Betterstack) or compute from error logs |
| `error_rate_pct` | Count 5xx responses / total responses over last hour |
| `db_connections` | `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()` |
| `db_connections_max` | `SHOW max_connections` (PostgreSQL) |
| `cache_hit_rate` | Redis `INFO stats` → `keyspace_hits / (keyspace_hits + keyspace_misses) * 100` |
| `queue_depth` | Celery inspect or Redis `LLEN` on task queue |
| `last_deploy` | Read from env var, file timestamp, or deployment API |

**Recommendation:** Start with a simplified version — DB connections + a hardcoded `last_deploy` from an env var. Add the rest incrementally as monitoring infrastructure matures.

---

## 4. Summary — Migration Checklist

### Database
- [ ] Add `is_admin` boolean to User model (default `FALSE`)
- [ ] Add `last_active_at` timestamp to User model (optional — can derive from application dates)
- [ ] Ensure `created_at` exists on Application model

### Django / DRF
- [ ] Create `IsAdminUser` permission class
- [ ] Create `admin` app or add views to existing app
- [ ] Register URL patterns under `/api/admin/`

### Endpoints to implement (in priority order)
1. [ ] `GET /api/admin/stats` — platform-wide aggregates (simplest, highest value)
2. [ ] `GET /api/admin/users` — annotated user list
3. [ ] `GET /api/admin/users/growth` — monthly user registration trend
4. [ ] `GET /api/admin/users/seniority` — seniority distribution
5. [ ] `GET /api/admin/platforms` — platform usage across all users
6. [ ] `GET /api/admin/activity/heatmap` — application creation time distribution
7. [ ] `GET /api/admin/system/health` — infrastructure metrics (implement last, most complex)

### Frontend cleanup (after backend ships)
- [ ] Remove `is_admin: true` hardcode from `src/api/users.ts` `getMe()`
- [ ] Replace mock functions in `src/api/admin.ts` with real `apiClient.get(...)` calls
- [ ] Delete mock data generators from `src/api/admin.ts`
- [ ] Remove artificial `delay()` calls

---

## 5. Notes

- **No new models needed** — all data comes from aggregating existing User + Application + Platform tables.
- **Caching:** The `/stats`, `/growth`, `/seniority`, `/platforms` endpoints can be cached for 60s since the data changes slowly. `/system/health` should not be cached.
- **The `color` field** on seniority breakdown can be owned by frontend instead of backend — the frontend already has a color map. Keeping it server-side is optional.
- **Activity heatmap** can optionally accept `?days=30` or `?days=90` to scope the time window.
