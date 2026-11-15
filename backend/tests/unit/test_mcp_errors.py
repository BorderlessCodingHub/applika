"""MCP tool errors (ADR-0028, ADR-0025): the tool error's
``structuredContent`` is the REST body, through the one helper the REST
handlers use (``presentation/handlers.error_answer``)."""

import json

import pytest
from fastapi import Request
from mcp import types
from pydantic import BaseModel, ValidationError

from app.core import exceptions
from app.core.error_codes import ErrorCode
from app.presentation import handlers
from app.presentation.mcp.errors import (
    NOT_FOUND_BODY,
    SCOPE_MISSING,
    SCOPE_MISSING_BODY,
    exception_error,
    tool_error,
)


def _text(result: types.CallToolResult) -> str:
    block = result.content[0]
    assert isinstance(block, types.TextContent)
    return block.text


def _request() -> Request:
    return Request({'type': 'http', 'method': 'GET', 'headers': []})


DOMAIN = [
    (exceptions.ResourceNotFound, handlers._resource_not_found_handler),
    (exceptions.ResourceConflict, handlers._resource_conflict_handler),
    (exceptions.ApplicationFinalized, handlers._application_finalized_handler),
    (
        exceptions.BusinessRuleViolation,
        handlers._business_rule_violation_handler,
    ),
    (exceptions.InvalidDate, handlers._invalid_date_handler),
    (exceptions.ForbiddenAccess, handlers._forbidden_access_handler),
    (exceptions.PdfRenderFailed, handlers._pdf_render_failed_handler),
    (exceptions.CVExportFailed, handlers._cv_export_failed_handler),
    (exceptions.ServiceUnavailable, handlers._service_unavailable_handler),
    (exceptions.InvalidSession, handlers._invalid_session_handler),
    (exceptions.InvalidRequest, handlers._invalid_request_handler),
]


@pytest.mark.parametrize(('exc_type', 'handler'), DOMAIN)
@pytest.mark.parametrize('params', [None, {'max': 3}])
async def test_the_tool_error_body_is_the_rest_body(exc_type, handler, params):
    exc = exc_type('Some words', ErrorCode.CV_BASE_CV_LIMIT, params)
    rest = await handler(_request(), exc)
    result = exception_error(exc, 'tool')
    assert result.isError is True
    assert result.structuredContent == json.loads(bytes(rest.body))
    assert _text(result) == 'Some words (CV-1002)'


async def test_the_coded_refusal_and_session_bodies_match_rest_too():
    for exc, handler in (
        (exceptions.MembershipLocked(), handlers._coded_refusal_handler),
        (
            exceptions.SessionServiceUnavailable(),
            handlers._session_service_unavailable_handler,
        ),
    ):
        rest = await handler(_request(), exc)
        result = exception_error(exc, 'tool')
        assert result.structuredContent == json.loads(bytes(rest.body))


async def test_rest_keeps_retry_after():
    response = await handlers._session_service_unavailable_handler(
        _request(), exceptions.SessionServiceUnavailable()
    )
    assert response.headers['retry-after'] == '5'


class _Body(BaseModel):
    when: int


def test_a_validation_error_is_the_rest_422_body():
    with pytest.raises(ValidationError) as caught:
        _Body.model_validate({'when': 'x'})
    result = exception_error(caught.value, 'tool')
    body = result.structuredContent
    assert body is not None
    assert body['code'] == 'GEN-1003'
    assert isinstance(body['detail'], list)
    assert {'type', 'loc', 'msg'} <= set(body['detail'][0])
    assert _text(result).endswith('(GEN-1003)')
    assert _text(result).startswith('when: ')


def test_an_unexpected_error_is_the_rest_500_body():
    result = exception_error(RuntimeError('boom'), 'tool')
    assert result.structuredContent == {
        'detail': 'Internal Server Error',
        'code': 'GEN-1005',
    }
    assert 'boom' not in _text(result)


def test_a_plain_domain_exception_no_handler_maps_is_a_500():
    exc = exceptions.UnicornException('x', ErrorCode.GEN_NOT_FOUND)
    assert handlers.error_answer(exc) is None
    assert exception_error(exc, 'tool').structuredContent == {
        'detail': 'Internal Server Error',
        'code': 'GEN-1005',
    }


def test_the_contract_bodies():
    assert NOT_FOUND_BODY == {'detail': 'Not Found', 'code': 'GEN-1001'}
    assert SCOPE_MISSING_BODY == {
        'detail': (
            "This MCP token's scope does not allow this tool. Create a "
            'token with more access in Applika: Profile > MCP.'
        ),
        'code': 'AUTH-1052',
    }
    result = tool_error(dict(SCOPE_MISSING_BODY))
    assert result.isError is True
    assert _text(result) == f'{SCOPE_MISSING} (AUTH-1052)'
    assert result.structuredContent == SCOPE_MISSING_BODY


def test_a_detail_that_is_neither_text_nor_a_list_is_written_as_json():
    result = tool_error({'detail': {'a': 1}, 'code': 'GEN-1003'})
    assert _text(result) == '{"a": 1} (GEN-1003)'
