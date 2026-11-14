"""The MCP tool registry (ADR-0028): the 25 CLI-parity tools, exactly one
scope each, listed by scope and ``cvs``, refused outside them, with the
hints AI apps read; and the instructions built per caller."""

from datetime import UTC, datetime

import pytest
from jsonschema import Draft202012Validator
from mcp import types

from app.application.dto.user import UserDTO
from app.application.use_cases.mcp_tokens.authenticate import McpPrincipal
from app.core.mcp_scopes import McpScope
from app.lib.types import SnowflakeID
from app.presentation.mcp.auth import McpCaller
from app.presentation.mcp.registry import (
    McpTool,
    ToolRegistry,
    any_of_output,
    json_result,
    list_output,
)
from app.presentation.mcp.server import build_instructions, registry
from app.presentation.mcp.tools.common import NoInput, item_ids_optional
from app.presentation.schemas.platform import PlatformOut

READ = {
    'whoami',
    'list_platforms',
    'search_companies',
    'list_applications',
    'get_application',
    'list_timeline',
}
WRITE = {
    'create_application',
    'edit_application',
    'finalize_application',
    'reopen_application',
    'add_timeline_event',
    'edit_timeline_event',
}
DELETE = {'delete_timeline_event'}
CV_READ = {
    'list_cvs',
    'get_cv',
    'download_cv',
    'get_application_cv',
    'download_application_cv',
    'diff_application_cv',
}
CV_WRITE = {
    'create_cv',
    'edit_cv',
    'create_application_cv',
    'edit_application_cv',
}
CV_DELETE = {'delete_cv', 'delete_application_cv'}
ALL = READ | WRITE | DELETE | CV_READ | CV_WRITE | CV_DELETE

FULL = frozenset(McpScope)
READ_WRITE = frozenset({McpScope.READ, McpScope.WRITE})
READ_ONLY = frozenset({McpScope.READ})


def caller(scopes=FULL, has_cvs=True) -> McpCaller:
    user = UserDTO(
        id=1,
        username='user',
        email='user@user.com',
        created_at=datetime.now(UTC),
    )
    return McpCaller(McpPrincipal(user, 9, frozenset(scopes)), has_cvs)


def _names(tools) -> set[str]:
    return {tool.name for tool in tools}


def test_there_are_25_tools_for_the_cli_commands():
    assert len(registry.tools) == 25
    assert _names(registry.tools) == ALL


def test_each_tool_has_exactly_one_scope():
    by_scope = {
        scope: {tool.name for tool in registry.tools if tool.scope is scope}
        for scope in McpScope
    }
    assert by_scope[McpScope.READ] == READ | CV_READ
    assert by_scope[McpScope.WRITE] == WRITE | CV_WRITE
    assert by_scope[McpScope.DELETE] == DELETE | CV_DELETE
    assert sum(len(names) for names in by_scope.values()) == 25


def test_only_the_cv_tools_need_cvs():
    needs = {tool.name for tool in registry.tools if tool.needs_cvs}
    assert needs == CV_READ | CV_WRITE | CV_DELETE


@pytest.mark.parametrize(
    ('scopes', 'has_cvs', 'expected'),
    [
        (READ_ONLY, False, READ),
        (READ_WRITE, False, READ | WRITE),
        (FULL, False, READ | WRITE | DELETE),
        (READ_ONLY, True, READ | CV_READ),
        (READ_WRITE, True, READ | WRITE | CV_READ | CV_WRITE),
        (FULL, True, ALL),
        (frozenset({McpScope.READ, McpScope.DELETE}), True,
         READ | CV_READ | DELETE | CV_DELETE),
    ],
)
def test_the_list_follows_scope_and_cvs(scopes, has_cvs, expected):
    assert _names(registry.visible(caller(scopes, has_cvs))) == expected


@pytest.mark.parametrize('name', sorted(ALL))
def test_a_tool_outside_the_scope_is_refused_with_auth_1052(name):
    tool = registry.get(name)
    assert tool is not None
    held = frozenset(McpScope) - {tool.scope} | (
        {McpScope.READ} if tool.scope is not McpScope.READ else set()
    )
    refused = registry.refusal(caller(held, True), name)
    assert refused is not None
    assert refused.isError is True
    assert refused.structuredContent is not None
    assert refused.structuredContent['code'] == 'AUTH-1052'
    assert 'Profile > MCP' in refused.structuredContent['detail']


@pytest.mark.parametrize('name', sorted(CV_READ | CV_WRITE | CV_DELETE))
def test_a_cv_tool_without_cvs_is_an_unknown_tool(name):
    refused = registry.refusal(caller(FULL, False), name)
    assert refused is not None
    assert refused.structuredContent == {
        'detail': 'Not Found',
        'code': 'GEN-1001',
    }


def test_an_unknown_tool_is_not_found_whatever_the_scope():
    refused = registry.refusal(caller(FULL, True), 'drop_database')
    assert refused is not None
    assert refused.structuredContent == {
        'detail': 'Not Found',
        'code': 'GEN-1001',
    }
    assert registry.refusal(caller(FULL, True), 'whoami') is None


def test_hints_read_only_and_destructive():
    for tool in registry.tools:
        annotations = tool.as_mcp().annotations
        assert annotations is not None
        assert annotations.openWorldHint is False
        if tool.scope is McpScope.READ:
            assert annotations.readOnlyHint is True
            assert annotations.destructiveHint is None
        else:
            assert annotations.readOnlyHint is False
            assert annotations.destructiveHint is (
                tool.scope is McpScope.DELETE
            )


def test_every_schema_is_a_valid_json_schema_object():
    for tool in registry.tools:
        mcp_tool = tool.as_mcp()
        Draft202012Validator.check_schema(mcp_tool.inputSchema)
        assert mcp_tool.inputSchema['type'] == 'object', tool.name
        assert mcp_tool.inputSchema.get('additionalProperties') is False
        if mcp_tool.outputSchema is not None:
            Draft202012Validator.check_schema(mcp_tool.outputSchema)
            assert mcp_tool.outputSchema['type'] == 'object', tool.name
    downloads = {
        tool.name for tool in registry.tools if tool.output_schema is None
    }
    assert downloads == {
        'download_cv',
        'download_application_cv',
        'diff_application_cv',
    }


def test_cv_item_ids_are_optional_in_the_published_schema():
    tool = registry.get('create_cv')
    assert tool is not None
    schema = tool.as_mcp().inputSchema
    assert 'id' not in schema['$defs']['ExperienceIn'].get('required', [])
    assert 'company' in schema['$defs']['ExperienceIn']['required']
    assert item_ids_optional({'type': 'object'}) == {'type': 'object'}


def test_a_list_result_is_wrapped_and_validates_its_schema():
    platforms = [
        PlatformOut(
            id=SnowflakeID(1), name='LinkedIn', url=None, is_public=True
        )
    ]
    result = json_result(platforms)
    assert result.structuredContent == {
        'result': [
            {'id': '1', 'name': 'LinkedIn', 'url': None, 'is_public': True}
        ]
    }
    block = result.content[0]
    assert isinstance(block, types.TextContent)
    assert block.text == (
        '[{"id": "1", "name": "LinkedIn", "url": null, "is_public": true}]'
    )
    Draft202012Validator(list_output(PlatformOut)).validate(
        result.structuredContent
    )


def test_any_of_output_merges_definitions():
    schema = any_of_output(PlatformOut, NoInput)
    assert schema['type'] == 'object'
    assert len(schema['anyOf']) == 2


async def _noop(ctx, args):  # pragma: no cover - never called
    return {}


def test_duplicate_tool_names_are_refused():
    tool = McpTool(
        name='twice',
        title='Twice',
        description='',
        scope=McpScope.READ,
        input_model=NoInput,
        handler=_noop,
    )
    with pytest.raises(ValueError, match='twice'):
        ToolRegistry([tool, tool])


def test_instructions_show_the_cv_part_only_to_cvs_users():
    with_cvs = build_instructions(caller(FULL, True))
    without = build_instructions(caller(FULL, False))
    assert '## 8. CVs' in with_cvs
    assert 'create_cv' in with_cvs
    assert '## 8. CVs' not in without
    assert 'create_cv' not in without
    assert 'cvs:start' not in with_cvs + without
    assert 'whoami' in without


def test_instructions_name_the_scope_and_what_is_missing():
    read_only = build_instructions(caller(READ_ONLY, False))
    assert 'Scope: `read`.' in read_only
    assert '`write`, `delete` are not offered' in read_only
    assert 'Profile > MCP' in read_only
    full = build_instructions(caller(FULL, False))
    assert 'Scope: `read`, `write`, `delete`.' in full
    assert 'are not offered' not in full


def test_instructions_carry_no_personal_data():
    text = build_instructions(caller(FULL, True))
    assert 'user@user.com' not in text
    assert 'username=' not in text
    assert build_instructions(None).startswith('# Applika MCP server')
