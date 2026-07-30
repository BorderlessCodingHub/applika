from __future__ import annotations

import json
from typing import Annotated

import typer
from pydantic import ValidationError

from applika.commands.applications.api_resolve import (
    resolve_company_input,
    resolve_feedback_id,
    resolve_platform_id,
    resolve_step_id,
)
from applika.commands.applications.filter import filter_applications
from applika.config import AppConfig
from applika.lib.api import ApiClient, require_session
from applika.schemas.application import (
    ApplicationCreate,
    ApplicationEntry,
    ApplicationUpdate,
)
from applika.schemas.application_step import (
    ApplicationStepCreate,
    ApplicationStepEntry,
    ApplicationStepUpdate,
    FinalizeApplication,
)
from applika.schemas.enums import (
    ApplicationMode,
    ClearField,
    Currency,
    ExperienceLevel,
    ModeFilter,
    OutputFormat,
    SalaryPeriod,
    StatusFilter,
    StepClearField,
    WorkMode,
)
from applika.schemas.supports import SupportSchema
from applika.utils.output import (
    print_application_step_summary,
    print_application_summary,
    print_finalize_summary,
    render_application_step_table,
    render_application_table,
)


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
        supports: SupportSchema = client.get_json('/supports')
        applications: list[ApplicationEntry] = client.get_json(
            '/applications', params=params
        )

        filtered = filter_applications(
            applications,
            supports,
            search=search,
            mode=mode,
            status=status,
            platform=platform,
            from_date=from_date,
            to_date=to_date,
        )

        if output_format == OutputFormat.JSON:
            print(json.dumps(filtered, indent=2, sort_keys=True))
        else:
            render_application_table(filtered, supports)
    except ValueError as exc:
        _echo_value_error(exc)
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
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        payload = ApplicationCreate(
            company=resolve_company_input(client, company, company_url),
            role=role,
            mode=mode,
            platform_id=resolve_platform_id(client, platform),
            application_date=application_date,
            link_to_job=job_url,
            observation=observation,
            expected_salary=expected_salary,
            salary_range_min=salary_min,
            salary_range_max=salary_max,
            currency=currency,
            salary_period=salary_period,
            experience_level=experience_level,
            work_mode=work_mode,
            country=country,
        )
        created = client.post_json(
            '/applications', payload.model_dump(mode='json')
        )
        print_application_summary(created, 'Created application')
    except ValidationError as exc:
        _echo_validation_error(exc)
    except ValueError as exc:
        _echo_value_error(exc)
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
    clear: Annotated[
        list[ClearField] | None,
        typer.Option(
            '--clear',
            help=(
                'Field to set to null. Repeatable: --clear observation --clear job_url. '
                'Valid: observation, job_url, country, experience_level, work_mode, '
                'expected_salary, salary_min, salary_max, currency, salary_period, '
                'salary (clears all salary fields at once).'
            ),
        ),
    ] = None,
) -> None:
    """Edit an existing job application. Unspecified fields keep their current values."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        applications: list[ApplicationEntry] = client.get_json('/applications')
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

        resolved_company = (
            resolve_company_input(client, company, company_url)
            if company is not None
            else str(existing['company_id'])
            if existing.get('company_id')
            else {'name': existing['company_name'], 'url': None}
        )
        resolved_platform_id = (
            resolve_platform_id(client, platform)
            if platform is not None
            else str(existing['platform_id'])
        )

        clear_set: set[ClearField] = set(clear or [])

        def _clears(field: ClearField) -> bool:
            return field in clear_set

        clear_all_salary = _clears(ClearField.SALARY)

        payload = ApplicationUpdate(
            company=resolved_company,
            role=role or existing['role'],
            mode=mode or existing['mode'],
            platform_id=resolved_platform_id,
            application_date=application_date or existing['application_date'],
            link_to_job=(
                None
                if _clears(ClearField.JOB_URL)
                else job_url or existing.get('link_to_job')
            ),
            observation=(
                None
                if _clears(ClearField.OBSERVATION)
                else observation or existing.get('observation')
            ),
            country=(
                None
                if _clears(ClearField.COUNTRY)
                else country or existing.get('country')
            ),
            expected_salary=(
                None
                if clear_all_salary or _clears(ClearField.EXPECTED_SALARY)
                else (
                    expected_salary
                    if expected_salary is not None
                    else existing.get('expected_salary')
                )
            ),
            salary_range_min=(
                None
                if clear_all_salary or _clears(ClearField.SALARY_MIN)
                else (
                    salary_min
                    if salary_min is not None
                    else existing.get('salary_range_min')
                )
            ),
            salary_range_max=(
                None
                if clear_all_salary or _clears(ClearField.SALARY_MAX)
                else (
                    salary_max
                    if salary_max is not None
                    else existing.get('salary_range_max')
                )
            ),
            currency=(
                None
                if clear_all_salary or _clears(ClearField.CURRENCY)
                else currency or existing.get('currency')
            ),
            salary_period=(
                None
                if clear_all_salary or _clears(ClearField.SALARY_PERIOD)
                else salary_period or existing.get('salary_period')
            ),
            experience_level=(
                None
                if _clears(ClearField.EXPERIENCE_LEVEL)
                else experience_level or existing.get('experience_level')
            ),
            work_mode=(
                None
                if _clears(ClearField.WORK_MODE)
                else work_mode or existing.get('work_mode')
            ),
        )
        updated = client.put_json(
            f'/applications/{application_id}',
            payload.model_dump(mode='json'),
        )
        print_application_summary(updated, 'Updated application')
    except ValidationError as exc:
        _echo_validation_error(exc)
    except ValueError as exc:
        _echo_value_error(exc)
    finally:
        client.close()


def list_application_steps(
    ctx: typer.Context,
    application_id_arg: Annotated[
        str | None,
        typer.Argument(help='ID of the application to inspect.'),
    ] = None,
    application_id: Annotated[
        str | None,
        typer.Option(
            '--application-id', help='ID of the application to inspect.'
        ),
    ] = None,
    output_format: Annotated[
        OutputFormat,
        typer.Option(
            '--output-format', help='Output format: table (default) or json.'
        ),
    ] = OutputFormat.TABLE,
) -> None:
    """List the recorded steps for an application."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        resolved_application_id = _resolve_identifier(
            label='application id',
            positional=application_id_arg,
            option=application_id,
            option_name='--application-id',
        )
        steps = _sorted_steps(
            client.get_json(f'/applications/{resolved_application_id}/steps')
        )
        if output_format == OutputFormat.JSON:
            print(json.dumps(steps, indent=2, sort_keys=True))
        else:
            render_application_step_table(steps)
    finally:
        client.close()


def add_application_step(
    ctx: typer.Context,
    application_id_arg: Annotated[
        str | None,
        typer.Argument(help='ID of the application to update.'),
    ] = None,
    application_id: Annotated[
        str | None,
        typer.Option(
            '--application-id', help='ID of the application to update.'
        ),
    ] = None,
    step: Annotated[
        str,
        typer.Option(
            '--step',
            help='Predefined non-final step definition name or ID (e.g. Phase 2).',
        ),
    ] = ...,
    step_date: Annotated[
        str,
        typer.Option('--date', help='Step date (YYYY-MM-DD).'),
    ] = ...,
    start_time: Annotated[
        str | None,
        typer.Option(
            '--start-time', help='Step start time (HH:MM or HH:MM:SS).'
        ),
    ] = None,
    end_time: Annotated[
        str | None,
        typer.Option('--end-time', help='Step end time (HH:MM or HH:MM:SS).'),
    ] = None,
    timezone: Annotated[
        str | None,
        typer.Option(
            '--timezone', help='IANA timezone (e.g. America/Sao_Paulo).'
        ),
    ] = None,
    observation: Annotated[
        str | None,
        typer.Option('--observation', help='Notes for this step.'),
    ] = None,
) -> None:
    """Add a recorded step to an active application."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        resolved_application_id = _resolve_identifier(
            label='application id',
            positional=application_id_arg,
            option=application_id,
            option_name='--application-id',
        )
        _reject_if_application_finalized(client, resolved_application_id)
        supports: SupportSchema = client.get_json('/supports')
        payload = ApplicationStepCreate(
            step_id=resolve_step_id(supports, step, strict=False),
            step_date=step_date,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            observation=observation,
        )
        created = client.post_json(
            f'/applications/{resolved_application_id}/steps',
            payload.model_dump(mode='json'),
        )
        print_application_step_summary(created, 'Added step')
    except ValidationError as exc:
        _echo_validation_error(exc)
    except ValueError as exc:
        _echo_value_error(exc)
    finally:
        client.close()


def edit_application_step(
    ctx: typer.Context,
    application_id_arg: Annotated[
        str | None,
        typer.Argument(help='ID of the application to update.'),
    ] = None,
    step_record_id_arg: Annotated[
        str | None,
        typer.Argument(help='Recorded step ID to edit.'),
    ] = None,
    application_id: Annotated[
        str | None,
        typer.Option(
            '--application-id', help='ID of the application to update.'
        ),
    ] = None,
    step_record_id: Annotated[
        str | None,
        typer.Option('--step-record-id', help='Recorded step ID to edit.'),
    ] = None,
    step: Annotated[
        str | None,
        typer.Option(
            '--step',
            help='New predefined non-final step definition name or ID.',
        ),
    ] = None,
    step_date: Annotated[
        str | None,
        typer.Option('--date', help='New step date (YYYY-MM-DD).'),
    ] = None,
    start_time: Annotated[
        str | None,
        typer.Option(
            '--start-time', help='New start time (HH:MM or HH:MM:SS).'
        ),
    ] = None,
    end_time: Annotated[
        str | None,
        typer.Option('--end-time', help='New end time (HH:MM or HH:MM:SS).'),
    ] = None,
    timezone: Annotated[
        str | None,
        typer.Option('--timezone', help='New IANA timezone.'),
    ] = None,
    observation: Annotated[
        str | None,
        typer.Option('--observation', help='New notes for this step.'),
    ] = None,
    clear: Annotated[
        list[StepClearField] | None,
        typer.Option(
            '--clear',
            help=(
                'Field to set to null. Repeatable. '
                'Valid: observation, time, timezone.'
            ),
        ),
    ] = None,
) -> None:
    """Edit a recorded application step. Unspecified fields keep their current values."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        resolved_application_id = _resolve_identifier(
            label='application id',
            positional=application_id_arg,
            option=application_id,
            option_name='--application-id',
        )
        resolved_step_record_id = _resolve_identifier(
            label='step record id',
            positional=step_record_id_arg,
            option=step_record_id,
            option_name='--step-record-id',
        )
        _reject_if_application_finalized(client, resolved_application_id)
        existing = _get_application_step_or_exit(
            client, resolved_application_id, resolved_step_record_id
        )
        supports: SupportSchema = client.get_json('/supports')
        clear_set = set(clear or [])
        clear_time = StepClearField.TIME in clear_set
        clear_timezone = StepClearField.TIMEZONE in clear_set
        clear_observation = StepClearField.OBSERVATION in clear_set

        payload = ApplicationStepUpdate(
            step_id=(
                resolve_step_id(supports, step, strict=False)
                if step is not None
                else str(existing['step_id'])
            ),
            step_date=step_date or existing['step_date'],
            start_time=(
                None
                if clear_time
                else start_time
                if start_time is not None
                else existing.get('start_time')
            ),
            end_time=(
                None
                if clear_time
                else end_time
                if end_time is not None
                else existing.get('end_time')
            ),
            timezone=(
                None
                if clear_timezone
                else timezone
                if timezone is not None
                else existing.get('timezone')
            ),
            observation=(
                None
                if clear_observation
                else observation
                if observation is not None
                else existing.get('observation')
            ),
        )
        updated = client.put_json(
            f'/applications/{resolved_application_id}/steps/{resolved_step_record_id}',
            payload.model_dump(mode='json'),
        )
        print_application_step_summary(updated, 'Updated step')
    except ValidationError as exc:
        _echo_validation_error(exc)
    except ValueError as exc:
        _echo_value_error(exc)
    finally:
        client.close()


def delete_application_step(
    ctx: typer.Context,
    application_id_arg: Annotated[
        str | None,
        typer.Argument(help='ID of the application to update.'),
    ] = None,
    step_record_id_arg: Annotated[
        str | None,
        typer.Argument(help='Recorded step ID to delete.'),
    ] = None,
    application_id: Annotated[
        str | None,
        typer.Option(
            '--application-id', help='ID of the application to update.'
        ),
    ] = None,
    step_record_id: Annotated[
        str | None,
        typer.Option('--step-record-id', help='Recorded step ID to delete.'),
    ] = None,
) -> None:
    """Delete a recorded application step."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        resolved_application_id = _resolve_identifier(
            label='application id',
            positional=application_id_arg,
            option=application_id,
            option_name='--application-id',
        )
        resolved_step_record_id = _resolve_identifier(
            label='step record id',
            positional=step_record_id_arg,
            option=step_record_id,
            option_name='--step-record-id',
        )
        _reject_if_application_finalized(client, resolved_application_id)
        _get_application_step_or_exit(
            client, resolved_application_id, resolved_step_record_id
        )
        client.delete(
            f'/applications/{resolved_application_id}/steps/{resolved_step_record_id}'
        )
        typer.echo(f'Deleted step: id={resolved_step_record_id}')
    finally:
        client.close()


def finalize_application(
    ctx: typer.Context,
    application_id_arg: Annotated[
        str | None,
        typer.Argument(help='ID of the application to finalize.'),
    ] = None,
    application_id: Annotated[
        str | None,
        typer.Option(
            '--application-id', help='ID of the application to finalize.'
        ),
    ] = None,
    step: Annotated[
        str,
        typer.Option(
            '--step',
            help='Final strict step definition name or ID (e.g. Offer, Denied).',
        ),
    ] = ...,
    feedback: Annotated[
        str,
        typer.Option(
            '--feedback',
            help='Feedback definition name or ID (e.g. Accepted, Rejected).',
        ),
    ] = ...,
    finalize_date: Annotated[
        str,
        typer.Option('--date', help='Finalization date (YYYY-MM-DD).'),
    ] = ...,
    salary_offer: Annotated[
        float | None,
        typer.Option('--salary-offer', help='Final salary offer amount.'),
    ] = None,
    observation: Annotated[
        str | None,
        typer.Option('--observation', help='Final notes or observations.'),
    ] = None,
    output_format: Annotated[
        OutputFormat,
        typer.Option(
            '--output-format', help='Output format: table (default) or json.'
        ),
    ] = OutputFormat.TABLE,
) -> None:
    """Finalize an application with a strict final step and feedback."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        resolved_application_id = _resolve_identifier(
            label='application id',
            positional=application_id_arg,
            option=application_id,
            option_name='--application-id',
        )
        supports: SupportSchema = client.get_json('/supports')
        payload = FinalizeApplication(
            step_id=resolve_step_id(supports, step, strict=True),
            feedback_id=resolve_feedback_id(supports, feedback),
            finalize_date=finalize_date,
            salary_offer=salary_offer,
            observation=observation,
        )
        finalized = client.post_json(
            f'/applications/{resolved_application_id}/finalize',
            payload.model_dump(mode='json'),
        )
        if output_format == OutputFormat.JSON:
            print(json.dumps(finalized, indent=2, sort_keys=True))
        else:
            print_finalize_summary(finalized, 'Finalized application')
    except ValidationError as exc:
        _echo_validation_error(exc)
    except ValueError as exc:
        _echo_value_error(exc)
    finally:
        client.close()


def _echo_validation_error(exc: ValidationError) -> None:
    for err in exc.errors():
        field = '.'.join(str(loc) for loc in err['loc'])
        typer.echo(f'Error [{field}]: {err["msg"]}', err=True)
    raise typer.Exit(1)


def _resolve_identifier(
    *,
    label: str,
    positional: str | None,
    option: str | None,
    option_name: str,
) -> str:
    if positional and option and positional != option:
        typer.echo(
            f'Conflicting {label}: positional value "{positional}" does not match {option_name} "{option}"',
            err=True,
        )
        raise typer.Exit(1)

    value = option or positional
    if value is None:
        typer.echo(
            f'Missing {label}. Provide it positionally or with {option_name}.',
            err=True,
        )
        raise typer.Exit(1)

    return value


def _echo_value_error(exc: ValueError) -> None:
    typer.echo(str(exc), err=True)
    raise typer.Exit(1)


def _get_application_step_or_exit(
    client: ApiClient,
    application_id: str,
    step_record_id: str,
) -> ApplicationStepEntry:
    steps: list[ApplicationStepEntry] = client.get_json(
        f'/applications/{application_id}/steps'
    )
    existing = next(
        (step for step in steps if str(step['id']) == step_record_id), None
    )
    if existing is None:
        typer.echo('Application step not found', err=True)
        raise typer.Exit(1)
    return existing


def _reject_if_application_finalized(
    client: ApiClient,
    application_id: str,
) -> None:
    applications: list[ApplicationEntry] = client.get_json('/applications')
    existing = next(
        (app for app in applications if str(app['id']) == application_id),
        None,
    )
    if existing is not None and existing.get('finalized'):
        typer.echo('This application has already been finalized', err=True)
        raise typer.Exit(1)


def _sorted_steps(
    steps: list[ApplicationStepEntry],
) -> list[ApplicationStepEntry]:
    return sorted(
        steps,
        key=lambda step: (
            step['step_date'],
            step.get('start_time') or '',
            str(step['id']),
        ),
    )
