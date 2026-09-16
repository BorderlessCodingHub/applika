from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version

import httpx
import typer

_PACKAGE_NAME = 'applika-cli'
_PYPI_JSON_URL = f'https://pypi.org/pypi/{_PACKAGE_NAME}/json'


def installed_version() -> str:
    try:
        return package_version(_PACKAGE_NAME)
    except PackageNotFoundError:
        return 'unknown'


def version() -> None:
    """Show the installed CLI version and the latest published PyPI version."""
    installed = installed_version()

    try:
        response = httpx.get(_PYPI_JSON_URL, timeout=10)
        response.raise_for_status()
        published = response.json()['info']['version']
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        typer.echo(f'installed: {installed}')
        typer.echo(f'published: unavailable ({exc})')
        return

    typer.echo(f'installed: {installed}')
    typer.echo(f'published: {published}')
