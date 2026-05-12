from dataclasses import dataclass
from typing import Any

from applika.lib.api import ApiClient
from applika.utils.dates import ensure_date_string

from .filter import resolve_platform_id


@dataclass
class ApplicationArgs:
    company: str | None = None
    company_url: str | None = None
    role: str | None = None
    platform: str | None = None
    mode: str | None = None
    application_date: str | None = None
    job_url: str | None = None
    observation: str | None = None
    expected_salary: float | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str | None = None
    salary_period: str | None = None
    experience_level: str | None = None
    work_mode: str | None = None
    country: str | None = None
    clear_job_url: bool = False
    clear_observation: bool = False
    clear_country: bool = False
    clear_salary: bool = False


def build_application_payload(
    client: ApiClient,
    args: ApplicationArgs,
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

    salary = build_salary_fields(args, existing)

    return {
        'company': company,
        'platform_id': platform_id,
        'role': args.role if args.role is not None else existing['role'],
        'mode': args.mode if args.mode is not None else existing['mode'],
        'application_date': application_date,
        'link_to_job': choose_optional_value(
            provided=args.job_url,
            existing=existing.get('link_to_job') if existing else None,
            clear=args.clear_job_url,
        ),
        'observation': choose_optional_value(
            provided=args.observation,
            existing=existing.get('observation') if existing else None,
            clear=args.clear_observation,
        ),
        'country': choose_optional_value(
            provided=args.country,
            existing=existing.get('country') if existing else None,
            clear=args.clear_country,
        ),
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
    args: ApplicationArgs,
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    if args.clear_salary:
        return {
            'currency': None,
            'salary_period': None,
            'expected_salary': None,
            'salary_range_min': None,
            'salary_range_max': None,
        }

    fields = {
        'expected_salary': choose_numeric_value(
            args.expected_salary,
            existing,
            'expected_salary',
        ),
        'salary_range_min': choose_numeric_value(
            args.salary_min,
            existing,
            'salary_range_min',
        ),
        'salary_range_max': choose_numeric_value(
            args.salary_max,
            existing,
            'salary_range_max',
        ),
        'currency': choose_existing_value(args.currency, existing, 'currency'),
        'salary_period': choose_existing_value(
            args.salary_period,
            existing,
            'salary_period',
        ),
    }
    has_salary = any(
        fields[name] is not None
        for name in (
            'expected_salary',
            'salary_range_min',
            'salary_range_max',
        )
    )
    if has_salary and (
        fields['currency'] is None or fields['salary_period'] is None
    ):
        raise ValueError(
            'Currency and salary period are required when salary is set'
        )

    return fields


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
        return {'name': existing['company_name'], 'url': None}

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

    return {'name': company_name.strip(), 'url': company_url or None}


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


def choose_existing_value(
    provided: str | None,
    existing: dict[str, Any] | None,
    field: str,
) -> str | None:
    if provided is not None:
        return provided
    return existing.get(field) if existing else None


def choose_numeric_value(
    provided: float | None,
    existing: dict[str, Any] | None,
    field: str,
) -> float | None:
    if provided is not None:
        return provided
    return existing.get(field) if existing else None
