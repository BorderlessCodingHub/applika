from datetime import date
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.dialects import postgresql
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


def _sql(statement) -> str:
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={'literal_binds': True},
        )
    )


async def test_fortnight_metrics_count_screenings_as_initial_screening_only():
    """R-024: only interview/initial_screening is a screening; unknown and
    every other interview type count as interviews, never as screenings."""
    session = Mock()
    statements: list[str] = []

    async def scalar(statement):
        statements.append(_sql(statement))
        return 0

    session.scalar = scalar
    repo = QuinzenalReportRepository(session)

    metrics = await repo.calculate_fortnight_metrics(
        1, date(2026, 1, 1), date(2026, 1, 14)
    )

    assert set(metrics) == {
        'applications_count',
        'initial_screenings_count',
        'interviews_completed_fortnight',
        'active_processes_count',
        'offers_count',
    }
    applications, screenings, interviews, active, offers = statements
    assert "interview_type = 'initial_screening'" in screenings
    assert "event_type = 'interview'" in screenings
    # Distinct applications, not events.
    assert 'SELECT DISTINCT' in screenings
    assert 'interview_type' not in interviews
    assert "event_type = 'interview'" in interviews
    assert "interview_type = 'initial_screening'" in active
    assert 'finalized_at IS NULL' in active
    assert "event_type = 'offer'" in offers
    assert 'timeline_events' not in applications
    for statement in statements:
        assert 'steps_definition' not in statement
        assert 'application_steps' not in statement
