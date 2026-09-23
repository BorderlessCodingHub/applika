import typer

from applika.commands.cvs.commands import (
    create_cv,
    delete_cv,
    download_cv,
    edit_cv,
    get_cv,
    list_cvs,
)

cvs_app = typer.Typer(
    name='cvs',
    help='Manage your master CVs (up to 3).',
    no_args_is_help=True,
    invoke_without_command=True,
)


@cvs_app.callback()
def _default(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is None:
        ctx.invoke(list_cvs)


cvs_app.command('list')(list_cvs)
cvs_app.command('get')(get_cv)
cvs_app.command('create')(create_cv)
cvs_app.command('edit')(edit_cv)
cvs_app.command('delete')(delete_cv)
cvs_app.command('download')(download_cv)
