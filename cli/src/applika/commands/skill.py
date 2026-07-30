from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Annotated

import typer

SKILL_DIR_NAME = 'applika-cli'

_TOOLS: list[tuple[str, Path]] = [
    ('Claude', Path.home() / '.claude' / 'skills'),
    ('Gemini', Path.home() / '.gemini' / 'skills'),
    ('Codex', Path.home() / '.codex' / 'skills'),
    ('OpenCode', Path.home() / '.agents' / 'skills'),
]


def _bundled_skill_dir() -> Path:
    import applika

    path = Path(applika.__file__).parent / 'skills' / SKILL_DIR_NAME
    if not path.is_dir():
        raise RuntimeError(f'Bundled skill directory not found: {path}')
    return path


def _install_to(
    skill_src: Path,
    dest: Path,
    *,
    force: bool,
    dry_run: bool,
    copy: bool = False,
) -> None:
    if dry_run:
        method = 'copy' if copy else 'symlink (copy on failure)'
        typer.echo(f'  [dry-run] {method}: {dest}')
        return

    if dest.exists() or dest.is_symlink():
        if not force:
            typer.echo(
                f'  Skipped — already installed at {dest} (use --force to overwrite).'
            )
            return
        if dest.is_symlink():
            dest.unlink()
        elif dest.is_dir():
            shutil.rmtree(dest)
        else:
            dest.unlink()

    dest.parent.mkdir(parents=True, exist_ok=True)

    if copy:
        shutil.copytree(str(skill_src), str(dest))
        typer.echo(f'  Copied → {dest}')
        return

    try:
        os.symlink(skill_src, dest)
        typer.echo(f'  Symlinked → {dest}')
    except OSError:
        shutil.copytree(str(skill_src), str(dest))
        typer.echo(f'  Symlink failed, copied → {dest}')


def skill(
    local: Annotated[
        bool,
        typer.Option(
            '--local',
            help='Install to .claude/skills/ in the current directory (copy, no prompt).',
        ),
    ] = False,
    target_dir: Annotated[
        str | None,
        typer.Option(
            '--dir',
            help='Custom target skills directory (copy, no prompt).',
        ),
    ] = None,
    force: Annotated[
        bool,
        typer.Option('--force', help='Overwrite an existing installation.'),
    ] = False,
    dry_run: Annotated[
        bool,
        typer.Option(
            '--dry-run', help='Show what would happen without making changes.'
        ),
    ] = False,
) -> None:
    """Install the applika-cli AI skill into your assistant's skills directory.

    By default, opens an interactive picker to choose Claude, Gemini, Codex,
    OpenCode, or all of them. Symlinks the bundled skill directory; falls
    back to a file copy automatically if symlink creation fails (e.g.
    Windows without Developer Mode).

    Use --local or --dir to skip the picker and install as a file copy.
    """
    try:
        skill_src = _bundled_skill_dir()
    except RuntimeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1)

    # --local and --dir: skip prompt, always copy
    if target_dir:
        dest = Path(target_dir) / SKILL_DIR_NAME
        typer.echo(f'Installing to {dest}:')
        _install_to(skill_src, dest, force=force, dry_run=dry_run, copy=True)
        return

    if local:
        dest = Path.cwd() / '.claude' / 'skills' / SKILL_DIR_NAME
        typer.echo(f'Installing to {dest}:')
        _install_to(skill_src, dest, force=force, dry_run=dry_run, copy=True)
        return

    # Interactive picker
    typer.echo('Which AI tool(s) should the skill be installed for?\n')
    for i, (name, skills_root) in enumerate(_TOOLS, start=1):
        typer.echo(f'  {i}. {name:<8} ({skills_root / SKILL_DIR_NAME})')
    all_num = len(_TOOLS) + 1
    typer.echo(f'  {all_num}. All of the above\n')

    raw = typer.prompt(f'Choice [1-{all_num}]')

    try:
        choice = int(raw.strip())
    except ValueError:
        typer.echo(f'Invalid choice: {raw!r}', err=True)
        raise typer.Exit(1)

    if choice == all_num:
        selected = _TOOLS[:]
    elif 1 <= choice <= len(_TOOLS):
        selected = [_TOOLS[choice - 1]]
    else:
        typer.echo(f'Invalid choice: {choice}', err=True)
        raise typer.Exit(1)

    for name, skills_root in selected:
        dest = skills_root / SKILL_DIR_NAME
        typer.echo(f'\nInstalling for {name}:')
        _install_to(skill_src, dest, force=force, dry_run=dry_run)
