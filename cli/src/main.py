import argparse
import json
import secrets
import sys
import webbrowser
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx

from api import (
    ApiClient,
    ApiError,
    AuthError,
    create_session_from_exchange,
)
from loopback import LoopbackLoginServer
from session import SessionData, SessionStore, resolve_api_base_url

MODE_CHOICES = ('active', 'passive', 'all')
STATUS_CHOICES = ('active', 'finalized', 'all')
WORK_MODE_CHOICES = ('remote', 'hybrid', 'on_site')
EXPERIENCE_CHOICES = (
    'intern',
    'junior',
    'mid_level',
    'senior',
    'staff',
    'lead',
    'principal',
    'specialist',
)
CURRENCY_CHOICES = ('USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR')
SALARY_PERIOD_CHOICES = ('hourly', 'monthly', 'annual')


@dataclass
class CommandContext:
    api_base_url: str
    store: SessionStore


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='applika')
    parser.add_argument('--api-base-url')
    subparsers = parser.add_subparsers(dest='command', required=True)

    login_parser = subparsers.add_parser('login')
    login_parser.set_defaults(handler=handle_login)

    logout_parser = subparsers.add_parser('logout')
    logout_parser.set_defaults(handler=handle_logout)

    applications_parser = subparsers.add_parser('applications')
    applications_subparsers = applications_parser.add_subparsers(
        dest='applications_command',
        required=True,
    )

    list_parser = applications_subparsers.add_parser('list')
    list_parser.add_argument('--cycle-id')
    list_parser.add_argument('--search')
    list_parser.add_argument('--mode', choices=MODE_CHOICES, default='all')
    list_parser.add_argument(
        '--status',
        choices=STATUS_CHOICES,
        default='all',
    )
    list_parser.add_argument('--platform')
    list_parser.add_argument('--from', dest='from_date')
    list_parser.add_argument('--to', dest='to_date')
    list_parser.add_argument('--json', action='store_true')
    list_parser.set_defaults(handler=handle_applications_list)

    new_parser = applications_subparsers.add_parser('new')
    add_application_args(new_parser, require_all=True)
    new_parser.set_defaults(handler=handle_applications_new)

    edit_parser = applications_subparsers.add_parser('edit')
    edit_parser.add_argument('application_id')
    add_application_args(edit_parser, require_all=False)
    edit_parser.add_argument('--clear-job-url', action='store_true')
    edit_parser.add_argument('--clear-observation', action='store_true')
    edit_parser.add_argument('--clear-country', action='store_true')
    edit_parser.add_argument('--clear-salary', action='store_true')
    edit_parser.set_defaults(handler=handle_applications_edit)

    return parser


def add_application_args(
    parser: argparse.ArgumentParser,
    *,
    require_all: bool,
) -> None:
    parser.add_argument('--company', required=require_all)
    parser.add_argument('--company-url')
    parser.add_argument('--role', required=require_all)
    parser.add_argument('--platform', required=require_all)
    parser.add_argument(
        '--mode',
        choices=MODE_CHOICES[:2],
        required=require_all,
    )
    parser.add_argument('--date', dest='application_date', required=require_all)
    parser.add_argument('--job-url')
    parser.add_argument('--observation')
    parser.add_argument('--expected-salary', type=float)
    parser.add_argument('--salary-min', type=float)
    parser.add_argument('--salary-max', type=float)
    parser.add_argument('--currency', choices=CURRENCY_CHOICES)
    parser.add_argument('--salary-period', choices=SALARY_PERIOD_CHOICES)
    parser.add_argument('--experience-level', choices=EXPERIENCE_CHOICES)
    parser.add_argument('--work-mode', choices=WORK_MODE_CHOICES)
    parser.add_argument('--country')


def normalize_argv(argv: list[str]) -> list[str]:
    if not argv:
        return argv
    if argv[0] == 'applications':
        if len(argv) == 1:
            return ['applications', 'list']
        if argv[1] == '-n':
            return ['applications', 'new', *argv[2:]]
        if argv[1] not in {'list', 'new', 'edit'}:
            return ['applications', 'list', *argv[1:]]
    return argv


def main(argv: list[str] | None = None) -> int:
    argv = normalize_argv(list(argv or sys.argv[1:]))
    parser = build_parser()
    args = parser.parse_args(argv)
    store = SessionStore()
    context = CommandContext(
        api_base_url=resolve_api_base_url(args.api_base_url, store),
        store=store,
    )
    try:
        return args.handler(args, context)
    except (
        ApiError,
        AuthError,
        RuntimeError,
        ValueError,
        httpx.HTTPError,
    ) as error:
        print(str(error), file=sys.stderr)
        return 1


def handle_login(args: argparse.Namespace, context: CommandContext) -> int:
    state = secrets.token_urlsafe(24)
    server = LoopbackLoginServer(expected_state=state)
    server.start()
    try:
        response = httpx.post(
            f'{context.api_base_url}/auth/cli/start',
            json={
                'callback_url': server.callback_url,
                'state': state,
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        login_url = data['login_url']
        browser_opened = webbrowser.open(login_url)
        if not browser_opened:
            print(f'Open this URL to continue login:\n{login_url}')
        code = server.wait_for_code(timeout_seconds=300)
        exchange = httpx.post(
            f'{context.api_base_url}/auth/cli/exchange',
            json={'code': code},
            timeout=30,
        )
        exchange.raise_for_status()
        session = create_session_from_exchange(
            context.api_base_url,
            exchange.json(),
        )
        context.store.save(session)
        print('Login successful.')
        return 0
    finally:
        server.close()


def handle_logout(args: argparse.Namespace, context: CommandContext) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)
    try:
        client.logout()
    finally:
        client.close()
    print('Logged out.')
    return 0


def handle_applications_list(
    args: argparse.Namespace,
    context: CommandContext,
) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)
    try:
        params = {'cycle_id': args.cycle_id} if args.cycle_id else None
        applications = client.get_json('/applications', params=params)
        supports = client.get_json('/supports')
        filtered = filter_applications(applications, supports, args)
        if args.json:
            print(json.dumps(filtered, indent=2, sort_keys=True))
        else:
            render_application_table(filtered, supports)
        return 0
    finally:
        client.close()


def handle_applications_new(
    args: argparse.Namespace,
    context: CommandContext,
) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)
    try:
        payload = build_application_payload(
            client,
            args,
            existing=None,
        )
        created = client.post_json('/applications', payload)
        print_application_summary(created, 'Created application')
        return 0
    finally:
        client.close()


def handle_applications_edit(
    args: argparse.Namespace,
    context: CommandContext,
) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)
    try:
        applications = client.get_json('/applications')
        existing = next(
            (
                application
                for application in applications
                if str(application['id']) == args.application_id
            ),
            None,
        )
        if existing is None:
            raise ValueError('Application not found in the current cycle')
        if existing.get('finalized'):
            raise ValueError('Finalized applications cannot be edited')
        payload = build_application_payload(
            client,
            args,
            existing=existing,
        )
        updated = client.put_json(
            f"/applications/{args.application_id}",
            payload,
        )
        print_application_summary(updated, 'Updated application')
        return 0
    finally:
        client.close()


def require_session(store: SessionStore) -> SessionData:
    session = store.try_load()
    if not session:
        raise AuthError('Please run `applika login` first.')
    return session


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


def build_application_payload(
    client: ApiClient,
    args: argparse.Namespace,
    *,
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    supports = client.get_json('/supports')
    company = resolve_company_input(
        client,
        company_name=args.company,
        company_url=args.company_url,
        existing=existing,
    )
    platform_id = (
        resolve_platform_id(supports, args.platform)
        if args.platform
        else str(existing['platform_id'])
    )
    application_date = (
        ensure_date_string(args.application_date)
        if args.application_date
        else existing['application_date']
    )
    role = args.role if args.role is not None else existing['role']
    mode = args.mode if args.mode is not None else existing['mode']
    link_to_job = choose_optional_value(
        provided=args.job_url,
        existing=existing.get('link_to_job') if existing else None,
        clear=getattr(args, 'clear_job_url', False),
    )
    observation = choose_optional_value(
        provided=args.observation,
        existing=existing.get('observation') if existing else None,
        clear=getattr(args, 'clear_observation', False),
    )
    country = choose_optional_value(
        provided=args.country,
        existing=existing.get('country') if existing else None,
        clear=getattr(args, 'clear_country', False),
    )
    salary = build_salary_fields(args, existing)

    return {
        'company': company,
        'platform_id': platform_id,
        'role': role,
        'mode': mode,
        'application_date': application_date,
        'link_to_job': link_to_job,
        'observation': observation,
        'country': country,
        'currency': salary['currency'],
        'salary_period': salary['salary_period'],
        'expected_salary': salary['expected_salary'],
        'salary_range_min': salary['salary_range_min'],
        'salary_range_max': salary['salary_range_max'],
        'experience_level': (
            args.experience_level
            if args.experience_level is not None
            else (existing.get('experience_level') if existing else None)
        ),
        'work_mode': (
            args.work_mode
            if args.work_mode is not None
            else (existing.get('work_mode') if existing else None)
        ),
    }


def build_salary_fields(
    args: argparse.Namespace,
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    if getattr(args, 'clear_salary', False):
        return {
            'currency': None,
            'salary_period': None,
            'expected_salary': None,
            'salary_range_min': None,
            'salary_range_max': None,
        }

    expected_salary = (
        args.expected_salary
        if args.expected_salary is not None
        else (existing.get('expected_salary') if existing else None)
    )
    salary_range_min = (
        args.salary_min
        if args.salary_min is not None
        else (existing.get('salary_range_min') if existing else None)
    )
    salary_range_max = (
        args.salary_max
        if args.salary_max is not None
        else (existing.get('salary_range_max') if existing else None)
    )
    currency = (
        args.currency
        if args.currency is not None
        else (existing.get('currency') if existing else None)
    )
    salary_period = (
        args.salary_period
        if args.salary_period is not None
        else (existing.get('salary_period') if existing else None)
    )
    has_salary = any(
        value is not None
        for value in (
            expected_salary,
            salary_range_min,
            salary_range_max,
        )
    )
    if has_salary and (currency is None or salary_period is None):
        raise ValueError(
            'Currency and salary period are required when salary is set'
        )
    return {
        'currency': currency,
        'salary_period': salary_period,
        'expected_salary': expected_salary,
        'salary_range_min': salary_range_min,
        'salary_range_max': salary_range_max,
    }


def resolve_company_input(
    client: ApiClient,
    *,
    company_name: str | None,
    company_url: str | None,
    existing: dict[str, Any] | None,
) -> str | dict[str, Any]:
    if company_name is None:
        if existing is None:
            raise ValueError('Company is required')
        if existing.get('company_id'):
            return str(existing['company_id'])
        return {
            'name': existing['company_name'],
            'url': None,
        }

    query = company_name.strip().lower()
    matches = client.get_json('/companies', params={'name': query})
    exact_match = next(
        (
            company
            for company in matches
            if company['name'].strip().lower() == query
        ),
        None,
    )
    if exact_match:
        return str(exact_match['id'])
    return {
        'name': company_name.strip(),
        'url': company_url or None,
    }


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


def choose_optional_value(
    *,
    provided: str | None,
    existing: str | None,
    clear: bool,
) -> str | None:
    if clear:
        return None
    if provided is not None:
        return provided
    return existing


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def ensure_date_string(value: str) -> str:
    parse_date(value)
    return value


def render_application_table(
    applications: list[dict[str, Any]],
    supports: dict[str, Any],
) -> None:
    platform_names = {
        str(platform['id']): platform['name']
        for platform in supports['platforms']
    }
    rows = [
        [
            str(app['id']),
            app['application_date'],
            app['company_name'],
            app['role'],
            app['mode'],
            platform_names.get(str(app['platform_id']), str(app['platform_id'])),
            'finalized' if app['finalized'] else 'active',
        ]
        for app in applications
    ]
    headers = ['id', 'date', 'company', 'role', 'mode', 'platform', 'status']
    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        if rows
        else len(header)
        for index, header in enumerate(headers)
    ]
    print(
        '  '.join(
            header.ljust(widths[index])
            for index, header in enumerate(headers)
        )
    )
    for row in rows:
        print(
            '  '.join(
                value.ljust(widths[index])
                for index, value in enumerate(row)
            )
        )


def print_application_summary(application: dict[str, Any], prefix: str) -> None:
    print(
        f"{prefix}: "
        f"id={application['id']} "
        f"company={application['company_name']} "
        f"role={application['role']} "
        f"date={application['application_date']}"
    )


if __name__ == '__main__':
    raise SystemExit(main())
