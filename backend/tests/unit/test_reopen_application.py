"""Reopen, unit level (R-008, R-009, R-011).

Ported from mynextjob's ``test_application_finalize_reopen_use_cases.py``
(the reopen half), with applika's archived code (422).

Pinned:
1. reopen clears ``finalized_at`` (closed -> open);
2. reopening an open application is a no-op: no write, no 409;
3. archived is refused, even when closed, no write;
4. a missing or foreign application is a 404;
5. a real reopen is logged as ``application.reopened``, a no-op is not.
"""

import logging
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.application.use_cases.applications.guards import ARCHIVED_MESSAGE
from app.application.use_cases.applications.reopen_application import (
    ReopenApplicationUseCase,
)
from app.core.exceptions import BusinessRuleViolation, ResourceNotFound
from tests.unit.conftest import make_application, make_read_model


def _events(caplog) -> list[str | None]:
    return [
        getattr(record, 'extra_data', {}).get('event')
        for record in caplog.records
        if hasattr(record, 'extra_data')
    ]


async def test_reopen_clears_finalized_at_on_closed_application():
    app_repo = AsyncMock()
    application = make_application(
        finalized_at=datetime(2026, 7, 1, tzinfo=UTC)
    )
    snapshot = dict(vars(application))
    app_repo.get_by_id_and_user_id.return_value = application
    app_repo.update.return_value = make_application(finalized_at=None)

    result = await ReopenApplicationUseCase(
        app_repo, make_read_model()
    ).execute(123, user_id=1)

    written = vars(app_repo.update.call_args.args[0])
    assert written['finalized_at'] is None
    changed = {key for key in written if written[key] != snapshot.get(key)}
    assert changed == {'finalized_at'}
    assert result.finalized_at is None
    assert result.finalized is False


async def test_reopen_idempotent_on_already_open_no_write_no_conflict(caplog):
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(
        finalized_at=None
    )

    with caplog.at_level(logging.INFO, logger='app'):
        result = await ReopenApplicationUseCase(
            app_repo, make_read_model()
        ).execute(123, user_id=1)

    assert result.finalized_at is None
    app_repo.update.assert_not_called()
    assert 'application.reopened' not in _events(caplog)


async def test_reopen_missing_or_foreign_raises_not_found():
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await ReopenApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )
    app_repo.update.assert_not_called()


async def test_reopen_rejects_archived_application():
    """A closed application swept into a cycle stays closed for good."""
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(
        cycle_id=7, finalized_at=datetime(2026, 7, 1, tzinfo=UTC)
    )

    with pytest.raises(BusinessRuleViolation) as exc:
        await ReopenApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )
    assert str(exc.value) == ARCHIVED_MESSAGE
    app_repo.update.assert_not_called()


async def test_reopen_emits_reopened_audit_event(caplog):
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(
        finalized_at=datetime(2026, 7, 1, tzinfo=UTC)
    )
    app_repo.update.return_value = make_application(finalized_at=None)

    with caplog.at_level(logging.INFO, logger='app'):
        await ReopenApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )

    assert 'application.reopened' in _events(caplog)
