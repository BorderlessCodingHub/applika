"""MCP token scopes (ADR-0028): parse, serialize, ``read`` in every token,
an unknown name refused, the set open."""

import pytest
from pydantic import ValidationError

from app.core.mcp_scopes import (
    READ_REQUIRED_MESSAGE,
    SCOPE_REQUIRED_MESSAGE,
    McpScope,
    UnknownScopeError,
    held_scopes,
    parse_scope,
    scope_names,
    serialize_scope,
)
from app.presentation.schemas.mcp_tokens import McpTokenCreate


def test_the_first_set_is_read_write_delete():
    assert [scope.value for scope in McpScope] == ['read', 'write', 'delete']


@pytest.mark.parametrize(
    ('given', 'parsed'),
    [
        (['read'], (McpScope.READ,)),
        (['read', 'write'], (McpScope.READ, McpScope.WRITE)),
        (
            ['delete', 'read', 'write', 'read'],
            (McpScope.READ, McpScope.WRITE, McpScope.DELETE),
        ),
        ([' read ', 'delete'], (McpScope.READ, McpScope.DELETE)),
    ],
)
def test_parse_dedupes_and_orders_by_the_enum(given, parsed):
    assert parse_scope(given) == parsed


@pytest.mark.parametrize('given', [[], [''], ['  ']])
def test_an_empty_scope_is_refused(given):
    with pytest.raises(ValueError, match=SCOPE_REQUIRED_MESSAGE):
        parse_scope(given)


@pytest.mark.parametrize('given', [['write'], ['write', 'delete']])
def test_read_is_required(given):
    with pytest.raises(ValueError, match=READ_REQUIRED_MESSAGE):
        parse_scope(given)


def test_an_unknown_name_is_refused_by_name():
    with pytest.raises(UnknownScopeError, match="Unknown scope 'admin'"):
        parse_scope(['read', 'admin'])


def test_serialize_is_space_separated_in_enum_order():
    assert serialize_scope([McpScope.DELETE, McpScope.READ]) == 'read delete'
    assert (
        serialize_scope(parse_scope(['read', 'write', 'delete']))
        == 'read write delete'
    )


def test_a_stored_scope_reads_back():
    assert scope_names(None) is None
    assert scope_names('read write') == ['read', 'write']
    assert held_scopes('read write') == {McpScope.READ, McpScope.WRITE}


def test_a_stored_name_the_code_does_not_know_grants_nothing():
    """The set is open: a stored token keeps its scope string as written,
    and a name no member carries is shown but never grants a tool."""
    assert scope_names('read export') == ['read', 'export']
    assert held_scopes('read export') == {McpScope.READ}
    assert held_scopes(None) == frozenset()


@pytest.mark.parametrize(
    'scope', [[], ['write'], ['read', 'admin'], ['nope']]
)
def test_the_token_request_refuses_a_bad_scope_as_a_validation_error(scope):
    """422 GEN-1003 on the route: a Pydantic ValidationError."""
    with pytest.raises(ValidationError):
        McpTokenCreate.model_validate({'name': 'x', 'scope': scope})


def test_the_token_request_trims_the_name_and_keeps_the_scope_order():
    body = McpTokenCreate.model_validate({
        'name': '  Claude Code  ',
        'scope': ['write', 'read'],
    })
    assert body.name == 'Claude Code'
    assert body.scope == ['read', 'write']
    assert body.scopes() == [McpScope.READ, McpScope.WRITE]


def test_the_token_request_refuses_a_name_over_100_characters():
    McpTokenCreate.model_validate({'name': 'x' * 100, 'scope': ['read']})
    with pytest.raises(ValidationError):
        McpTokenCreate.model_validate({'name': 'x' * 101, 'scope': ['read']})
