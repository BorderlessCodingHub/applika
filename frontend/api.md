# API Changes Required

This document lists all backend API changes needed to support the new frontend features.

---

## 1. Applications — New Fields

The `Application` model and its create/update endpoints need **6 new optional fields**.

### Endpoints affected

- `POST /api/applications`
- `PUT /api/applications/:id`
- `GET /api/applications` (response)

### New fields on `Application`

| Field              | Type     | Required | Notes                                      |
|--------------------|----------|----------|--------------------------------------------|
| `currency`         | `string` | No       | ISO 4217 code. See enum values below       |
| `salary_period`    | `string` | No       | Enum: `hourly`, `monthly`, `annual`        |
| `expected_salary`  | `number` | No       | Decimal/float                              |
| `salary_range_min` | `number` | No       | Decimal/float                              |
| `salary_range_max` | `number` | No       | Decimal/float                              |
| `experience_level` | `string` | No       | Enum values below                          |
| `work_mode`        | `string` | No       | Enum: `remote`, `hybrid`, `on_site`        |
| `country`          | `string` | No       | Free text (e.g. "Brazil", "United States") |

### Enum definitions

**`currency`**
```
USD, BRL, EUR, GBP, CAD, AUD, JPY, CHF, INR
```

**`salary_period`**
```
hourly, monthly, annual
```

**`experience_level`**
```
intern, junior, mid_level, senior, staff, lead, principal, specialist
```

**`work_mode`**
```
remote, hybrid, on_site
```

### Database migration

Add columns to the `applications` table:

```sql
ALTER TABLE applications
  ADD COLUMN currency VARCHAR(3),
  ADD COLUMN salary_period VARCHAR(10),
  ADD COLUMN expected_salary DECIMAL(12,2),
  ADD COLUMN salary_range_min DECIMAL(12,2),
  ADD COLUMN salary_range_max DECIMAL(12,2),
  ADD COLUMN experience_level VARCHAR(20),
  ADD COLUMN work_mode VARCHAR(10),
  ADD COLUMN country VARCHAR(100);
```

---

## 2. User Profile — New Fields and PATCH Endpoint

### Endpoint affected

- `GET /api/users/me` (response)
- `PATCH /api/users/me` (**new endpoint** — partial update)

### New fields on `User`

| Field              | Type       | Required | Notes                                          |
|--------------------|------------|----------|-------------------------------------------------|
| `first_name`       | `string`   | No       |                                                  |
| `last_name`        | `string`   | No       |                                                  |
| `current_role`     | `string`   | No       | e.g. "Senior Frontend Engineer"                  |
| `current_company`  | `string`   | No       |                                                  |
| `current_salary`   | `number`   | No       | Decimal/float                                    |
| `salary_currency`  | `string`   | No       | Same `currency` enum as applications             |
| `salary_period`    | `string`   | No       | Same `salary_period` enum as applications        |
| `experience_years` | `integer`  | No       |                                                  |
| `seniority_level`  | `string`   | No       | Same `experience_level` enum as applications     |
| `location`         | `string`   | No       | Free text (e.g. "Sao Paulo, Brazil")             |
| `availability`     | `string`   | No       | Enum: `open_to_work`, `casually_looking`, `not_looking` |
| `bio`              | `string`   | No       | Text/textarea                                    |
| `linkedin_url`     | `string`   | No       | URL                                              |
| `tech_stack`       | `string[]` | No       | Array of strings (e.g. `["React", "Python"]`)    |

### `PATCH /api/users/me`

- Accepts any subset of the fields above as JSON body
- Returns the updated `User` object
- All fields are optional (partial update)

### Database migration

Add columns to the `users` table:

```sql
ALTER TABLE users
  ADD COLUMN first_name VARCHAR(100),
  ADD COLUMN last_name VARCHAR(100),
  ADD COLUMN current_role VARCHAR(200),
  ADD COLUMN current_company VARCHAR(200),
  ADD COLUMN current_salary DECIMAL(12,2),
  ADD COLUMN salary_currency VARCHAR(3),
  ADD COLUMN salary_period VARCHAR(10),
  ADD COLUMN experience_years INTEGER,
  ADD COLUMN seniority_level VARCHAR(20),
  ADD COLUMN location VARCHAR(200),
  ADD COLUMN availability VARCHAR(20),
  ADD COLUMN bio TEXT,
  ADD COLUMN linkedin_url VARCHAR(500),
  ADD COLUMN tech_stack TEXT[];  -- or JSON array depending on DB
```

---

## 3. Finalization — `salary_offer` Field

Already partially supported. Ensure the finalization endpoint accepts:

### Endpoint

- `POST /api/applications/:id/finalize`

### Body

| Field          | Type     | Required | Notes              |
|----------------|----------|----------|--------------------|
| `step_id`      | `string` | Yes      | Already exists     |
| `feedback_id`  | `string` | Yes      | Already exists     |
| `date`         | `string` | Yes      | Already exists     |
| `salary_offer` | `number` | No       | Decimal/float      |
| `observation`  | `string` | No       | Already exists     |

---

## 4. Summary of All New Enums

These should be enforced at the API level (Python Enum or DB check constraint):

```python
class Currency(str, Enum):
    USD = "USD"
    BRL = "BRL"
    EUR = "EUR"
    GBP = "GBP"
    CAD = "CAD"
    AUD = "AUD"
    JPY = "JPY"
    CHF = "CHF"
    INR = "INR"

class SalaryPeriod(str, Enum):
    HOURLY = "hourly"
    MONTHLY = "monthly"
    ANNUAL = "annual"

class ExperienceLevel(str, Enum):
    INTERN = "intern"
    JUNIOR = "junior"
    MID_LEVEL = "mid_level"
    SENIOR = "senior"
    STAFF = "staff"
    LEAD = "lead"
    PRINCIPAL = "principal"
    SPECIALIST = "specialist"

class WorkMode(str, Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ON_SITE = "on_site"

class Availability(str, Enum):
    OPEN_TO_WORK = "open_to_work"
    CASUALLY_LOOKING = "casually_looking"
    NOT_LOOKING = "not_looking"
```

---

## 5. No Changes Needed

These endpoints remain unchanged:

- `GET /api/auth/github/login`
- `GET /api/auth/logout`
- `GET /api/auth/refresh`
- `GET /api/applications/:id/steps`
- `POST /api/applications/:id/steps`
- `DELETE /api/applications/:id/steps/:stepId`
- `DELETE /api/applications/:id`
- All statistics endpoints (`/statistics/*`)
- All supports endpoints (`/supports/*`)
- All companies endpoints (`/companies/*`)
