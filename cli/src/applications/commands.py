import argparse
import json

from api import ApiClient
from cli_context import CommandContext, require_session

from .filter import filter_applications
from .payloads import build_application_payload
from .view import print_application_summary, render_application_table


def handle_applications_list(
    args: argparse.Namespace,
    context: CommandContext,
) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)

    try:
        params = {'cycle_id': args.cycle_id} if args.cycle_id else None
        applications = client.get_json('/applications', params=params)
        supports = client.get_json('/supports')
        filtered = filter_applications(applications, supports, args)

        if args.json:
            print(json.dumps(filtered, indent=2, sort_keys=True))
        else:
            render_application_table(filtered, supports)

        return 0
    finally:
        client.close()


def handle_applications_new(
    args: argparse.Namespace,
    context: CommandContext,
) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)

    try:
        payload = build_application_payload(client, args, existing=None)
        created = client.post_json('/applications', payload)

        print_application_summary(created, 'Created application')
        return 0
    finally:
        client.close()


def handle_applications_edit(
    args: argparse.Namespace,
    context: CommandContext,
) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)

    try:
        applications = client.get_json('/applications')
        existing = next(
            (
                application
                for application in applications
                if str(application['id']) == args.application_id
            ),
            None,
        )
        if existing is None:
            raise ValueError('Application not found in the current cycle')
        if existing.get('finalized'):
            raise ValueError('Finalized applications cannot be edited')

        payload = build_application_payload(client, args, existing=existing)
        updated = client.put_json(
            f'/applications/{args.application_id}', payload
        )

        print_application_summary(updated, 'Updated application')
        return 0
    finally:
        client.close()
