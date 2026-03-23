# Frontend Migration Guide — Applications API

## What changed and why

Company handling in the applications flow was redesigned. Previously, creating an application required a pre-existing `company_id` (obtained from a separate `POST /companies` call). Now, the `company` field in the create/update payload is flexible — it accepts either an existing company's ID or an inline company definition. The response was also simplified: instead of returning a nested company object, it returns two flat fields (`company_id` and `company_name`).

---

## Removed endpoint

```
POST /companies  ❌  removed
```

Use `GET /companies` to search for existing companies to show in a selector.

---

## Changed: POST /applications and PUT /applications/{id}

### Request payload — `company` field

Replace the old `company_id` + `old_company` fields with a single `company` field that accepts one of three shapes:

```ts
type CompanyInput =
  | string                              // SnowflakeID — existing company
  | { name: string; url: string }       // inline — creates a new company record
  | { name: string; url: null }         // inline anonymous — no URL, no company record
```

#### Case 1 — User picks an existing company from the selector

```json
{
  "company": "179847239847239847",
  "role": "Backend Engineer",
  "mode": "active",
  "platform_id": "123456789",
  "application_date": "2025-12-01"
}
```

Backend resolves the ID → copies the company name → links `company_id` on the application.

#### Case 2 — User types a company name and provides a LinkedIn URL

```json
{
  "company": {
    "name": "Acme Corp",
    "url": "https://www.linkedin.com/company/acme"
  },
  "role": "Backend Engineer",
  "mode": "active",
  "platform_id": "123456789",
  "application_date": "2025-12-01"
}
```

Backend creates a new company record → links its ID to the application.

#### Case 3 — User types a company name but has no URL

```json
{
  "company": {
    "name": "Stealth Startup",
    "url": null
  },
  "role": "Backend Engineer",
  "mode": "active",
  "platform_id": "123456789",
  "application_date": "2025-12-01"
}
```

Backend stores the name only — `company_id` will be `null` on the created application.

---

### Full request type (TypeScript)

```ts
interface ApplicationCompanyObject {
  name: string
  url: string | null
}

interface CreateApplicationPayload {
  company: string | ApplicationCompanyObject  // SnowflakeID string OR inline object
  role: string
  mode: 'active' | 'passive'
  platform_id: string
  application_date: string                    // ISO date: "YYYY-MM-DD"
  link_to_job?: string | null
  observation?: string | null
  expected_salary?: number | null
  salary_range_min?: number | null
  salary_range_max?: number | null
  currency?: 'USD' | 'BRL' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'CHF' | 'INR' | null
  salary_period?: 'hourly' | 'monthly' | 'annual' | null
  experience_level?: 'intern' | 'junior' | 'mid_level' | 'senior' | 'staff' | 'lead' | 'principal' | 'specialist' | null
  work_mode?: 'remote' | 'hybrid' | 'on_site' | null
  country?: string | null
}

// UpdateApplicationPayload has the same shape as CreateApplicationPayload
type UpdateApplicationPayload = CreateApplicationPayload
```

---

## Changed: application response shape

All application responses (`POST /applications`, `PUT /applications/{id}`, `GET /applications`) now return:

```ts
interface Application {
  id: string                          // SnowflakeID as string
  company_id: string | null           // null when company has no record (anonymous)
  company_name: string                // always present — the display name

  role: string
  mode: 'active' | 'passive'
  platform_id: string
  application_date: string
  link_to_job: string | null
  observation: string | null
  expected_salary: number | null
  salary_range_min: number | null
  salary_range_max: number | null
  salary_offer: number | null
  currency: string | null
  salary_period: string | null
  experience_level: string | null
  work_mode: string | null
  country: string | null

  finalized: boolean
  last_step: ApplicationLastStep | null
  feedback: ApplicationFeedback | null

  created_at: string
  updated_at: string | null
}
```

### Fields removed from response

| Removed field | Replacement |
|---|---|
| `company` (object with `id`, `name`, `url`) | `company_id` + `company_name` (flat fields) |
| `old_company` | gone — was a deprecated migration artifact |

---

## UI recommendations

- **Company selector**: use `GET /companies?name=<query>` to search. When the user selects a result, send `company: "<id>"` in the payload.
- **Free-text company**: when the user types a name but doesn't pick from the list, send `company: { name, url }` where `url` is `null` if they skip the URL field.
- **Display**: use `company_name` everywhere you previously read `company.name`. Show a "linked" indicator when `company_id` is not `null`.

---

## Error codes (unchanged)

| Status | Meaning |
|---|---|
| `404` | `company` was a SnowflakeID that doesn't exist, or `platform_id` not found |
| `422` | Validation error — malformed payload (invalid enum value, bad URL format, etc.) |
| `409` | Application already finalized |
