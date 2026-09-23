"""``applika cvs …`` - the master CV commands (KODI-018).

Routes: ``GET/POST /base-cvs``, ``GET/PATCH/DELETE /base-cvs/{id}``,
``POST /base-cvs/{id}/pdf``, ``GET /base-cvs/{id}/markdown``.
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
    require_create_fields,
    usage_error,
)
from applika.config import AppConfig
from applika.lib.api import ApiClient, ApiError, require_session
from applika.lib.cv_file import FileInputError
from applika.schemas.enums import CvListOutput, CvOutput, DownloadType
from applika.utils.cv_output import (
    dump_json,
    dump_yaml,
    render_cv_markdown_table,
    render_cv_table,
)

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


def _markdown_path(cv_id: str) -> str:
    return f'/base-cvs/{cv_id}/markdown'


def _pdf_path(cv_id: str) -> str:
    return f'/base-cvs/{cv_id}/pdf'


def list_cvs(
    ctx: typer.Context,
    output: Annotated[
        CvListOutput,
        typer.Option(
            '--output',
            help='table, json, yaml, or md (a Markdown table).',
        ),
    ] = CvListOutput.TABLE,
) -> None:
    """List your master CVs."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        cvs = client.get_json('/base-cvs')
        if output is CvListOutput.JSON:
            typer.echo(dump_json(cvs))
        elif output is CvListOutput.YAML:
            typer.echo(dump_yaml(cvs))
        elif output is CvListOutput.MD:
            render_cv_markdown_table(cvs)
        else:
            render_cv_table(cvs)
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def get_cv(
    ctx: typer.Context,
    cv_id: Annotated[str, typer.Argument(help='ID of the master CV.')],
    output: Annotated[
        CvOutput,
        typer.Option('--output', help=OUTPUT_HELP),
    ] = CvOutput.TEXT,
) -> None:
    """Show one master CV."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        cv = client.get_json(f'/base-cvs/{cv_id}')
        emit_cv(
            client,
            cv,
            output,
            markdown_path=_markdown_path(cv_id),
            prefix='CV',
        )
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def create_cv(
    ctx: typer.Context,
    file: Annotated[
        str,
        typer.Option('--file', help=FILE_HELP),
    ],
    name: Annotated[
        str | None,
        typer.Option('--name', help=NAME_HELP),
    ] = None,
    output: Annotated[
        CvOutput,
        typer.Option('--output', help=OUTPUT_HELP),
    ] = CvOutput.TEXT,
) -> None:
    """Create a master CV from a JSON/YAML file (max 3 per user)."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        document = apply_name(load_document(file), name)
        require_create_fields(document)
        created = client.post_json('/base-cvs', document)
        emit_cv(
            client,
            created,
            output,
            markdown_path=_markdown_path(created['id']),
            prefix='Created CV',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def edit_cv(
    ctx: typer.Context,
    cv_id: Annotated[str, typer.Argument(help='ID of the master CV.')],
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
    """Edit a master CV. Partial: a section in the file replaces that
    section, an absent key is left unchanged."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        if file is None and name is None:
            usage_error(NEEDS_FILE_OR_NAME)
        given = apply_name(load_document(file), name)
        if not given:
            usage_error(NO_CHANGES)
        # Read first, exactly as the spec's edit semantics say: a missing CV
        # is a 404 before anything is written.
        client.get_json(f'/base-cvs/{cv_id}')
        updated = client.patch_json(f'/base-cvs/{cv_id}', given)
        emit_cv(
            client,
            updated,
            output,
            markdown_path=_markdown_path(cv_id),
            prefix='Updated CV',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def delete_cv(
    ctx: typer.Context,
    cv_id: Annotated[str, typer.Argument(help='ID of the master CV.')],
    yes: Annotated[
        bool,
        typer.Option('--yes', help='Skip the confirmation prompt.'),
    ] = False,
) -> None:
    """Delete a master CV. Existing copies keep their content."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        if not yes and not typer.confirm(f'Delete master CV {cv_id}?'):
            typer.echo('Aborted.')
            raise typer.Exit()
        client.delete(f'/base-cvs/{cv_id}')
        typer.echo(f'Deleted master CV {cv_id}')
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()


def download_cv(
    ctx: typer.Context,
    cv_id: Annotated[str, typer.Argument(help='ID of the master CV.')],
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
    """Download a master CV as PDF or Markdown."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)
    try:
        download_document(
            client,
            pdf_path=_pdf_path(cv_id),
            markdown_path=_markdown_path(cv_id),
            download_type=download_type,
            directory=directory,
            filename=filename,
            force=force,
            fallback_name=f'cv-{cv_id}',
        )
    except FileInputError as exc:
        usage_error(str(exc))
    except ApiError as exc:
        api_error(exc)
    finally:
        client.close()
