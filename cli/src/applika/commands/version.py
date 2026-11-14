from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version

import httpx
import typer

from applika.lib.updater import PACKAGE_NAME, PYPI_JSON_URL


def installed_version() -> str:
    try:
        return package_version(PACKAGE_NAME)
    except PackageNotFoundError:
        return 'unknown'


def version() -> None:
    """Show the installed CLI version and the latest published PyPI version."""
    installed = installed_version()

    try:
        response = httpx.get(PYPI_JSON_URL, timeout=10)
        response.raise_for_status()
        published = response.json()['info']['version']
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        typer.echo(f'installed: {installed}')
        typer.echo(f'published: unavailable ({exc})')
        return

    typer.echo(f'installed: {installed}')
    typer.echo(f'published: {published}')
