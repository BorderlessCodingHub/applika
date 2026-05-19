import typer

from applika.commands.applications.commands import (
    add_application_step,
    delete_application_step,
    edit_application,
    edit_application_step,
    finalize_application,
    list_application_steps,
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
applications_app.command('finalize')(finalize_application)

steps_app = typer.Typer(
    name='steps',
    help='Manage recorded application steps.',
    no_args_is_help=True,
)

steps_app.command('list')(list_application_steps)
steps_app.command('add')(add_application_step)
steps_app.command('edit')(edit_application_step)
steps_app.command('delete')(delete_application_step)

applications_app.add_typer(steps_app, name='steps')
