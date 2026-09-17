"""Unit tests for the master-CV use cases.

The rule under test is the owner's: "a user can create up to 3 master CV's".
It is enforced by ``CreateBaseCVUseCase`` in one transaction - lock the user
row, count, refuse at 3, insert - so these tests assert the **order** of those
repository calls, not just their outcome. A test that only checked the count
would pass on code that counts before locking, which is exactly the broken
version the lock exists to prevent.
"""

from typing import Any
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.application.dto.base_cv import (
    BaseCVCreateDTO,
    BaseCVUpdateDTO,
    EducationItem,
    LinkItem,
    SkillCategoryItem,
)
from app.application.use_cases.base_cvs.create import (
    MAX_BASE_CVS,
    CreateBaseCVUseCase,
)
from app.application.use_cases.base_cvs.delete import DeleteBaseCVUseCase
from app.application.use_cases.base_cvs.get import GetBaseCVUseCase
from app.application.use_cases.base_cvs.list import ListBaseCVsUseCase
from app.application.use_cases.base_cvs.update import UpdateBaseCVUseCase
from app.core.exceptions import ResourceConflict, ResourceNotFound
from tests import msg
from tests.unit.conftest import make_model

LIMIT_MESSAGE = 'Base CV limit reached (max 3 per user)'


def _dto(**overrides: Any) -> BaseCVCreateDTO:
    defaults: dict[str, Any] = dict(
        user_id=1,
        name='Backend CV',
        full_name='Ada Lovelace',
        headline='Backend Engineer',
        location='Lisbon, PT',
        email='ada@example.com',
    )
    defaults.update(overrides)
    return BaseCVCreateDTO(**defaults)


def _base_cv(**overrides: Any):
    defaults: dict[str, Any] = dict(
        user_id=1,
        name='Backend CV',
        full_name='Ada Lovelace',
        headline='Backend Engineer',
        location='Lisbon, PT',
        email='ada@example.com',
        phone=None,
        summary='',
        links=[],
        skills=[],
        experience=[],
        projects=[],
        education=[],
        certifications=[],
        languages=[],
    )
    defaults.update(overrides)
    return make_model(**defaults)


def _call_names(repo: AsyncMock) -> list[str]:
    """The repository method names, in the order they were called."""
    return [call[0] for call in repo.mock_calls if call[0]]


# --- The 3-per-user cap -----------------------------------------------------


async def test_create_refuses_the_fourth_base_cv():
    """At the cap the create is refused with the message the user sees."""
    repo = AsyncMock()
    repo.count_by_user_id.return_value = MAX_BASE_CVS

    use_case = CreateBaseCVUseCase(repo)

    with pytest.raises(ResourceConflict) as excinfo:
        await use_case.execute(_dto())

    assert excinfo.value.message == LIMIT_MESSAGE, msg(
        LIMIT_MESSAGE, excinfo.value.message
    )
    repo.create.assert_not_awaited()


async def test_create_refusal_releases_the_user_row_lock():
    """The refusal rolls back, so a waiting create is not blocked forever."""
    repo = AsyncMock()
    repo.count_by_user_id.return_value = MAX_BASE_CVS

    use_case = CreateBaseCVUseCase(repo)

    with pytest.raises(ResourceConflict):
        await use_case.execute(_dto())

    repo.rollback.assert_awaited_once()


async def test_create_succeeds_below_the_cap():
    """With two existing master CVs the third one is created."""
    repo = AsyncMock()
    repo.count_by_user_id.return_value = MAX_BASE_CVS - 1
    repo.create.return_value = _base_cv(name='Third CV')

    use_case = CreateBaseCVUseCase(repo)
    result = await use_case.execute(_dto(name='Third CV'))

    assert result.name == 'Third CV', msg('Third CV', result.name)
    repo.create.assert_awaited_once()
    repo.rollback.assert_not_awaited()


async def test_create_locks_the_user_row_before_counting():
    """The lock is taken *before* the count, and before the insert.

    Counting first would let two concurrent creates both read 2 and both
    insert, producing a fourth master CV.
    """
    repo = AsyncMock()
    repo.count_by_user_id.return_value = 0
    repo.create.return_value = _base_cv()

    use_case = CreateBaseCVUseCase(repo)
    await use_case.execute(_dto())

    names = _call_names(repo)
    assert names[:3] == ['lock_user', 'count_by_user_id', 'create'], msg(
        ['lock_user', 'count_by_user_id', 'create'], names[:3]
    )
    repo.lock_user.assert_awaited_once_with(1)


async def test_create_locks_the_user_row_before_counting_on_refusal():
    """Even on the refusal path the count happens under the lock."""
    repo = AsyncMock()
    repo.count_by_user_id.return_value = MAX_BASE_CVS

    use_case = CreateBaseCVUseCase(repo)

    with pytest.raises(ResourceConflict):
        await use_case.execute(_dto())

    names = _call_names(repo)
    assert names[:2] == ['lock_user', 'count_by_user_id'], msg(
        ['lock_user', 'count_by_user_id'], names[:2]
    )


async def test_the_cap_is_three():
    """The owner's words: "a user can create up to 3 master CV's"."""
    assert MAX_BASE_CVS == 3, msg(3, MAX_BASE_CVS)


async def test_create_persists_every_section_and_the_stamped_user_id():
    """The DTO handed to the repository carries the sections untouched."""
    repo = AsyncMock()
    repo.count_by_user_id.return_value = 0
    repo.create.return_value = _base_cv(
        links=[{'id': 'l1', 'label': 'GitHub', 'url': 'https://gh.dev'}],
        skills=[{'id': 's1', 'category': 'Languages', 'keywords': ['python']}],
        summary='Ten years of backend.',
    )

    use_case = CreateBaseCVUseCase(repo)
    result = await use_case.execute(
        _dto(
            user_id=42,
            summary='Ten years of backend.',
            links=[LinkItem(id='l1', label='GitHub', url='https://gh.dev')],
            skills=[
                SkillCategoryItem(
                    id='s1', category='Languages', keywords=['python']
                )
            ],
            education=[
                EducationItem(
                    id='e1',
                    institution='Riverside Institute',
                    degree="Master's degree",
                    area='Distributed Systems',
                    period='09/2016 - 07/2018',
                )
            ],
        )
    )

    sent = repo.create.await_args.args[0]
    assert sent.user_id == 42, msg(42, sent.user_id)
    assert sent.links[0].id == 'l1', msg('l1', sent.links[0].id)
    assert sent.skills[0].category == 'Languages', msg(
        'Languages', sent.skills[0].category
    )
    assert sent.skills[0].keywords == ['python'], msg(
        ['python'], sent.skills[0].keywords
    )
    assert sent.education[0].institution == 'Riverside Institute', msg(
        'Riverside Institute', sent.education[0].institution
    )
    assert result.summary == 'Ten years of backend.'


# --- list / get / update / delete -------------------------------------------


async def test_list_returns_only_the_acting_users_rows():
    repo = AsyncMock()
    repo.list_by_user_id.return_value = [_base_cv(), _base_cv(id=2)]

    use_case = ListBaseCVsUseCase(repo)
    result = await use_case.execute(7)

    assert len(result) == 2, msg(2, len(result))
    repo.list_by_user_id.assert_awaited_once_with(7)


async def test_get_not_found_for_another_users_row():
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = None

    use_case = GetBaseCVUseCase(repo)

    with pytest.raises(ResourceNotFound, match='Base CV not found'):
        await use_case.execute(99, 1)


async def test_update_applies_only_the_fields_that_were_set():
    """An unset field is never handed to the repository."""
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = _base_cv()
    repo.update.return_value = _base_cv(name='Renamed')

    use_case = UpdateBaseCVUseCase(repo)
    await use_case.execute(1, 1, BaseCVUpdateDTO(name='Renamed'))

    changes = repo.update.await_args.args[1]
    assert changes == {'name': 'Renamed'}, msg({'name': 'Renamed'}, changes)


async def test_update_not_found_for_another_users_row():
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = None

    use_case = UpdateBaseCVUseCase(repo)

    with pytest.raises(ResourceNotFound, match='Base CV not found'):
        await use_case.execute(99, 1, BaseCVUpdateDTO(name='Renamed'))

    repo.update.assert_not_awaited()


async def test_delete_is_never_blocked_by_the_cap():
    """Delete consults no count and never raises ``ResourceConflict``."""
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = _base_cv()

    use_case = DeleteBaseCVUseCase(repo)
    await use_case.execute(1, 1)

    repo.delete.assert_awaited_once()
    repo.count_by_user_id.assert_not_awaited()
    repo.lock_user.assert_not_awaited()


async def test_delete_not_found_for_another_users_row():
    repo = AsyncMock()
    repo.get_by_id_and_user_id.return_value = None

    use_case = DeleteBaseCVUseCase(repo)

    with pytest.raises(ResourceNotFound, match='Base CV not found'):
        await use_case.execute(99, 1)

    repo.delete.assert_not_awaited()


# --- NOT NULL columns are never cleared -------------------------------------


@pytest.mark.parametrize(
    'field',
    [
        'name',
        'full_name',
        'headline',
        'location',
        'email',
        'summary',
        'links',
        'skills',
        'experience',
        'projects',
        'education',
        'certifications',
        'languages',
    ],
)
async def test_update_dto_refuses_an_explicit_null(field: str):
    """Only ``phone`` is nullable; every other field rejects ``None``.

    The presentation schema rejects it first and answers 422, but the rule is
    a property of the master CV, not of HTTP, so the DTO refuses it too - a
    direct caller of the use case cannot reach the database with a NOT NULL
    violation.
    """
    with pytest.raises(ValidationError):
        BaseCVUpdateDTO(**{field: None})


async def test_update_dto_allows_clearing_the_optional_phone():
    """``phone`` is the one nullable column, so ``None`` really clears it."""
    dto = BaseCVUpdateDTO(phone=None)

    assert dto.model_dump(exclude_unset=True) == {'phone': None}


async def test_update_dto_treats_an_omitted_field_as_unset():
    """The null guard must not fire on the defaults of omitted fields."""
    dto = BaseCVUpdateDTO(name='Renamed')

    assert dto.model_dump(exclude_unset=True) == {'name': 'Renamed'}
    assert dto.summary is None
