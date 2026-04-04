from datetime import date, datetime, timezone
from types import SimpleNamespace


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
        'salary_offer': None,
        'currency': None,
        'salary_period': None,
        'experience_level': None,
        'work_mode': None,
        'country': None,
        'finalized': False,
        'last_step': None,
        'feedback': None,
        'feedback_id': None,
        'feedback_date': None,
        'last_step_id': None,
        'last_step_date': None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def make_step(**kwargs):
    """SimpleNamespace mimicking ApplicationStepModel."""
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'application_id': 1,
        'step_id': 1,
        'step_name': 'Applied',
        'step_date': date(2025, 12, 5),
        'observation': None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


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
