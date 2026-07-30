from __future__ import annotations

from typing import Annotated

import typer

from applika.commands.applications import applications_app
from applika.commands.auth import login, logout, whoami
from applika.commands.skill import skill
from applika.commands.version import installed_version, version
from applika.config import AppConfig, resolve_api_base_url
from applika.lib.session import SessionStore

app = typer.Typer(
    name='applika',
    help='Job application tracker CLI for Applika.dev.',
    invoke_without_command=True,
)

app.add_typer(applications_app, name='applications')
app.command('skill')(skill)
app.command('login')(login)
app.command('logout')(logout)
app.command('whoami')(whoami)
app.command('version')(version)


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
    ctx.ensure_object(dict)
    ctx.obj = AppConfig(
        api_base_url=resolve_api_base_url(api_base_url, store),
        store=store,
    )
