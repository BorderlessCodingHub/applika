import typer

from applika.commands.applications.commands import (
    edit_application,
    list_applications,
    new_application,
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
