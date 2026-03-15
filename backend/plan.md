# Plan: Implement api.md Features

## Context

The frontend needs new fields on Application and User models, plus a new PATCH `/api/users/me` endpoint. The `api.md` spec lists all required changes. Some fields already exist (expected_salary, salary_range_min/max on Application; first_name, last_name, current_company, current_salary, experience_years, tech_stack on User). This plan covers only the **truly new** additions.

## Phase 1: Create Enums Module

**New file**: `app/core/enums.py`

Define 5 `str, Enum` classes: `Currency`, `SalaryPeriod`, `ExperienceLevel`, `WorkMode`, `Availability` — values exactly per api.md. Store as ENUM in DB with the same possible values as in the schema enum.

## Phase 2: Update Domain Models

**File**: `app/domain/models.py`

### ApplicationModel — add 5 columns (after `salary_range_max`):
- `currency` — Enum
- `salary_period` — Enum
- `experience_level` — Enum
- `work_mode` — Enum
- `country` — String(100)

### UserModel — add 8 columns (after `_tech_stack`):
- `current_role` — String(200)
- `salary_currency` — Enum
- `salary_period` — Enum
- `seniority_level` — Enum
- `location` — String(200)
- `availability` — Enum
- `bio` — Text
- `linkedin_url` — String(500)

All columns are `Mapped[Optional[str]]`, nullable.

## Phase 3: Database Migration

Run `poetry run task autorevision` to auto-generate migration for the 13 new columns, then `poetry run task auhead` to apply.

## Phase 4: Update Application DTOs

### `app/application/dto/application.py`
- Add 5 new fields to `ApplicationCreateDTO`, `ApplicationUpdateDTO` (using enum types for validation)
- Add 5 new fields to `ApplicationDTO` response (as `str | None`)

### `app/application/dto/user.py`
- Add 8 new fields to `UserDTO` (as `str | None`)
- Create `UserUpdateDTO(BaseModel)` with all updatable user fields (all optional, using enum types for currency/salary_period/seniority_level/availability)
- **Fix**: Remove duplicate `tech_stack` field (line 20, keep line 23)

## Phase 5: Update Presentation Schemas

### `app/presentation/schemas/application.py`
- Add 5 new fields to `CreateApplication`, `UpdateApplication` (with enum validation)
- Add 5 new fields to `Application` response schema

### `app/presentation/schemas/user.py`
- Add 8 new fields to `UserProfile` response schema
- Create `UpdateUserProfile(BaseSchema)` for PATCH input (all fields optional)
- **Fix**: Remove duplicate `tech_stack` field (line 15, keep line 18)

## Phase 6: Update Application Use Cases

### `app/application/use_cases/applications/update_application.py`
Add 5 new field assignments after line 56 (`salary_range_max`):
```python
application.currency = data.currency
application.salary_period = data.salary_period
application.experience_level = data.experience_level
application.work_mode = data.work_mode
application.country = data.country
```

`create_application.py` — no changes needed (repo uses `**dto.model_dump()`).

## Phase 7: Build PATCH /api/users/me (Full Stack)

### `app/domain/repositories/user_repository.py` — add 2 methods:
- `get_by_id(id: int) -> UserModel | None`
- `update(user: UserModel) -> UserModel` (with commit/rollback pattern)

### New file: `app/application/use_cases/update_user.py`
- `UpdateUserUseCase` with `execute(user_id, data: UserUpdateDTO) -> UserDTO`
- Uses `data.model_dump(exclude_unset=True)` for true PATCH semantics
- Special-cases `tech_stack` (uses property setter instead of setattr)

### `app/presentation/api/user.py` — add PATCH route:
```python
@router.patch('/users/me', response_model=UserProfile)
async def update_me(
    payload: UpdateUserProfile,
    c_user: CurrentUserDp,
    user_repo: UserRepositoryDp,
):
    use_case = UpdateUserUseCase(user_repo)
    data = UserUpdateDTO(**payload.model_dump(exclude_unset=True))
    user = await use_case.execute(c_user.id, data)
    return UserProfile.model_validate(user)
```

Import `UserRepositoryDp` from dependencies (already defined at line 65).

## Phase 8: Update Tests

### `app/tests/integration/test_applications.py`
- Update existing test payloads to include new fields (currency, work_mode, etc.)
- Add assertions for new fields in responses

### New file: `app/tests/integration/test_users.py`
- `test_get_me` — verify new fields returned as None
- `test_update_user_profile` — PATCH partial update, verify only sent fields change
- `test_update_user_with_enums` — verify enum validation
- `test_update_user_invalid_enum` — expect 422
- `test_update_user_tech_stack` — array persistence

## Phase 9: Verify Finalize Endpoint

Read-only check: `salary_offer` already exists in `FinalizeApplicationDTO` and `FinalizeApplication` schema — no changes needed.

## Bugs to Fix Along the Way

1. **Duplicate `tech_stack`** in `UserDTO` (lines 20 & 23) — remove line 20
2. **Duplicate `tech_stack`** in `UserProfile` schema (lines 15 & 18) — remove line 15

## Verification

1. `poetry run task ruff` — lint passes
2. `poetry run task pytest` — all tests pass
3. Manual: `POST /applications` with new fields, verify they persist and return
4. Manual: `PATCH /users/me` with subset of fields, verify partial update
5. Manual: `PATCH /users/me` with invalid enum value, verify 422

## Files Modified/Created Summary

| File | Action |
|------|--------|
| `app/core/enums.py` | **Create** |
| `app/domain/models.py` | Modify |
| `migrations/versions/...` | Auto-generated |
| `app/application/dto/application.py` | Modify |
| `app/application/dto/user.py` | Modify + fix |
| `app/presentation/schemas/application.py` | Modify |
| `app/presentation/schemas/user.py` | Modify + fix |
| `app/application/use_cases/applications/update_application.py` | Modify |
| `app/domain/repositories/user_repository.py` | Modify |
| `app/application/use_cases/update_user.py` | **Create** |
| `app/presentation/api/user.py` | Modify |
| `app/tests/integration/test_applications.py` | Modify |
| `app/tests/integration/test_users.py` | **Create** |
