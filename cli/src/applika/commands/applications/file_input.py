"""``applications new|edit --file`` and the job-description options
(KODI-018).

Kept out of ``commands.py`` so the 0.1.4/0.2.0 named-option paths in
``new_application`` / ``edit_application`` stay exactly as they were: the
file path is an alternative *input*, never a change to what the existing
options do.
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from applika.commands.applications.api_resolve import resolve_company_input
from applika.lib.api import ApiClient
from applika.lib.cv_file import (
    FileInputError,
    format_validation_error,
    load_payload_file,
    read_text_file,
    strip_read_only,
)
from applika.schemas.application_file import (
    APPLICATION_READ_ONLY_KEYS,
    APPLICATION_REQUIRED_FIELDS,
    ApplicationFile,
)

JOB_DESCRIPTION_CONFLICT = (
    'Give either --job-description or --job-description-file, not both.'
)


def file_conflicts(given: dict[str, Any]) -> list[str]:
    """The named options the caller passed alongside ``--file``."""
    return sorted(
        option for option, value in given.items() if value is not None
    )


def conflict_message(options: list[str]) -> str:
    return (
        '--file cannot be combined with the named options: '
        + ', '.join(options)
        + '. Put those keys in the file instead.'
    )


def missing_message(missing: list[str]) -> str:
    return (
        'Missing required options: '
        + ', '.join(missing)
        + '. Provide them, or pass --file with the whole payload.'
    )


def load_application_file(path: str) -> dict[str, Any]:
    """Load, validate and normalise an ``applications --file`` payload.

    ``company_id`` / ``company_name`` from an API response are folded into
    ``company`` so that ``applications list --output-format json`` is a
    document ``--file`` accepts (the spec's round-trip convention).
    """
    raw = load_payload_file(path)
    company = raw.get('company')
    if company is None:
        if raw.get('company_id'):
            company = str(raw['company_id'])
        elif raw.get('company_name'):
            company = {'name': raw['company_name'], 'url': None}

    payload = strip_read_only(raw, APPLICATION_READ_ONLY_KEYS)
    if company is not None:
        payload['company'] = company
    try:
        model = ApplicationFile.model_validate(payload)
    except ValidationError as exc:
        raise FileInputError(f'--file: {format_validation_error(exc)}') from exc
    return model.model_dump(exclude_unset=True, mode='json')


def missing_required(document: dict[str, Any]) -> list[str]:
    return [
        field
        for field in APPLICATION_REQUIRED_FIELDS
        if document.get(field) in (None, '')
    ]


def resolve_file_company(
    client: ApiClient,
    company: str | dict[str, Any],
) -> str | dict[str, Any]:
    """A company given as a plain string may be an id or a name.

    An all-digit value is a Snowflake id and is sent as-is; anything else
    goes through the same ``/companies`` lookup ``--company`` uses, so a file
    can name a company the way a human would.
    """
    if isinstance(company, str):
        if company.isdigit():
            return company
        return resolve_company_input(client, company, None)
    return company


def job_description_input(
    text: str | None,
    path: str | None,
) -> tuple[bool, str | None]:
    """``(requested, value)`` for ``--job-description[-file]``.

    ``requested`` is False when neither option was given, which is what lets
    ``applications edit`` omit the key entirely and leave the stored text
    alone (the API's ``job_description`` is sticky). ``--job-description ""``
    is *requested* with value ``None``: the spec's "clears it".
    """
    if text is not None and path is not None:
        raise FileInputError(JOB_DESCRIPTION_CONFLICT)
    if path is not None:
        return True, read_text_file(path, '--job-description-file') or None
    if text is not None:
        return True, text or None
    return False, None
