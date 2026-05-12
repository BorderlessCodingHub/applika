from typing import Any

from applika.utils.dates import parse_date


def filter_applications(
    applications: list[dict[str, Any]],
    supports: dict[str, Any],
    *,
    search: str | None = None,
    mode: str = 'all',
    status: str = 'all',
    platform: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict[str, Any]]:
    platform_id = None
    if platform:
        platform_id = resolve_platform_id(supports, platform)

    filtered = []
    search_term = (search or '').strip().lower()
    date_from = parse_date(from_date) if from_date else None
    date_to = parse_date(to_date) if to_date else None

    for application in applications:
        if search_term:
            company_name = (application.get('company_name') or '').lower()
            role = (application.get('role') or '').lower()
            if search_term not in company_name and search_term not in role:
                continue

        if mode != 'all' and application.get('mode') != mode:
            continue

        if status == 'active' and application.get('finalized'):
            continue

        if status == 'finalized' and not application.get('finalized'):
            continue

        if platform_id and str(application.get('platform_id')) != platform_id:
            continue

        app_date = parse_date(application['application_date'])
        if date_from and app_date < date_from:
            continue
        if date_to and app_date > date_to:
            continue

        filtered.append(application)

    filtered.sort(key=lambda item: item['application_date'], reverse=True)
    return filtered


def resolve_platform_id(supports: dict[str, Any], platform_name: str) -> str:
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
