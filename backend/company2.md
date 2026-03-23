# Plan: Company Resolution on Application Create/Update

## Context
The current flow requires a separate POST /companies call before creating an application. The new strategy embeds company resolution directly into the create/update application payload: the `company` field can be an existing company ID (SnowflakeID), an anonymous name (no URL), or a new company to be registered (name + URL). The presentation schemas are already correct and must not change.

---

## Changes Overview

### 1. Alembic Migration (new file)
**File:** `migrations/versions/<rev>_applications_old_company_to_company_name.py`

Steps:
1. Add `company_name` column `VARCHAR(200)` NULLABLE
2. Backfill: `UPDATE applications a SET company_name = c.name FROM companies c WHERE a.company_id = c.id AND a.old_company IS NULL`
3. Backfill legacy: `UPDATE applications SET company_name = old_company, company_id = NULL WHERE old_company IS NOT NULL`
4. Fallback: `UPDATE applications SET company_name = 'Unknown' WHERE company_name IS NULL`
5. `ALTER COLUMN company_name SET NOT NULL`
6. `DROP COLUMN old_company`
7. `ALTER COLUMN company_id DROP NOT NULL`

Downgrade: reverse (rename company_name → old_company, restore NOT NULL on company_id).

---

### 2. ORM Model
**File:** `app/domain/models.py` — `ApplicationModel`

- `company_id`: `Mapped[Optional[int]]` (remove `nullable=False`)
- Replace `old_company: Mapped[Optional[str]]` with `company_name: Mapped[str]` (NOT NULL)
- Update relationship: `company_rel: Mapped[Optional['CompanyModel']]`

---

### 3. Application DTOs
**File:** `app/application/dto/application.py`

Add new input DTO:
```python
class ApplicationCompanyInputDTO(BaseModel):
    name: str
    url: HttpUrl | None
```

Update `ApplicationCreateDTO`:
- Replace `company_id: int` with `company: int | ApplicationCompanyInputDTO`

Update `ApplicationUpdateDTO`:
- Same replacement

Update `ApplicationDTO`:
- Remove `company: ApplicationCompany | None`
- Add `company_id: int | None`
- Add `company_name: str`
- Remove `old_company` entirely

Remove now-unused `ApplicationCompany` DTO class.

---

### 4. ApplicationRepository
**File:** `app/domain/repositories/application_repository.py`

Update `create()` signature:
```python
async def create(
    self,
    application: ApplicationCreateDTO,
    company_id: int | None,
    company_name: str,
) -> ApplicationModel:
    db_application = ApplicationModel(
        **application.model_dump(exclude={'link_to_job', 'company'}),
        link_to_job=...,
        company_id=company_id,
        company_name=company_name,
    )
```

---

### 5. CreateApplicationUseCase
**File:** `app/application/use_cases/applications/create_application.py`

3-case `_resolve_company()`:
1. `int` → lookup existing company (404 if missing) → `(id, name)`
2. `{name, url}` → create new company → `(new_id, name)`
3. `{name, url=None}` → anonymous → `(None, name)`

---

### 6. UpdateApplicationUseCase
**File:** `app/application/use_cases/applications/update_application.py`

Same `_resolve_company()`. Set `application.company_id` and `application.company_name` on the ORM model directly.

---

### 7. ListApplicationsUseCase
**File:** `app/application/use_cases/applications/list_applications.py`

Remove `old_company` special-casing block.

---

### 8. Company API
**File:** `app/presentation/api/company.py`

Remove `POST /companies`. Keep `GET /companies`.
`CreateCompanyUseCase` and `CompanyCreateDTO` stay — used internally by application use cases.

---

### 9. Application Response Schema
**File:** `app/presentation/schemas/application.py`

Remove `old_company: str | None` from `Application`.

---

## Files NOT Changed
- `app/presentation/api/application.py` — works as-is

---

## Verification

1. `uv run task autorevision` — verify migration
2. `uv run task auhead` — apply migration
3. `uv run task pytest` — run tests
4. Manual:
   - `company: <id>` → existing company resolved
   - `company: {name, url: null}` → anonymous, company_id null
   - `company: {name, url}` → new company created
   - `POST /companies` → 404
   - `GET /companies` → works
