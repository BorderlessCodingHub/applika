"""Unit tests for the saved job search use cases and wire schemas (KODI-047,
T071/T072). Mocked repository, no database; the lock and the unique index
are covered against Postgres in ``tests/integration/test_job_searches.py``.
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, call

import pytest
from asyncpg.exceptions import UniqueViolationError
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.application.dto.job_search import (
    JobSearchInputDTO,
    JobSearchUpdateDTO,
)
from app.application.use_cases.job_searches import (
    LIMIT_REACHED,
    MAX_SAVED_SEARCHES,
)
from app.application.use_cases.job_searches.create_search import (
    CreateJobSearchUseCase,
)
from app.application.use_cases.job_searches.delete_search import (
    DeleteJobSearchUseCase,
)
from app.application.use_cases.job_searches.list_searches import (
    ListJobSearchesUseCase,
)
from app.application.use_cases.job_searches.update_search import (
    UpdateJobSearchUseCase,
)
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.repositories.saved_job_search_repository import (
    NAME_TAKEN,
    SavedJobSearchRepository,
)
from app.presentation.schemas.job_searches import (
    JobSearchCreate,
    JobSearchUpdate,
)


def search(**overrides: Any) -> SimpleNamespace:
    values: dict[str, Any] = {
        'id': 5,
        'user_id': 1,
        'name': 'Remote',
        'filters': {'sort': 'fit'},
        'created_at': datetime(2026, 10, 12, tzinfo=UTC),
        'updated_at': None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def repo(count: int = 0, taken: bool = False) -> AsyncMock:
    mock = AsyncMock()
    mock.count_by_user_id.return_value = count
    mock.name_taken.return_value = taken
    mock.create.return_value = search()
    mock.update.return_value = search()
    mock.get_by_id_and_user_id.return_value = search()
    return mock


def create_input() -> JobSearchInputDTO:
    return JobSearchInputDTO(user_id=1, name='Remote', filters={'sort': 'fit'})


def test_the_cap_is_ten():
    assert MAX_SAVED_SEARCHES == 10
    assert LIMIT_REACHED == 'Saved search limit reached (max 10)'


async def test_create_locks_counts_then_inserts():
    mock = repo(count=MAX_SAVED_SEARCHES - 1)

    result = await CreateJobSearchUseCase(mock).execute(create_input())

    assert mock.method_calls[:3] == [
        call.lock_user(1),
        call.count_by_user_id(1),
        call.name_taken(1, 'Remote'),
    ]
    mock.create.assert_awaited_once_with(1, 'Remote', {'sort': 'fit'})
    assert result.id == 5


async def test_create_at_the_cap_rolls_back_and_is_409():
    mock = repo(count=MAX_SAVED_SEARCHES)

    with pytest.raises(ResourceConflict) as raised:
        await CreateJobSearchUseCase(mock).execute(create_input())

    assert str(raised.value) == LIMIT_REACHED
    mock.rollback.assert_awaited_once()
    mock.create.assert_not_awaited()


async def test_create_with_a_taken_name_rolls_back_and_is_409():
    mock = repo(taken=True)

    with pytest.raises(ResourceConflict) as raised:
        await CreateJobSearchUseCase(mock).execute(create_input())

    assert str(raised.value) == NAME_TAKEN
    mock.rollback.assert_awaited_once()
    mock.create.assert_not_awaited()


async def test_update_unknown_or_foreign_is_404():
    mock = repo()
    mock.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound, match='Saved search not found'):
        await UpdateJobSearchUseCase(mock).execute(
            5, JobSearchUpdateDTO(user_id=1, name='x')
        )
    mock.get_by_id_and_user_id.assert_awaited_once_with(5, 1)
    mock.update.assert_not_awaited()


async def test_rename_checks_other_searches_only():
    mock = repo()

    await UpdateJobSearchUseCase(mock).execute(
        5, JobSearchUpdateDTO(user_id=1, name='New')
    )

    mock.name_taken.assert_awaited_once_with(1, 'New', exclude_id=5)
    mock.update.assert_awaited_once()


async def test_rename_to_a_taken_name_is_409():
    mock = repo(taken=True)

    with pytest.raises(ResourceConflict) as raised:
        await UpdateJobSearchUseCase(mock).execute(
            5, JobSearchUpdateDTO(user_id=1, name='Taken')
        )

    assert str(raised.value) == NAME_TAKEN
    mock.update.assert_not_awaited()


async def test_filters_only_update_skips_the_name_check():
    mock = repo()

    await UpdateJobSearchUseCase(mock).execute(
        5, JobSearchUpdateDTO(user_id=1, filters={'min_fit': 10})
    )

    mock.name_taken.assert_not_awaited()
    target, name, filters = mock.update.await_args.args
    assert (name, filters) == (None, {'min_fit': 10})


async def test_delete_unknown_is_404_and_known_is_deleted():
    mock = repo()
    mock.get_by_id_and_user_id.return_value = None
    with pytest.raises(ResourceNotFound):
        await DeleteJobSearchUseCase(mock).execute(5, 1)
    mock.delete.assert_not_awaited()

    found = search()
    mock.get_by_id_and_user_id.return_value = found
    await DeleteJobSearchUseCase(mock).execute(5, 1)
    mock.delete.assert_awaited_once_with(found)


async def test_list_maps_the_callers_searches():
    mock = repo()
    mock.list_by_user_id.return_value = [search(), search(id=6, name='B')]

    result = await ListJobSearchesUseCase(mock).execute(1)

    mock.list_by_user_id.assert_awaited_once_with(1)
    assert [(s.id, s.name) for s in result] == [(5, 'Remote'), (6, 'B')]


async def test_repository_turns_the_name_index_into_the_409():
    session = AsyncMock()
    session.add = lambda _: None
    session.commit.side_effect = IntegrityError(
        'INSERT',
        {},
        UniqueViolationError(
            'duplicate key value violates unique constraint '
            '"uq_saved_job_searches_user_name"'
        ),
    )

    with pytest.raises(ResourceConflict) as raised:
        await SavedJobSearchRepository(session).create(1, 'A', {})

    assert str(raised.value) == NAME_TAKEN
    session.rollback.assert_awaited_once()


async def test_repository_leaves_other_integrity_errors_alone():
    session = AsyncMock()
    session.add = lambda _: None
    session.commit.side_effect = IntegrityError(
        'INSERT', {}, UniqueViolationError('fk_saved_job_searches_user_id')
    )

    with pytest.raises(IntegrityError):
        await SavedJobSearchRepository(session).create(1, 'A', {})


# ---------------------------------------------------------------------------
# Wire schemas
# ---------------------------------------------------------------------------


def test_create_strips_the_name():
    body = JobSearchCreate(name='  Remote  ', filters={})  # type: ignore[arg-type]

    assert body.name == 'Remote'


@pytest.mark.parametrize(
    'body',
    [
        {'name': '', 'filters': {}},
        {'name': '   ', 'filters': {}},
        {'name': 'x' * 101, 'filters': {}},
        {'name': ' ' + 'x' * 101 + ' ', 'filters': {}},
        {'name': 'ok', 'filters': {'unknown': 1}},
        {'name': 'ok'},
        {'name': 'ok', 'filters': {}, 'notify': True},
    ],
)
def test_create_refuses(body: dict[str, Any]):
    with pytest.raises(ValidationError):
        JobSearchCreate.model_validate(body)


def test_a_padded_hundred_character_name_is_accepted():
    body = JobSearchCreate.model_validate({
        'name': '  ' + 'x' * 100 + '  ',
        'filters': {},
    })

    assert body.name == 'x' * 100


def test_update_needs_a_name_or_filters():
    with pytest.raises(ValidationError):
        JobSearchUpdate.model_validate({})
    with pytest.raises(ValidationError):
        JobSearchUpdate.model_validate({'name': None, 'filters': None})
    assert JobSearchUpdate.model_validate({'name': ' a '}).name == 'a'
    assert JobSearchUpdate.model_validate({'filters': {}}).filters is not None
