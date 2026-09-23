"""CV renderers for ``--output`` (KODI-018).

``text`` is a human summary, ``json``/``yaml`` print the API response as-is
(the spec's "Round trip" convention: what comes out goes back into
``--file``), and ``md`` is never rendered here - it is the server's own
Markdown, fetched with a second call by the commands.
"""

from __future__ import annotations

import json
from typing import Any

import yaml

from applika.schemas.cv import SECTION_KEYS


def dump_json(payload: Any) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=False)


def dump_yaml(payload: Any) -> str:
    return yaml.safe_dump(
        payload,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    ).rstrip('\n')


def print_cv_summary(cv: dict[str, Any], prefix: str) -> None:
    """The default ``--output text`` line pair for a single CV."""
    parts = [
        f'{prefix}:',
        f'id={cv["id"]}',
        f'name={cv.get("name", "-")}',
        f'full_name={cv.get("full_name", "-")}',
        f'headline={cv.get("headline", "-")}',
    ]
    if 'application_id' in cv:
        parts.append(f'application={cv.get("application_id")}')
        parts.append(f'base_cv={cv.get("base_cv_id") or "-"}')
    parts.append(f'updated={cv.get("updated_at") or "-"}')
    print(' '.join(parts))
    print(
        'sections: '
        + ' '.join(
            f'{section}={len(cv.get(section) or [])}'
            for section in SECTION_KEYS
        )
    )


def _cv_rows(cvs: list[dict[str, Any]]) -> list[list[str]]:
    return [
        [
            str(cv['id']),
            str(cv.get('name') or '-'),
            str(cv.get('headline') or '-'),
            str(cv.get('updated_at') or '-'),
        ]
        for cv in cvs
    ]


CV_TABLE_HEADERS = ['id', 'name', 'headline', 'updated']


def render_cv_table(cvs: list[dict[str, Any]]) -> None:
    rows = _cv_rows(cvs)
    widths = [
        max(len(header), *(len(row[index]) for row in rows))
        if rows
        else len(header)
        for index, header in enumerate(CV_TABLE_HEADERS)
    ]
    print(
        '  '.join(
            header.ljust(widths[index])
            for index, header in enumerate(CV_TABLE_HEADERS)
        )
    )
    for row in rows:
        print(
            '  '.join(
                value.ljust(widths[index]) for index, value in enumerate(row)
            )
        )


def render_cv_markdown_table(cvs: list[dict[str, Any]]) -> None:
    """``cvs list --output md``: a Markdown table, not a rendered CV."""
    print('| ' + ' | '.join(CV_TABLE_HEADERS) + ' |')
    print('| ' + ' | '.join('---' for _ in CV_TABLE_HEADERS) + ' |')
    for row in _cv_rows(cvs):
        print('| ' + ' | '.join(_escape_cell(cell) for cell in row) + ' |')


def _escape_cell(value: str) -> str:
    return value.replace('|', '\\|').replace('\n', ' ')
