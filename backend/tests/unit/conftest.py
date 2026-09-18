from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.core.enums import EventType


def make_model(**kwargs):
    """Create a SimpleNamespace with defaults for BaseSchema fields
    that pass pydantic model_validate(from_attributes=True)."""
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def make_application(**kwargs):
    """SimpleNamespace mimicking ApplicationModel for model_validate."""
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'company_id': None,
        'company_name': 'Acme',
        'role': 'Engineer',
        'mode': 'active',
        'platform_id': 1,
        'application_date': date(2025, 12, 1),
        'link_to_job': None,
        'observation': None,
        'expected_salary': None,
        'salary_range_min': None,
        'salary_range_max': None,
        'currency': None,
        'salary_period': None,
        'experience_level': None,
        'work_mode': None,
        'country': None,
        'job_description': None,
        'cycle_id': None,
        'finalized_at': None,
    }
    defaults.update(kwargs)
    # ApplicationModel.finalized is a property over finalized_at.
    defaults.setdefault('finalized', defaults['finalized_at'] is not None)
    return SimpleNamespace(**defaults)


def make_event(**kwargs):
    """SimpleNamespace mimicking TimelineEventModel."""
    defaults = {
        'id': 700,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'application_id': 1,
        'user_id': 1,
        'event_type': EventType.NOTE,
        'interview_type': None,
        'event_date': date(2025, 12, 5),
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def make_step_definition(**kwargs):
    """SimpleNamespace mimicking StepDefinitionModel (with its mapping)."""
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'name': 'Phase 2',
        'color': '#007bff',
        'strict': False,
        'event_type': None,
        'interview_type': None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def make_read_model(
    latest: dict | None = None,
    offers: dict | None = None,
    catalog: list | None = None,
) -> ApplicationReadModel:
    """A real ApplicationReadModel over mocked repositories."""
    timeline_repo = AsyncMock()
    timeline_repo.latest_for_applications.return_value = latest or {}
    timeline_repo.latest_offer_for_applications.return_value = offers or {}
    step_repo = AsyncMock()
    step_repo.get_all.return_value = catalog or []
    return ApplicationReadModel(timeline_repo, step_repo)


def make_user(**kwargs):
    """SimpleNamespace mimicking UserModel."""
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'github_id': 1,
        'username': 'testuser',
        'email': 'test@test.com',
        'first_name': None,
        'last_name': None,
        'avatar_url': None,
        'current_role': None,
        'current_company': None,
        'current_salary': 0,
        'salary_currency': None,
        'salary_period': None,
        'experience_years': 0,
        'seniority_level': None,
        'location': None,
        'availability': None,
        'bio': None,
        'linkedin_url': None,
        'tech_stack': [],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def make_cycle(**kwargs):
    """SimpleNamespace mimicking CycleModel."""
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'user_id': 1,
        'name': 'Cycle 1',
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)
