from typing import Any


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
            platform_names.get(
                str(app['platform_id']), str(app['platform_id'])
            ),
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
            header.ljust(widths[index]) for index, header in enumerate(headers)
        )
    )
    for row in rows:
        print(
            '  '.join(
                value.ljust(widths[index]) for index, value in enumerate(row)
            )
        )


def print_application_summary(application: dict[str, Any], prefix: str) -> None:
    print(
        f'{prefix}: '
        f'id={application["id"]} '
        f'company={application["company_name"]} '
        f'role={application["role"]} '
        f'date={application["application_date"]}'
    )


def render_application_step_table(steps: list[dict[str, Any]]) -> None:
    rows = [
        [
            str(step['id']),
            step['step_date'],
            step.get('step_name') or str(step['step_id']),
            _format_time_range(step),
            step.get('timezone') or '-',
            step.get('observation') or '-',
        ]
        for step in steps
    ]
    headers = ['id', 'date', 'step', 'time', 'timezone', 'observation']
    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        if rows
        else len(header)
        for index, header in enumerate(headers)
    ]

    print(
        '  '.join(
            header.ljust(widths[index]) for index, header in enumerate(headers)
        )
    )
    for row in rows:
        print(
            '  '.join(
                value.ljust(widths[index]) for index, value in enumerate(row)
            )
        )


def print_application_step_summary(step: dict[str, Any], prefix: str) -> None:
    print(
        f'{prefix}: '
        f'id={step["id"]} '
        f'step={step.get("step_name") or step["step_id"]} '
        f'date={step["step_date"]}'
    )


def print_finalize_summary(application: dict[str, Any], prefix: str) -> None:
    """The 0.1.4 legacy ``--step`` finalize body's output, pinned exactly as
    0.1.4 had it. Do not use this for the 0.2.0 bodyless/``--outcome``
    finalize or for ``reopen`` — see ``print_finalize_outcome_summary``."""
    last_step = application.get('last_step') or {}
    feedback = application.get('feedback') or {}
    salary_offer = application.get('salary_offer')

    parts = [
        f'{prefix}:',
        f'id={application["id"]}',
        f'company={application["company_name"]}',
        f'role={application["role"]}',
        f'final_step={last_step.get("name", "-")}',
        f'feedback={feedback.get("name", "-")}',
        f'date={last_step.get("date") or feedback.get("date") or "-"}',
    ]
    if salary_offer is not None:
        parts.append(f'salary_offer={salary_offer}')

    print(' '.join(parts))


def print_finalize_outcome_summary(
    application: dict[str, Any],
    prefix: str,
    *,
    outcome: str | None = None,
) -> None:
    """The 0.2.0 bodyless/``--outcome`` finalize and ``reopen`` output.

    ``Application.last_step`` is the *latest-dated* timeline event, not the
    closing one — a future-dated interview added before closing sorts after
    the outcome event and would print as the "final step" even though it
    never closed anything. Print what actually happened instead: whether
    the application is closed, when, and — for an ``--outcome`` finalize —
    the outcome the request itself carried, not a value re-derived from the
    timeline.
    """
    status = 'closed' if application.get('finalized') else 'open'

    parts = [
        f'{prefix}:',
        f'id={application["id"]}',
        f'company={application["company_name"]}',
        f'role={application["role"]}',
        f'status={status}',
        f'finalized_at={application.get("finalized_at") or "-"}',
    ]
    if outcome is not None:
        parts.append(f'outcome={outcome}')

    print(' '.join(parts))


def render_timeline_event_table(events: list[dict[str, Any]]) -> None:
    rows = [
        [
            str(event['id']),
            event['event_date'],
            event['event_type'],
            _format_timeline_detail(event),
            _format_time_range(event),
            event.get('timezone') or '-',
            event.get('observation') or '-',
        ]
        for event in events
    ]
    headers = [
        'id',
        'date',
        'type',
        'detail',
        'time',
        'timezone',
        'observation',
    ]
    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        if rows
        else len(header)
        for index, header in enumerate(headers)
    ]

    print(
        '  '.join(
            header.ljust(widths[index]) for index, header in enumerate(headers)
        )
    )
    for row in rows:
        print(
            '  '.join(
                value.ljust(widths[index]) for index, value in enumerate(row)
            )
        )


def print_timeline_event_summary(event: dict[str, Any], prefix: str) -> None:
    parts = [
        f'{prefix}:',
        f'id={event["id"]}',
        f'type={event["event_type"]}',
        f'date={event["event_date"]}',
    ]
    detail = _format_timeline_detail(event)
    if detail != '-':
        parts.append(f'detail={detail}')
    print(' '.join(parts))


def _format_timeline_detail(event: dict[str, Any]) -> str:
    if event.get('event_type') == 'interview' and event.get('interview_type'):
        return str(event['interview_type'])
    if event.get('event_type') == 'offer' and event.get('salary_amount'):
        amount = event.get('salary_amount')
        currency = event.get('salary_currency') or ''
        period = event.get('salary_period') or ''
        return f'{amount} {currency}/{period}'.strip()
    return '-'


def _format_time_range(step: dict[str, Any]) -> str:
    start_time = step.get('start_time')
    end_time = step.get('end_time')
    if not start_time or not end_time:
        return '-'
    return f'{start_time}-{end_time}'
