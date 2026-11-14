"""Trailing-slash twins for feature-gated routes (ADR-0018).

Starlette's router answers a path that matches no route but would match
without its trailing slash with a 307 redirect, before any dependency runs.
For a gated route that redirect tells a caller without the feature that the
route exists (``GET /jobs/`` -> 307, ``GET /no-such-route/`` -> 404).

``add_slash_twins`` registers, for each gated route, a copy at the same path
plus ``/``: same endpoint, same methods, same dependencies (so the same
``require_feature`` gate), left out of the OpenAPI schema. A route then
always matches the slash path (one trailing slash or more), the redirect never fires, and the gate
answers the unknown-route 404 to a caller without the feature. A caller
with the feature is served directly on the slash path. Only the gated
routes get twins; every other route keeps Starlette's redirect.

Call it at the end of the router module, after every route is declared.
"""

import copy
import re
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter
from fastapi.routing import APIRoute
from starlette.routing import compile_path


def _one_or_more_slashes(pattern: re.Pattern[str]) -> re.Pattern[str]:
    """``^/jobs/$`` -> ``^/jobs/+$``: Starlette's redirect strips every
    trailing slash (``/jobs//`` -> ``/jobs``), so the twin must take them
    all."""
    return re.compile(pattern.pattern.removesuffix('/$') + '/+$')


class _SlashTwin(APIRoute):
    """An ``APIRoute`` whose path ends in one or more slashes. A class of
    its own so ``include_router`` (``route_class_override=type(route)``)
    rebuilds it with the same regex."""

    def __init__(
        self, path: str, endpoint: Callable[..., Any], **kwargs: Any
    ) -> None:
        super().__init__(path, endpoint, **kwargs)
        self.path_regex = _one_or_more_slashes(self.path_regex)


def add_slash_twins(
    router: APIRouter,
    *,
    include: Callable[[APIRoute], bool] = lambda _route: True,
) -> None:
    """Append a schema-hidden ``<path>/`` twin of every ``APIRoute`` of
    ``router`` that ``include`` selects."""
    for route in list(router.routes):
        if not isinstance(route, APIRoute) or route.path.endswith('/'):
            continue
        if not include(route):
            continue
        twin = copy.copy(route)
        twin.__class__ = _SlashTwin
        twin.path = f'{route.path}/'
        path_regex, twin.path_format, twin.param_convertors = compile_path(
            twin.path
        )
        twin.path_regex = _one_or_more_slashes(path_regex)
        twin.include_in_schema = False
        router.routes.append(twin)
