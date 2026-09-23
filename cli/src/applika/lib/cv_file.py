"""``--file`` loading and local validation (KODI-018).

One module for both payload families the spec gives ``--file`` to: a CV
document (``cvs create|edit``, ``applications cv create|edit``) and an
application payload (``applications new|edit``).

Every failure here is a *usage* failure, raised as :class:`FileInputError` and
turned into exit code 2 by the commands - nothing has been sent at that point.
API failures keep exit code 1.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ValidationError

from applika.schemas.cv import (
    NOT_NULLABLE_FIELDS,
    READ_ONLY_KEYS,
    CVDocument,
    assign_item_ids,
)

#: Exit code for a usage or file-validation error (the spec's "exit 2").
USAGE_EXIT_CODE = 2

_JSON_SUFFIXES = {'.json'}
_YAML_SUFFIXES = {'.yaml', '.yml'}
STDIN_PATH = '-'


class FileInputError(ValueError):
    """A ``--file`` (or a related local input) the CLI refuses to send."""


def load_payload_file(path: str) -> dict[str, Any]:
    """Read a JSON/YAML mapping from ``path``; ``-`` reads stdin.

    The format follows the extension (``.json`` / ``.yaml`` / ``.yml``); on
    stdin the text is sniffed - JSON first, then YAML.
    """
    if path == STDIN_PATH:
        text = sys.stdin.read()
        if not text.strip():
            raise FileInputError('No data on stdin for --file -.')
        data = _parse_sniffed(text)
    else:
        file_path = Path(path)
        suffix = file_path.suffix.lower()
        if suffix in _JSON_SUFFIXES:
            loader = _parse_json
        elif suffix in _YAML_SUFFIXES:
            loader = _parse_yaml
        else:
            raise FileInputError(
                f'--file must be .json, .yaml or .yml (got "{path}"); '
                'use - to read from stdin.'
            )
        if not file_path.is_file():
            raise FileInputError(f'--file not found: {path}')
        data = loader(file_path.read_text(encoding='utf-8'))

    if not isinstance(data, dict):
        raise FileInputError(
            '--file must hold an object/mapping of field names, '
            f'got {type(data).__name__}.'
        )
    return data


def read_text_file(path: str, option: str) -> str:
    """Read a plain-text/Markdown file for ``--job-description-file``."""
    if path == STDIN_PATH:
        return sys.stdin.read()
    file_path = Path(path)
    if not file_path.is_file():
        raise FileInputError(f'{option} not found: {path}')
    return file_path.read_text(encoding='utf-8')


def strip_read_only(raw: dict[str, Any], read_only: frozenset[str]) -> dict:
    """Drop the server-only keys so ``get --output json`` round-trips.

    Unknown keys that are *not* server-only stay in the mapping and are
    refused by the model's ``extra='forbid'`` - the spec wants a typo to be
    an error, and a re-fed API response not to be one.
    """
    return {key: value for key, value in raw.items() if key not in read_only}


def validate_cv_document(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate a ``--file`` CV document and return only the keys it set.

    Section items get their missing ``id``s here, so what the caller gets
    back is ready to merge and send.
    """
    payload = strip_read_only(raw, READ_ONLY_KEYS)
    _reject_explicit_nulls(payload)
    document = _validate(CVDocument, payload, '--file')
    given = document.model_dump(exclude_unset=True, mode='json')
    return assign_item_ids(given)


def _reject_explicit_nulls(payload: dict[str, Any]) -> None:
    """Refuse ``"headline": null``: the API answers 422 for it.

    ``phone`` is the one nullable column, so ``{"phone": null}`` is kept and
    really does clear the stored value.
    """
    nulls = sorted(
        key
        for key in NOT_NULLABLE_FIELDS
        if key in payload and payload[key] is None
    )
    if nulls:
        joined = ', '.join(nulls)
        raise FileInputError(
            f'--file: {joined} cannot be null; '
            'omit the field to leave it unchanged.'
        )


def _validate(
    model: type[BaseModel],
    payload: dict[str, Any],
    label: str,
) -> BaseModel:
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise FileInputError(
            f'{label}: {format_validation_error(exc)}'
        ) from exc


def format_validation_error(exc: ValidationError) -> str:
    """One line per failing field, ``location: message``."""
    lines = []
    for error in exc.errors():
        location = '.'.join(str(part) for part in error['loc']) or '(root)'
        message = error['msg']
        if error['type'] == 'extra_forbidden':
            message = 'unknown field'
        lines.append(f'{location}: {message}')
    return '; '.join(lines)


def _parse_json(text: str) -> Any:
    try:
        return json.loads(text)
    except ValueError as exc:
        raise FileInputError(f'--file is not valid JSON: {exc}') from exc


def _parse_yaml(text: str) -> Any:
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise FileInputError(f'--file is not valid YAML: {exc}') from exc


def _parse_sniffed(text: str) -> Any:
    try:
        return json.loads(text)
    except ValueError:
        pass
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise FileInputError(
            f'--file -: stdin is neither valid JSON nor valid YAML: {exc}'
        ) from exc
