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
