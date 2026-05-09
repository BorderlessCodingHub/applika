import argparse
from typing import Any

from cli_context import parse_date


def filter_applications(
    applications: list[dict[str, Any]],
    supports: dict[str, Any],
    args: argparse.Namespace,
) -> list[dict[str, Any]]:
    platform_id = None
    if args.platform:
        platform_id = resolve_platform_id(supports, args.platform)

    filtered = []
    search = (args.search or '').strip().lower()
    from_date = parse_date(args.from_date) if args.from_date else None
    to_date = parse_date(args.to_date) if args.to_date else None

    for application in applications:
        if search:
            company_name = (application.get('company_name') or '').lower()
            role = (application.get('role') or '').lower()
            if search not in company_name and search not in role:
                continue

        if args.mode != 'all' and application.get('mode') != args.mode:
            continue

        if args.status == 'active' and application.get('finalized'):
            continue

        if args.status == 'finalized' and not application.get('finalized'):
            continue

        if platform_id and str(application.get('platform_id')) != platform_id:
            continue

        app_date = parse_date(application['application_date'])
        if from_date and app_date < from_date:
            continue
        if to_date and app_date > to_date:
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
