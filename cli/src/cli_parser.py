import argparse

from applications import (
    add_application_args,
    handle_applications_edit,
    handle_applications_list,
    handle_applications_new,
)
from auth_commands import handle_login, handle_logout
from choices import MODE_CHOICES, STATUS_CHOICES


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='applika')
    parser.add_argument('--api-base-url')
    subparsers = parser.add_subparsers(dest='command', required=True)

    login_parser = subparsers.add_parser('login')
    login_parser.set_defaults(handler=handle_login)

    logout_parser = subparsers.add_parser('logout')
    logout_parser.set_defaults(handler=handle_logout)

    applications_parser = subparsers.add_parser('applications')
    applications_subparsers = applications_parser.add_subparsers(
        dest='applications_command',
        required=True,
    )

    list_parser = applications_subparsers.add_parser('list')
    list_parser.add_argument('--cycle-id')
    list_parser.add_argument('--search')
    list_parser.add_argument('--mode', choices=MODE_CHOICES, default='all')
    list_parser.add_argument('--status', choices=STATUS_CHOICES, default='all')
    list_parser.add_argument('--platform')
    list_parser.add_argument('--from', dest='from_date')
    list_parser.add_argument('--to', dest='to_date')
    list_parser.add_argument('--json', action='store_true')
    list_parser.set_defaults(handler=handle_applications_list)

    new_parser = applications_subparsers.add_parser('new')
    add_application_args(new_parser, require_all=True)
    new_parser.set_defaults(handler=handle_applications_new)

    edit_parser = applications_subparsers.add_parser('edit')
    edit_parser.add_argument('application_id')
    add_application_args(edit_parser, require_all=False)
    edit_parser.add_argument('--clear-job-url', action='store_true')
    edit_parser.add_argument('--clear-observation', action='store_true')
    edit_parser.add_argument('--clear-country', action='store_true')
    edit_parser.add_argument('--clear-salary', action='store_true')
    edit_parser.set_defaults(handler=handle_applications_edit)

    return parser
