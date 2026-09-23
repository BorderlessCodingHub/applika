"""``applika applications cv …`` - an application's CV copy (KODI-018).

Routes: ``POST/GET/PUT/DELETE /applications/{id}/cv``,
``POST /applications/{id}/cv/pdf``, ``GET /applications/{id}/cv/markdown``,
``GET /applications/{id}/cv/diff/pdf`` and ``…/diff/markdown``.

The copy's update is a **full replace** (``PUT``), so every edit here reads
the stored copy first and sends the whole document back - the partial
behaviour the spec asks for is produced by the merge, not by the verb.
"""

from __future__ import annotations

from typing import Annotated

import typer

from applika.commands.cv_shared import (
    NEEDS_FILE_OR_NAME,
    NO_CHANGES,
    api_error,
    apply_name,
    download_document,
    emit_cv,
    load_document,
    merge_document,
    usage_error,
)
from applika.config import AppConfig
from applika.lib.api import ApiClient, ApiError, require_session
from applika.lib.cv_file import FileInputError
from applika.schemas.enums import CvOutput, DownloadType

FILE_HELP = (
    'CV document in JSON (.json) or YAML (.yaml/.yml); - reads stdin. '
    'Keys are the API field names.'
)
NAME_HELP = 'CV label (1-200). Overrides the file\'s "name".'
OUTPUT_HELP = (
    'text (summary), json, yaml, or md (the CV as the server renders it).'
)
TYPE_HELP = 'pdf or md. Required.'
DIR_HELP = 'Directory to write into (created when missing). Default: current.'
FILENAME_HELP = (
    "File name to write. Default: the server's name; the extension "
    'matching --type is added when missing.'
)
FORCE_HELP = 'Overwrite the file when it already exists.'
NO_BASELINE = 'nothing to compare against'
PRINT_NEEDS_MD = '--print is only valid with --type md.'


def _cv_path(application_id: str) -> str:
    return f'/applications/{application_id}/cv'


def _markdown_path(application_id: str) -> str:
    return f'/applications/{application_id}/cv/markdown'


def _pdf_path(application_id: str) -> str:
    return f'/applications/{application_id}/cv/pdf'


def get_application_cv(
    ctx: typer.Context,
    application_id: Annotated[
        str, typer.Argument(help='ID of the application.')
    ],
    output: Annotated[
        CvOutput,
        typer.Option('--output', help=OUTPUT_HELP),
    ] = CvOutput.TEXT,
) -> None:
    """Show an application's CV copy."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        cv = client.get_json(_cv_path(application_id))
        emit_cv(
            client,
            cv,
            output,
            markdown_path=_markdown_path(application_id),
            prefix='CV copy',
        )
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def create_application_cv(
    ctx: typer.Context,
    application_id: Annotated[
        str, typer.Argument(help='ID of the application.')
    ],
    from_cv: Annotated[
        str,
        typer.Option('--from', help='ID of the master CV to copy.'),
    ],
    file: Annotated[
        str | None,
        typer.Option(
            '--file',
            help=FILE_HELP + ' Applied to the fresh copy in the same command.',
        ),
    ] = None,
    name: Annotated[
        str | None,
        typer.Option('--name', help=NAME_HELP),
    ] = None,
    output: Annotated[
        CvOutput,
        typer.Option('--output', help=OUTPUT_HELP),
    ] = CvOutput.TEXT,
) -> None:
    """Copy a master CV into an application, applying --file edits in the
    same command."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        # Validate the file before the copy is created: a typo must not
        # leave a half-edited copy behind.
        given = apply_name(load_document(file), name)
        created = client.post_json(
            _cv_path(application_id),
            {'base_cv_id': from_cv},
        )
        if given:
            created = client.put_json(
                _cv_path(application_id),
                merge_document(created, given),
            )
        emit_cv(
            client,
            created,
            output,
            markdown_path=_markdown_path(application_id),
            prefix='Created CV copy',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def edit_application_cv(
    ctx: typer.Context,
    application_id: Annotated[
        str, typer.Argument(help='ID of the application.')
    ],
    file: Annotated[
        str | None,
        typer.Option('--file', help=FILE_HELP),
    ] = None,
    name: Annotated[
        str | None,
        typer.Option('--name', help=NAME_HELP),
    ] = None,
    output: Annotated[
        CvOutput,
        typer.Option('--output', help=OUTPUT_HELP),
    ] = CvOutput.TEXT,
) -> None:
    """Edit an application's CV copy. Partial: a section in the file replaces
    that section, an absent key is left unchanged."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        if file is None and name is None:
            usage_error(NEEDS_FILE_OR_NAME)
        given = apply_name(load_document(file), name)
        if not given:
            usage_error(NO_CHANGES)
        current = client.get_json(_cv_path(application_id))
        updated = client.put_json(
            _cv_path(application_id),
            merge_document(current, given),
        )
        emit_cv(
            client,
            updated,
            output,
            markdown_path=_markdown_path(application_id),
            prefix='Updated CV copy',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def delete_application_cv(
    ctx: typer.Context,
    application_id: Annotated[
        str, typer.Argument(help='ID of the application.')
    ],
    yes: Annotated[
        bool,
        typer.Option('--yes', help='Skip the confirmation prompt.'),
    ] = False,
) -> None:
    """Remove an application's CV copy."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        if not yes and not typer.confirm(
            f'Delete the CV copy of application {application_id}?'
        ):
            typer.echo('Aborted.')
            raise typer.Exit()
        client.delete(_cv_path(application_id))
        typer.echo(f'Deleted the CV copy of application {application_id}')
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def download_application_cv(
    ctx: typer.Context,
    application_id: Annotated[
        str, typer.Argument(help='ID of the application.')
    ],
    download_type: Annotated[
        DownloadType,
        typer.Option('--type', help=TYPE_HELP),
    ],
    directory: Annotated[
        str | None,
        typer.Option('--dir', help=DIR_HELP),
    ] = None,
    filename: Annotated[
        str | None,
        typer.Option('--filename', help=FILENAME_HELP),
    ] = None,
    force: Annotated[
        bool,
        typer.Option('--force', help=FORCE_HELP),
    ] = False,
) -> None:
    """Download an application's CV copy as PDF or Markdown."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        download_document(
            client,
            pdf_path=_pdf_path(application_id),
            markdown_path=_markdown_path(application_id),
            download_type=download_type,
            directory=directory,
            filename=filename,
            force=force,
            fallback_name=f'application-{application_id}-cv',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def diff_application_cv(
    ctx: typer.Context,
    application_id: Annotated[
        str, typer.Argument(help='ID of the application.')
    ],
    download_type: Annotated[
        DownloadType,
        typer.Option('--type', help=TYPE_HELP),
    ],
    directory: Annotated[
        str | None,
        typer.Option('--dir', help=DIR_HELP),
    ] = None,
    filename: Annotated[
        str | None,
        typer.Option('--filename', help=FILENAME_HELP),
    ] = None,
    force: Annotated[
        bool,
        typer.Option('--force', help=FORCE_HELP),
    ] = False,
    to_stdout: Annotated[
        bool,
        typer.Option(
            '--print',
            help='With --type md: print to stdout instead of writing a file.',
        ),
    ] = False,
) -> None:
    """Download the diff between the copy and the master CV it came from."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        if to_stdout and download_type is not DownloadType.MD:
            usage_error(PRINT_NEEDS_MD)
        download_document(
            client,
            pdf_path=f'/applications/{application_id}/cv/diff/pdf',
            markdown_path=f'/applications/{application_id}/cv/diff/markdown',
            download_type=download_type,
            directory=directory,
            filename=filename,
            force=force,
            fallback_name=f'application-{application_id}-cv-diff',
            to_stdout=to_stdout,
            pdf_method='GET',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        if exc.status_code == 409:
            typer.echo(f'{NO_BASELINE}: {exc.detail}', err=True)
            raise typer.Exit(1) from exc
        api_error(exc)
    finally:
        client.close()
