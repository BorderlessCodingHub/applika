# Models & Repositories Reference

## Table of Contents
- [ORM Model Pattern](#orm-model-pattern)
- [BaseMixin](#basemixin)
- [Relationship Conventions](#relationship-conventions)
- [Repository Pattern](#repository-pattern)
- [Repository: Read Operations](#repository-read-operations)
- [Repository: Write Operations](#repository-write-operations)

## ORM Model Pattern

All models live in `app/domain/models.py` and inherit from `BaseMixin, Base`.

```python
# app/domain/models.py

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class BaseMixin:
    id: Mapped[int] = mapped_column(
        sa.Integer, primary_key=True, autoincrement=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=sa.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=None,
        onupdate=sa.func.now(), nullable=True
    )


class Base(DeclarativeBase): ...
```

### Example: Adding a new model

```python
class TagModel(BaseMixin, Base):
    __tablename__ = 'tags'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#007bff')
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )

    # Relationships
    user: Mapped['UserModel'] = relationship(back_populates='tags')
    applications: Mapped[List['ApplicationModel']] = relationship(
        back_populates='tag'
    )
```

## Relationship Conventions

- Use `Mapped[List['ModelName']]` for one-to-many (parent side)
- Use `Mapped['ModelName']` for many-to-one (child side)
- Use `Mapped[Optional['ModelName']]` for nullable foreign keys
- Always set `back_populates` on both sides
- Use `ondelete='CASCADE'` on foreign keys when child should be deleted with parent
- For computed/derived data, use `@property` (see `ApplicationModel.finalized`, `ApplicationModel.last_step`)

## Repository Pattern

One file per model: `app/domain/repositories/<name>_repository.py`

### Repository structure

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.domain.models import SomeModel
from app.application.dto.some_dto import SomeCreateDTO


class SomeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # read methods...
    # write methods...
```

The constructor always takes `AsyncSession` and nothing else. The session comes from FastAPI dependency injection.

## Repository: Read Operations

Read operations use `select()` and don't need try/except — they don't modify data.

```python
# Single record by ID (with eager loading)
async def get_by_id(self, id: int) -> SomeModel | None:
    return await self.session.scalar(
        select(SomeModel)
        .where(SomeModel.id == id)
        .options(
            selectinload(SomeModel.related_items),
        )
    )

# Single record with multiple conditions
async def get_by_id_and_user_id(
    self, id: int, user_id: int
) -> SomeModel | None:
    return await self.session.scalar(
        select(SomeModel)
        .where(
            SomeModel.id == id,
            SomeModel.user_id == user_id,
        )
        .options(
            selectinload(SomeModel.last_step_def),
            selectinload(SomeModel.feedback_def),
        )
    )

# List with ordering
async def get_all_by_user_id(self, user_id: int) -> List[SomeModel]:
    return await self.session.scalars(
        select(SomeModel)
        .where(SomeModel.user_id == user_id)
        .order_by(SomeModel.created_at.desc())
    )
```

Note: `session.scalar()` returns one or `None`. `session.scalars()` returns an iterable.

### Eager loading

Use `selectinload()` for collections (one-to-many) and `joinedload()` for single relations (many-to-one) when the relationship data will be accessed.

## Repository: Write Operations

Write operations use try/except with explicit commit/rollback.

```python
# Create
async def create(self, data: SomeCreateDTO) -> SomeModel:
    try:
        db_record = SomeModel(**data.model_dump())
        self.session.add(db_record)
        await self.session.commit()
        await self.session.refresh(db_record)
        return db_record
    except Exception as e:
        await self.session.rollback()
        raise e

# Update (receives the ORM model, already modified by the use case)
async def update(self, record: SomeModel) -> SomeModel:
    try:
        record.updated_at = datetime.now(timezone.utc)
        self.session.add(record)
        await self.session.commit()
        return record
    except Exception as e:
        await self.session.rollback()
        raise e

# Delete by ID
async def delete_by_id(self, id: int) -> int:
    result = await self.session.execute(
        delete(SomeModel).where(SomeModel.id == id)
    )
    await self.session.commit()
    return result.rowcount

# Delete model instance
async def delete(self, record: SomeModel):
    await self.session.delete(record)
    await self.session.commit()
```

### Special: URL fields

When a DTO has an `HttpUrl` field (Pydantic), convert to `str` before saving:

```python
db_record = SomeModel(
    **data.model_dump(exclude={'link_to_job'}),
    link_to_job=(str(data.link_to_job) if data.link_to_job else None),
)
```

This is because SQLAlchemy stores strings, but Pydantic's `HttpUrl` is a special type.
