from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ResourceConflict
from app.domain.models import QuinzenalReportModel
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)


async def test_create_translates_duplicate_day_integrity_error():
    session = Mock()
    session.add = Mock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    session.commit = AsyncMock(
        side_effect=IntegrityError(
            statement='INSERT INTO quinzenal_reports (...) VALUES (...)',
            params={},
            orig=Exception(
                'duplicate key value violates unique constraint '
                '"uq_quinzenal_reports_user_day"'
            ),
        )
    )

    repo = QuinzenalReportRepository(session)

    with pytest.raises(ResourceConflict, match='Report already submitted'):
        await repo.create(QuinzenalReportModel())

    session.rollback.assert_awaited_once()


async def test_create_reraises_unrelated_integrity_error():
    session = Mock()
    session.add = Mock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    integrity_error = IntegrityError(
        statement='INSERT INTO quinzenal_reports (...) VALUES (...)',
        params={},
        orig=Exception('some other integrity error'),
    )
    session.commit = AsyncMock(side_effect=integrity_error)

    repo = QuinzenalReportRepository(session)

    with pytest.raises(IntegrityError):
        await repo.create(QuinzenalReportModel())

    session.rollback.assert_awaited_once()
