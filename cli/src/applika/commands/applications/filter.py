from datetime import date
from typing import Any

from applika.schemas.application import ApplicationEntry
from applika.schemas.enums import ModeFilter, StatusFilter


def filter_applications(
    applications: list[ApplicationEntry],
    supports: dict[str, Any],
    search: str | None = None,
    mode: ModeFilter = ModeFilter.ALL,
    status: StatusFilter = StatusFilter.ALL,
    platform: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[ApplicationEntry]:
    platform_id = _resolve_platform_id(supports, platform) if platform else None
    search_term = (search or '').strip().lower()
    date_from = date.fromisoformat(from_date) if from_date else None
    date_to = date.fromisoformat(to_date) if to_date else None

    def matches(app: ApplicationEntry) -> bool:
        if search_term:
            company_name = (app.get('company_name') or '').lower()
            role = (app.get('role') or '').lower()
            if search_term not in company_name and search_term not in role:
                return False

        if mode != ModeFilter.ALL and app.get('mode') != mode:
            return False

        if status == StatusFilter.ACTIVE and app.get('finalized'):
            return False

        if status == StatusFilter.FINALIZED and not app.get('finalized'):
            return False

        if platform_id and str(app.get('platform_id')) != platform_id:
            return False

        app_date = date.fromisoformat(app['application_date'])
        if date_from and app_date < date_from:
            return False
        if date_to and app_date > date_to:
            return False

        return True

    return sorted(
        (app for app in applications if matches(app)),
        key=lambda app: app['application_date'],
        reverse=True,
    )


def _resolve_platform_id(supports: dict[str, Any], platform_name: str) -> str:
    normalized_name = platform_name.strip().lower()
    match = next(
        (
            platform
            for platform in supports['platforms']
            if platform['name'].strip().lower() == normalized_name
        ),
        None,
    )
    if match is None:
        valid = ', '.join(
            sorted(platform['name'] for platform in supports['platforms'])
        )
        raise ValueError(f'Unknown platform. Valid options: {valid}')

    return str(match['id'])
