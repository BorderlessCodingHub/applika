from __future__ import annotations

import json
from typing import Annotated

import typer
from pydantic import ValidationError

from applika.config import AppConfig
from applika.lib.api import ApiClient, require_session
from applika.schemas.application import ApplicationCreate, ApplicationUpdate
from applika.schemas.enums import (
    ApplicationMode,
    Currency,
    ExperienceLevel,
    ModeFilter,
    OutputFormat,
    SalaryPeriod,
    StatusFilter,
    WorkMode,
)
from applika.utils.output import (
    print_application_summary,
    render_application_table,
)

from .filter import filter_applications
from .payloads import ApplicationArgs, build_application_payload


def list_applications(
    ctx: typer.Context,
    cycle_id: Annotated[
        str | None,
        typer.Option('--cycle-id', help='Filter by cycle ID.'),
    ] = None,
    search: Annotated[
        str | None,
        typer.Option(
            '--search',
            help='Search in company name or role (case-insensitive).',
        ),
    ] = None,
    mode: Annotated[
        ModeFilter,
        typer.Option('--mode', help='Filter by application mode.'),
    ] = ModeFilter.ALL,
    status: Annotated[
        StatusFilter,
        typer.Option('--status', help='Filter by application status.'),
    ] = StatusFilter.ALL,
    platform: Annotated[
        str | None,
        typer.Option(
            '--platform', help='Filter by platform name (e.g. LinkedIn).'
        ),
    ] = None,
    from_date: Annotated[
        str | None,
        typer.Option(
            '--from',
            help='Include applications from this date (YYYY-MM-DD, inclusive).',
        ),
    ] = None,
    to_date: Annotated[
        str | None,
        typer.Option(
            '--to',
            help='Include applications up to this date (YYYY-MM-DD, inclusive).',
        ),
    ] = None,
    output_format: Annotated[
        OutputFormat,
        typer.Option(
            '--output-format', help='Output format: table (default) or json.'
        ),
    ] = OutputFormat.TABLE,
) -> None:
    """List job applications with optional filters, sorted by date descending."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        params = {'cycle_id': cycle_id} if cycle_id else None
        applications = client.get_json('/applications', params=params)
        supports = client.get_json('/supports')
        filtered = filter_applications(
            applications,
            supports,
            search=search,
            mode=str(mode),
            status=str(status),
            platform=platform,
            from_date=from_date,
            to_date=to_date,
        )

        if output_format == OutputFormat.JSON:
            print(json.dumps(filtered, indent=2, sort_keys=True))
        else:
            render_application_table(filtered, supports)
    finally:
        client.close()


def new_application(
    ctx: typer.Context,
    company: Annotated[
        str,
        typer.Option('--company', help='Company name.'),
    ],
    role: Annotated[
        str,
        typer.Option('--role', help='Job title or role.'),
    ],
    platform: Annotated[
        str,
        typer.Option(
            '--platform', help='Platform name (e.g. LinkedIn, Indeed).'
        ),
    ],
    mode: Annotated[
        ApplicationMode,
        typer.Option('--mode', help='Application mode: active or passive.'),
    ],
    application_date: Annotated[
        str,
        typer.Option('--date', help='Application date (YYYY-MM-DD).'),
    ],
    company_url: Annotated[
        str | None,
        typer.Option('--company-url', help='Company website URL.'),
    ] = None,
    job_url: Annotated[
        str | None,
        typer.Option('--job-url', help='Link to the job posting.'),
    ] = None,
    observation: Annotated[
        str | None,
        typer.Option(
            '--observation', help='Notes or observations about the application.'
        ),
    ] = None,
    expected_salary: Annotated[
        float | None,
        typer.Option('--expected-salary', help='Expected salary amount.'),
    ] = None,
    salary_min: Annotated[
        float | None,
        typer.Option('--salary-min', help='Minimum salary range.'),
    ] = None,
    salary_max: Annotated[
        float | None,
        typer.Option('--salary-max', help='Maximum salary range.'),
    ] = None,
    currency: Annotated[
        Currency | None,
        typer.Option(
            '--currency', help='Salary currency (required when salary is set).'
        ),
    ] = None,
    salary_period: Annotated[
        SalaryPeriod | None,
        typer.Option(
            '--salary-period',
            help='Salary period (required when salary is set).',
        ),
    ] = None,
    experience_level: Annotated[
        ExperienceLevel | None,
        typer.Option('--experience-level', help='Required experience level.'),
    ] = None,
    work_mode: Annotated[
        WorkMode | None,
        typer.Option(
            '--work-mode', help='Work mode: remote, hybrid, or on_site.'
        ),
    ] = None,
    country: Annotated[
        str | None,
        typer.Option('--country', help='Country where the job is located.'),
    ] = None,
) -> None:
    """Create a new job application."""
    try:
        ApplicationCreate(
            company=company,
            role=role,
            platform=platform,
            mode=mode,
            application_date=application_date,  # type: ignore[arg-type]
            company_url=company_url,
            job_url=job_url,
            observation=observation,
            expected_salary=expected_salary,
            salary_min=salary_min,
            salary_max=salary_max,
            currency=currency,
            salary_period=salary_period,
            experience_level=experience_level,
            work_mode=work_mode,
            country=country,
        )
    except ValidationError as exc:
        for err in exc.errors():
            field = '.'.join(str(loc) for loc in err['loc'])
            typer.echo(f'Error [{field}]: {err["msg"]}', err=True)
        raise typer.Exit(1)

    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        args = ApplicationArgs(
            company=company,
            company_url=company_url,
            role=role,
            platform=platform,
            mode=str(mode),
            application_date=application_date,
            job_url=job_url,
            observation=observation,
            expected_salary=expected_salary,
            salary_min=salary_min,
            salary_max=salary_max,
            currency=str(currency) if currency else None,
            salary_period=str(salary_period) if salary_period else None,
            experience_level=str(experience_level)
            if experience_level
            else None,
            work_mode=str(work_mode) if work_mode else None,
            country=country,
        )
        payload = build_application_payload(client, args, existing=None)
        created = client.post_json('/applications', payload)
        print_application_summary(created, 'Created application')
    finally:
        client.close()


def edit_application(
    ctx: typer.Context,
    application_id: Annotated[
        str,
        typer.Argument(help='ID of the application to edit.'),
    ],
    company: Annotated[
        str | None,
        typer.Option('--company', help='New company name.'),
    ] = None,
    role: Annotated[
        str | None,
        typer.Option('--role', help='New job title or role.'),
    ] = None,
    platform: Annotated[
        str | None,
        typer.Option('--platform', help='New platform name.'),
    ] = None,
    mode: Annotated[
        ApplicationMode | None,
        typer.Option('--mode', help='New application mode.'),
    ] = None,
    application_date: Annotated[
        str | None,
        typer.Option('--date', help='New application date (YYYY-MM-DD).'),
    ] = None,
    company_url: Annotated[
        str | None,
        typer.Option('--company-url', help='New company website URL.'),
    ] = None,
    job_url: Annotated[
        str | None,
        typer.Option('--job-url', help='New link to the job posting.'),
    ] = None,
    observation: Annotated[
        str | None,
        typer.Option('--observation', help='New notes or observations.'),
    ] = None,
    expected_salary: Annotated[
        float | None,
        typer.Option('--expected-salary', help='New expected salary amount.'),
    ] = None,
    salary_min: Annotated[
        float | None,
        typer.Option('--salary-min', help='New minimum salary range.'),
    ] = None,
    salary_max: Annotated[
        float | None,
        typer.Option('--salary-max', help='New maximum salary range.'),
    ] = None,
    currency: Annotated[
        Currency | None,
        typer.Option('--currency', help='New salary currency.'),
    ] = None,
    salary_period: Annotated[
        SalaryPeriod | None,
        typer.Option('--salary-period', help='New salary period.'),
    ] = None,
    experience_level: Annotated[
        ExperienceLevel | None,
        typer.Option(
            '--experience-level', help='New required experience level.'
        ),
    ] = None,
    work_mode: Annotated[
        WorkMode | None,
        typer.Option('--work-mode', help='New work mode.'),
    ] = None,
    country: Annotated[
        str | None,
        typer.Option('--country', help='New country where the job is located.'),
    ] = None,
    clear_job_url: Annotated[
        bool,
        typer.Option('--clear-job-url', help='Remove the job URL.'),
    ] = False,
    clear_observation: Annotated[
        bool,
        typer.Option(
            '--clear-observation', help='Remove the observation note.'
        ),
    ] = False,
    clear_country: Annotated[
        bool,
        typer.Option('--clear-country', help='Remove the country.'),
    ] = False,
    clear_salary: Annotated[
        bool,
        typer.Option('--clear-salary', help='Remove all salary fields.'),
    ] = False,
) -> None:
    """Edit an existing job application. Unspecified fields keep their current values."""
    try:
        ApplicationUpdate(
            company=company,
            role=role,
            platform=platform,
            mode=mode,
            application_date=application_date,  # type: ignore[arg-type]
            company_url=company_url,
            job_url=job_url,
            observation=observation,
            expected_salary=expected_salary,
            salary_min=salary_min,
            salary_max=salary_max,
            currency=currency,
            salary_period=salary_period,
            experience_level=experience_level,
            work_mode=work_mode,
            country=country,
        )
    except ValidationError as exc:
        for err in exc.errors():
            field = '.'.join(str(loc) for loc in err['loc'])
            typer.echo(f'Error [{field}]: {err["msg"]}', err=True)
        raise typer.Exit(1)

    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        applications = client.get_json('/applications')
        existing = next(
            (app for app in applications if str(app['id']) == application_id),
            None,
        )
        if existing is None:
            typer.echo('Application not found in the current cycle', err=True)
            raise typer.Exit(1)
        if existing.get('finalized'):
            typer.echo('Finalized applications cannot be edited', err=True)
            raise typer.Exit(1)

        args = ApplicationArgs(
            company=company,
            company_url=company_url,
            role=role,
            platform=platform,
            mode=str(mode) if mode else None,
            application_date=application_date,
            job_url=job_url,
            observation=observation,
            expected_salary=expected_salary,
            salary_min=salary_min,
            salary_max=salary_max,
            currency=str(currency) if currency else None,
            salary_period=str(salary_period) if salary_period else None,
            experience_level=str(experience_level)
            if experience_level
            else None,
            work_mode=str(work_mode) if work_mode else None,
            country=country,
            clear_job_url=clear_job_url,
            clear_observation=clear_observation,
            clear_country=clear_country,
            clear_salary=clear_salary,
        )
        payload = build_application_payload(client, args, existing=existing)
        updated = client.put_json(f'/applications/{application_id}', payload)
        print_application_summary(updated, 'Updated application')
    finally:
        client.close()
