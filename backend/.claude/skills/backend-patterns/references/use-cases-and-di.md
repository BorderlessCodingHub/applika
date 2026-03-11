# Use Cases & Dependency Injection Reference

## Table of Contents
- [Use Case Pattern](#use-case-pattern)
- [Use Case Examples](#use-case-examples)
- [Route Handler Pattern](#route-handler-pattern)
- [Dependency Injection Wiring](#dependency-injection-wiring)
- [Registering Routes](#registering-routes)

## Use Case Pattern

Each use case is a class with:
1. A constructor that receives repository dependencies
2. A single `async def execute()` method containing the business logic

Use cases live in `app/application/use_cases/<feature>/<action>.py` — one file per action (create, list, update, delete, etc.).

The use case is the right place for business rule validation. If a required resource doesn't exist, raise `ResourceNotFound`. If there's a conflict (like trying to modify a finalized application), raise `ApplicationFinalized` or `ResourceConflict`.

Use cases return DTOs, never ORM models. Convert with `SomeDTO.model_validate(orm_instance)`.

## Use Case Examples

### Create (validates related entity, creates, returns DTO)

```python
# app/application/use_cases/tags/create_tag.py

from app.application.dto.tag import TagCreateDTO, TagDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.tag_repository import TagRepository
from app.domain.repositories.user_repository import UserRepository


class CreateTagUseCase:
    def __init__(
        self,
        tag_repo: TagRepository,
        user_repo: UserRepository,
    ):
        self.tag_repo = tag_repo
        self.user_repo = user_repo

    async def execute(self, data: TagCreateDTO) -> TagDTO:
        # Validate that the user exists
        user = await self.user_repo.get_by_id(data.user_id)
        if not user:
            raise ResourceNotFound('User not found')

        tag = await self.tag_repo.create(data)
        return TagDTO.model_validate(tag)
```

### List (fetch + transform)

```python
# app/application/use_cases/tags/list_tags.py

from app.application.dto.tag import TagDTO
from app.domain.repositories.tag_repository import TagRepository


class ListTagsUseCase:
    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    async def execute(self, user_id: int) -> list[TagDTO]:
        tags = await self.tag_repo.get_all_by_user_id(user_id)
        return [TagDTO.model_validate(t) for t in tags]
```

### Update (fetch, validate, modify, save)

```python
# app/application/use_cases/tags/update_tag.py

from app.application.dto.tag import TagUpdateDTO, TagDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.tag_repository import TagRepository


class UpdateTagUseCase:
    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    async def execute(
        self, tag_id: int, user_id: int, data: TagUpdateDTO
    ) -> TagDTO:
        tag = await self.tag_repo.get_by_id_and_user_id(tag_id, user_id)
        if not tag:
            raise ResourceNotFound('Tag not found')

        # Update fields on the ORM model
        tag.name = data.name
        tag.color = data.color

        updated = await self.tag_repo.update(tag)
        return TagDTO.model_validate(updated)
```

### Delete (fetch, validate, remove)

```python
# app/application/use_cases/tags/delete_tag.py

from app.core.exceptions import ResourceNotFound
from app.domain.repositories.tag_repository import TagRepository


class DeleteTagUseCase:
    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    async def execute(self, tag_id: int, user_id: int) -> None:
        tag = await self.tag_repo.get_by_id_and_user_id(tag_id, user_id)
        if not tag:
            raise ResourceNotFound('Tag not found')

        await self.tag_repo.delete(tag)
```

## Route Handler Pattern

Routes live in `app/presentation/api/<feature>.py`. They are thin — their job is to:
1. Receive the request (schema validation happens automatically)
2. Inject dependencies (repositories, current user)
3. Build the DTO from the request schema + auth context
4. Call the use case
5. Return the response schema

```python
# app/presentation/api/tag.py

from typing import List
from fastapi import APIRouter

from app.application.dto.tag import TagCreateDTO, TagUpdateDTO
from app.application.use_cases.tags.create_tag import CreateTagUseCase
from app.application.use_cases.tags.list_tags import ListTagsUseCase
from app.application.use_cases.tags.update_tag import UpdateTagUseCase
from app.application.use_cases.tags.delete_tag import DeleteTagUseCase
from app.presentation.dependencies import (
    CurrentUserDp,
    TagRepositoryDp,
    UserRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.tag import CreateTag, Tag, UpdateTag

router = APIRouter(
    tags=['Tags'],
    responses={'403': {'model': DetailSchema}},
)


@router.post(
    '/tags',
    response_model=Tag,
    status_code=201,
    responses={'404': {'model': DetailSchema}},
)
async def create(
    payload: CreateTag,
    c_user: CurrentUserDp,
    tag_repo: TagRepositoryDp,
    user_repo: UserRepositoryDp,
):
    use_case = CreateTagUseCase(tag_repo, user_repo)
    data = TagCreateDTO(**payload.model_dump(), user_id=c_user.id)
    tag = await use_case.execute(data)
    return Tag.model_validate(tag)


@router.get('/tags', response_model=List[Tag])
async def list_tags(
    c_user: CurrentUserDp,
    tag_repo: TagRepositoryDp,
):
    use_case = ListTagsUseCase(tag_repo)
    return await use_case.execute(c_user.id)


@router.put(
    '/tags/{tag_id}',
    response_model=Tag,
    responses={'404': {'model': DetailSchema}},
)
async def update_tag(
    tag_id: int,
    payload: UpdateTag,
    c_user: CurrentUserDp,
    tag_repo: TagRepositoryDp,
):
    use_case = UpdateTagUseCase(tag_repo)
    data = TagUpdateDTO(**payload.model_dump())
    tag = await use_case.execute(tag_id, c_user.id, data)
    return Tag.model_validate(tag)


@router.delete(
    '/tags/{tag_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_tag(
    tag_id: int,
    c_user: CurrentUserDp,
    tag_repo: TagRepositoryDp,
):
    use_case = DeleteTagUseCase(tag_repo)
    await use_case.execute(tag_id, c_user.id)
```

Notice the pattern: the route handler instantiates the use case inline — no complex DI container. The use case is just a class.

## Dependency Injection Wiring

All dependency wiring happens in `app/presentation/dependencies.py`.

### Adding a new repository dependency

1. Import the repository class
2. Create a factory function
3. Create a type alias

```python
# In app/presentation/dependencies.py

from app.domain.repositories.tag_repository import TagRepository

# Factory function
def get_tag_repository(session: DbSession):
    return TagRepository(session)

# Type alias for use in route signatures
TagRepositoryDp = Annotated[
    TagRepository, Depends(get_tag_repository)
]
```

`DbSession` is already defined as `Annotated[AsyncSession, Depends(get_session)]`, so every repository factory automatically receives the DB session.

### Using dependencies in routes

Just use the type alias in the route function signature:

```python
async def create(
    payload: CreateTag,
    c_user: CurrentUserDp,       # authenticated user
    tag_repo: TagRepositoryDp,   # injected repository
):
```

FastAPI resolves the dependency chain automatically: route needs `TagRepositoryDp` → calls `get_tag_repository()` → which needs `DbSession` → calls `get_session()`.

## Registering Routes

After creating the route file, register it in `app/main.py`:

```python
from app.presentation.api.tag import router as tag_router

# Add with the other routers
app.include_router(tag_router)
```

That's it — no prefix needed since routes define their own paths.
