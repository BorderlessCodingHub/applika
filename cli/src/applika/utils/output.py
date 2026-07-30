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


def _format_time_range(step: dict[str, Any]) -> str:
    start_time = step.get('start_time')
    end_time = step.get('end_time')
    if not start_time or not end_time:
        return '-'
    return f'{start_time}-{end_time}'
