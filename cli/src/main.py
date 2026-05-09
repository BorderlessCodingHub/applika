import sys

import httpx

from api import ApiError, AuthError
from cli_context import CommandContext, normalize_argv
from cli_parser import build_parser
from session import SessionStore, resolve_api_base_url


def main(argv: list[str] | None = None) -> int:
    argv = normalize_argv(list(argv or sys.argv[1:]))
    parser = build_parser()
    args = parser.parse_args(argv)

    store = SessionStore()
    context = CommandContext(
        api_base_url=resolve_api_base_url(args.api_base_url, store),
        store=store,
    )

    try:
        return args.handler(args, context)
    except (
        ApiError,
        AuthError,
        RuntimeError,
        ValueError,
        httpx.HTTPError,
    ) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
