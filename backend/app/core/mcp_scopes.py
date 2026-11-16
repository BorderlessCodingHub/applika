"""MCP token scopes (ADR-0028).

Each MCP token carries a scope set fixed when it is created. It is stored
space-separated (RFC 6749 section 3.3 style) in ``user_sessions.scope`` and
mirrored in the session's Redis hash. Every MCP tool requires exactly one
scope; ``read`` is in every token.

The set is open: a later scope is a new member here, with no migration, and
no stored token changes. A stored name this code does not know grants
nothing (``held_scopes``) but is still shown as stored (``scope_names``).
"""

from collections.abc import Iterable
from enum import StrEnum


class McpScope(StrEnum):
    # Every read tool. In every token.
    READ = 'read'
    # Create, edit, close and reopen.
    WRITE = 'write'
    # Delete timeline events, master CVs and application CVs.
    DELETE = 'delete'


REQUIRED_SCOPE = McpScope.READ

SCOPE_REQUIRED_MESSAGE = 'Choose at least one scope'
READ_REQUIRED_MESSAGE = "Every MCP token needs the 'read' scope"


class UnknownScopeError(ValueError):
    """A name that is not a :class:`McpScope` member. A ``ValueError``, so a
    Pydantic validator turns it into the 422 ``GEN-1003`` list."""

    def __init__(self, name: str) -> None:
        super().__init__(f"Unknown scope '{name}'")
        self.name = name


def parse_scope(names: Iterable[str]) -> tuple[McpScope, ...]:
    """Validate a requested scope set: non-empty, known names only, holding
    ``read``. Answers it de-duplicated, in the enum's order. Raises a
    ``ValueError`` otherwise."""
    requested = [name.strip() for name in names]
    if not any(requested):
        raise ValueError(SCOPE_REQUIRED_MESSAGE)
    held: set[McpScope] = set()
    for name in requested:
        try:
            held.add(McpScope(name))
        except ValueError:
            raise UnknownScopeError(name) from None
    if REQUIRED_SCOPE not in held:
        raise ValueError(READ_REQUIRED_MESSAGE)
    return tuple(scope for scope in McpScope if scope in held)


def serialize_scope(scopes: Iterable[McpScope]) -> str:
    """``(READ, WRITE)`` -> ``'read write'``, in the enum's order."""
    held = set(scopes)
    return ' '.join(scope.value for scope in McpScope if scope in held)


def scope_names(stored: str | None) -> list[str] | None:
    """The stored scope as the device list shows it: its names in stored
    order, or ``None`` for a web or CLI session."""
    if stored is None:
        return None
    return stored.split()


def held_scopes(stored: str | None) -> frozenset[McpScope]:
    """What a stored scope grants: its known names only."""
    known = {scope.value for scope in McpScope}
    return frozenset(
        McpScope(name) for name in (stored or '').split() if name in known
    )
