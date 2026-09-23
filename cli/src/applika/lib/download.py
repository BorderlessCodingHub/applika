"""Shared ``--type`` / ``--dir`` / ``--filename`` / ``--force`` download
helper (KODI-018).

Four routes use it - a master CV's PDF and Markdown, a CV copy's PDF and
Markdown, and the copy's diff in both formats - so the file-naming rules of
the spec live in exactly one place:

* ``--type pdf|md`` is required and decides both the route and the extension;
* ``--dir`` defaults to the current directory and is created when missing;
* ``--filename`` defaults to the server's ``Content-Disposition`` name, and
  gets the extension matching ``--type`` appended when it does not carry it;
* an existing file is never overwritten unless ``--force``.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from applika.lib.cv_file import FileInputError
from applika.schemas.enums import DownloadType

EXTENSIONS: dict[str, str] = {
    DownloadType.PDF.value: '.pdf',
    DownloadType.MD.value: '.md',
}

_FILENAME_STAR = re.compile(
    r"filename\*\s*=\s*[^']*'[^']*'([^;]+)", re.IGNORECASE
)
_FILENAME = re.compile(
    r'filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)', re.IGNORECASE
)


def extension_for(download_type: DownloadType) -> str:
    return EXTENSIONS[download_type.value]


def filename_from_headers(
    headers: dict[str, Any],
    fallback: str,
) -> str:
    """The ``Content-Disposition`` file name, or ``fallback`` without one."""
    disposition = ''
    for key, value in headers.items():
        if key.lower() == 'content-disposition':
            disposition = str(value)
            break
    if not disposition:
        return fallback

    star = _FILENAME_STAR.search(disposition)
    if star:
        return Path(unquote(star.group(1).strip())).name or fallback

    match = _FILENAME.search(disposition)
    if match:
        raw = (match.group(1) or match.group(2) or '').strip().strip('"')
        return Path(raw).name or fallback
    return fallback


def with_extension(filename: str, extension: str) -> str:
    if filename.lower().endswith(extension):
        return filename
    return filename + extension


def resolve_target(
    *,
    directory: str | None,
    filename: str | None,
    server_filename: str,
    download_type: DownloadType,
    force: bool,
) -> Path:
    """The path to write, with the directory created and ``--force`` honoured."""
    extension = extension_for(download_type)
    chosen = with_extension(filename or server_filename, extension)
    if Path(chosen).name != chosen:
        raise FileInputError(
            '--filename must be a file name, not a path; use --dir for the '
            'directory.'
        )
    target_dir = Path(directory) if directory else Path.cwd()
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / chosen
    if target.exists() and not force:
        raise FileInputError(
            f'{target} already exists; pass --force to overwrite it.'
        )
    return target


def write_download(target: Path, content: bytes) -> Path:
    target.write_bytes(content)
    return target
