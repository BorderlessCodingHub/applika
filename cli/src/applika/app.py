from __future__ import annotations

from typing import Annotated

import typer

from applika.commands.applications import applications_app
from applika.commands.auth import login, logout, whoami
from applika.commands.cvs import cvs_app
from applika.commands.skill import skill
from applika.commands.update import update
from applika.commands.version import installed_version, version
from applika.config import (
    ApiBaseUrlSource,
    AppConfig,
    resolve_api_base_url_with_source,
)
from applika.lib import updater
from applika.lib.session import SessionStore

app = typer.Typer(
    name='applika',
    help='Job application tracker CLI for Applika.dev.',
    invoke_without_command=True,
)

app.add_typer(applications_app, name='applications')
app.add_typer(cvs_app, name='cvs')
app.command('skill')(skill)
app.command('login')(login)
app.command('logout')(logout)
app.command('whoami')(whoami)
app.command('version')(version)
app.command('update')(update)


def _from_env(source: object) -> bool:
    """--api-base-url reads APPLIKA_API_BASE_URL too: Click says which.

    Compared by name: older Typer returns ``click``'s ParameterSource, newer
    Typer its own vendored copy, and ``click`` is not a dependency.
    """
    return getattr(source, 'name', None) == 'ENVIRONMENT'


@app.callback()
def _root(
    ctx: typer.Context,
    api_base_url: Annotated[
        str | None,
        typer.Option(
            '--api-base-url',
            help='Override the API base URL (default: https://applika.dev/api).',
            envvar='APPLIKA_API_BASE_URL',
            show_default=False,
        ),
    ] = None,
    _version: Annotated[
        bool,
        typer.Option(
            '--version',
            '-v',
            help='Show the version and exit.',
            is_eager=True,
        ),
    ] = False,
) -> None:
    if _version:
        typer.echo(installed_version())
        raise typer.Exit()
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit()
    store = SessionStore()
    explicit_source = (
        ApiBaseUrlSource.ENV
        if _from_env(ctx.get_parameter_source('api_base_url'))
        else ApiBaseUrlSource.FLAG
    )
    url, source = resolve_api_base_url_with_source(
        api_base_url, explicit_source, store
    )
    ctx.ensure_object(dict)
    ctx.obj = AppConfig(
        api_base_url=url,
        store=store,
        api_base_url_source=source,
    )
    # The daily auto update, once the command (and its exit code) is done.
    # `applika update` has just checked: it never runs after it.
    if ctx.invoked_subcommand != 'update':
        ctx.call_on_close(lambda: updater.after_command(ctx.obj))
