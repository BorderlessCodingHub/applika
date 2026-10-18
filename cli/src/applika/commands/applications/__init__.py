import typer

from applika.commands.applications.commands import (
    add_application_step,
    add_timeline_event,
    delete_application_step,
    delete_timeline_event,
    edit_application,
    edit_application_step,
    edit_timeline_event,
    finalize_application,
    list_application_steps,
    list_applications,
    list_timeline_events,
    new_application,
    reopen_application,
)
from applika.commands.applications.cv import (
    create_application_cv,
    delete_application_cv,
    diff_application_cv,
    download_application_cv,
    edit_application_cv,
    get_application_cv,
)

applications_app = typer.Typer(
    name='applications',
    help='Manage job applications.',
    no_args_is_help=True,
    invoke_without_command=True,
)


@applications_app.callback()
def _default(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        ctx.invoke(list_applications)


applications_app.command('list')(list_applications)
applications_app.command('new')(new_application)
applications_app.command('edit')(edit_application)
applications_app.command('finalize')(finalize_application)
applications_app.command('reopen')(reopen_application)

steps_app = typer.Typer(
    name='steps',
    help=(
        '[DEPRECATED] Manage recorded application steps. '
        'Use `applications timeline` instead.'
    ),
    no_args_is_help=True,
)

steps_app.command(
    'list',
    help='[DEPRECATED] Use `applications timeline list` instead.',
)(list_application_steps)
steps_app.command(
    'add',
    help='[DEPRECATED] Use `applications timeline add` instead.',
)(add_application_step)
steps_app.command(
    'edit',
    help='[DEPRECATED] Use `applications timeline edit` instead.',
)(edit_application_step)
steps_app.command(
    'delete',
    help='[DEPRECATED] Use `applications timeline delete` instead.',
)(delete_application_step)

# Deliberately not Typer's `deprecated=True` here: click prints a
# DeprecationWarning to stderr on every invocation, and typer.testing's
# CliRunner mixes stderr into `result.output` by default, which would
# corrupt `applications steps list --output-format json` for a pinned
# 0.1.4 test. `[DEPRECATED]` in the help text carries the same signal
# without touching command output.
applications_app.add_typer(
    steps_app,
    name='steps',
    help=(
        '[DEPRECATED] Manage recorded application steps. '
        'Use `applications timeline` instead.'
    ),
)

timeline_app = typer.Typer(
    name='timeline',
    help='Manage an application timeline (interviews, offers and denials).',
    no_args_is_help=True,
)

timeline_app.command('list')(list_timeline_events)
timeline_app.command('add')(add_timeline_event)
timeline_app.command('edit')(edit_timeline_event)
timeline_app.command('delete')(delete_timeline_event)

applications_app.add_typer(timeline_app, name='timeline')

cv_app = typer.Typer(
    name='cv',
    help="Manage an application's CV copy (KODI-018).",
    no_args_is_help=True,
)

cv_app.command('get')(get_application_cv)
cv_app.command('create')(create_application_cv)
cv_app.command('edit')(edit_application_cv)
cv_app.command('delete')(delete_application_cv)
cv_app.command('download')(download_application_cv)
cv_app.command('diff')(diff_application_cv)

applications_app.add_typer(cv_app, name='cv')
