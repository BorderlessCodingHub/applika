"""Behaviour shared by ``applika cvs`` and ``applika applications cv``
(KODI-018).

The two command families differ only in their routes and in the HTTP verb
their edit uses (``PATCH`` for a master CV, a full-document ``PUT`` for a
copy). Everything the spec's "Conventions" table fixes - ``--file`` loading,
the partial-edit merge, ``--output``, the download naming rules and the exit
codes - lives here so both behave identically.
"""

from __future__ import annotations

from typing import Any, NoReturn

import typer

from applika.lib.api import ApiClient, ApiError
from applika.lib.cv_file import (
    USAGE_EXIT_CODE,
    load_payload_file,
    strip_read_only,
    validate_cv_document,
)
from applika.lib.download import (
    filename_from_headers,
    resolve_target,
    write_download,
)
from applika.schemas.cv import (
    DOCUMENT_KEYS,
    READ_ONLY_KEYS,
    assign_item_ids,
    missing_create_fields,
)
from applika.schemas.enums import CvOutput, DownloadType
from applika.utils.cv_output import dump_json, dump_yaml, print_cv_summary

NO_CHANGES = 'Nothing to update: give --file with at least one key or --name.'
NEEDS_FILE_OR_NAME = 'Give --file and/or --name.'


def usage_error(message: str) -> NoReturn:
    """A local/usage failure: nothing was sent, exit 2 (the spec)."""
    typer.echo(message, err=True)
    raise typer.Exit(USAGE_EXIT_CODE)


def api_error(exc: ApiError) -> NoReturn:
    """An API failure: print the API's ``detail``, exit 1 (the spec)."""
    typer.echo(exc.detail, err=True)
    raise typer.Exit(1)


def load_document(file: str | None) -> dict[str, Any]:
    """Load and locally validate a ``--file`` CV document."""
    if file is None:
        return {}
    return validate_cv_document(load_payload_file(file))


def apply_name(document: dict[str, Any], name: str | None) -> dict[str, Any]:
    """``--name`` overrides the file's ``name`` (the spec's conventions)."""
    if name is not None:
        document['name'] = name
    return document


def require_create_fields(document: dict[str, Any]) -> None:
    missing = missing_create_fields(document)
    if missing:
        usage_error(
            '--file is missing the fields the API requires: '
            + ', '.join(missing)
            + ' (use --name to supply name).'
        )


def merge_document(
    current: dict[str, Any],
    given: dict[str, Any],
) -> dict[str, Any]:
    """The full document a ``PUT`` needs: the stored CV with the file's keys
    applied on top.

    A section present in the file replaces that whole section; a key the file
    does not carry is left exactly as it is stored. The read-only/provenance
    keys the API refuses on input (``id``, ``base_cv_id``, ``base_snapshot``,
    …) are dropped here, which is what makes ``get --output json`` >
    ``edit --file`` a real round trip.
    """
    document = {
        key: value
        for key, value in strip_read_only(current, READ_ONLY_KEYS).items()
        if key in DOCUMENT_KEYS
    }
    document.update(given)
    return assign_item_ids(document)


def emit_cv(
    client: ApiClient,
    cv: dict[str, Any],
    output: CvOutput,
    *,
    markdown_path: str,
    prefix: str,
) -> None:
    """Print a single CV in the format ``--output`` asked for."""
    if output is CvOutput.JSON:
        typer.echo(dump_json(cv))
        return
    if output is CvOutput.YAML:
        typer.echo(dump_yaml(cv))
        return
    if output is CvOutput.MD:
        content, _ = client.fetch_raw('GET', markdown_path)
        typer.echo(content.decode('utf-8'), nl=False)
        return
    print_cv_summary(cv, prefix)


def download_document(
    client: ApiClient,
    *,
    pdf_path: str,
    markdown_path: str,
    download_type: DownloadType,
    directory: str | None,
    filename: str | None,
    force: bool,
    fallback_name: str,
    to_stdout: bool = False,
    pdf_method: str = 'POST',
) -> None:
    """Fetch a PDF/Markdown route and write it (or print it) per the spec.

    ``pdf_method`` exists because the export routes render on POST while the
    two diff routes are plain GETs.
    """
    if download_type is DownloadType.PDF:
        method, path = pdf_method, pdf_path
    else:
        method, path = 'GET', markdown_path

    content, headers = client.fetch_raw(method, path)

    if to_stdout:
        typer.echo(content.decode('utf-8'), nl=False)
        return

    server_name = filename_from_headers(headers, fallback_name)
    target = resolve_target(
        directory=directory,
        filename=filename,
        server_filename=server_name,
        download_type=download_type,
        force=force,
    )
    write_download(target, content)
    typer.echo(f'Saved {target}')
