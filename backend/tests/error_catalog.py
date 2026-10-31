"""Reads ``docs/error-codes.md`` (ADR-0025): the catalog every error code is
listed in. Shared by the unit and the integration error-code tests."""

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parents[2] / 'docs' / 'error-codes.md'


@dataclass(frozen=True)
class CatalogRow:
    code: str
    status: str
    detail: str
    params: frozenset[str]
    description: str
    raised_by: str

    def detail_pattern(self) -> re.Pattern[str]:
        """The English message as a regex: ``<name>`` matches any value."""
        parts = re.split(r'<[a-z_]+>', self.detail)
        return re.compile('^' + '.+'.join(map(re.escape, parts)) + '$')


def _cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip('|').split('|')]


def _table(heading: str) -> list[list[str]]:
    lines = CATALOG_PATH.read_text().splitlines()
    start = lines.index(heading)
    rows: list[list[str]] = []
    for line in lines[start + 1 :]:
        if line.startswith('## '):
            break
        if line.startswith('|'):
            rows.append(_cells(line))
    return rows[2:]  # header + separator


@cache
def catalog_rows() -> tuple[CatalogRow, ...]:
    rows = []
    for code, status, detail, params, description, raised_by in _table(
        '## Codes'
    ):
        rows.append(
            CatalogRow(
                code=code,
                status=status,
                detail=detail.strip('`'),
                params=frozenset(
                    p.strip().strip('`')
                    for p in params.split(',')
                    if p.strip() not in {'—', ''}
                ),
                description=description,
                raised_by=raised_by,
            )
        )
    return tuple(rows)


@cache
def catalog() -> dict[str, CatalogRow]:
    return {row.code: row for row in catalog_rows()}


def catalog_areas() -> dict[str, int]:
    return {area: int(count) for area, _, count in _table('## Areas')}


def code_for(detail: str) -> str:
    """The one code whose fixed English message is ``detail`` (outside the
    OAuth ``invalid_grant`` twins). Fails loudly when none or several."""
    rows = [
        row
        for row in catalog_rows()
        if row.detail == detail
        and not row.params
        and 'invalid_grant' not in row.description
    ]
    assert len(rows) == 1, (detail, [row.code for row in rows])
    return rows[0].code
