"""The numbered error codes (ADR-0025, PRD 0019 R-011..R-016, R-019).

The registry (``ErrorCode``) and the catalog (``docs/error-codes.md``) are
one list; the params each code sends are the ones its catalog row names;
every handler adds ``code`` and adds ``params`` exactly when set.
"""

import ast
import json
import re
from collections import defaultdict
from pathlib import Path

import pytest
from starlette.requests import Request

from app.application.use_cases.borderless import complete_login, sign_in
from app.core import exceptions
from app.core.error_codes import ErrorCode
from app.presentation import handlers
from tests.error_catalog import catalog, catalog_areas, catalog_rows

APP_DIR = Path(__file__).resolve().parents[2] / 'app'
CODE_RE = re.compile(r'^([A-Z]+)-(\d{4})$')
AREAS = (
    'GEN AUTH USR APP EVT CAT CV JOB CYC RPT FDB ADM'.split()
)  # plan 0019 ## Backend


def _request() -> Request:
    return Request({'type': 'http', 'method': 'GET', 'headers': []})


def _body(response) -> dict:
    return json.loads(response.body)


# --- the registry -----------------------------------------------------------


def test_every_code_is_an_area_and_four_digits():
    for member in ErrorCode:
        match = CODE_RE.match(member.value)
        assert match, member
        assert match.group(1) in AREAS, member
        assert member.name.startswith(f'{match.group(1)}_'), member


def test_codes_are_unique():
    values = [member.value for member in ErrorCode]
    assert len(values) == len(set(values))


def test_each_area_counts_from_1001_upwards_in_enum_order():
    numbers: dict[str, list[int]] = defaultdict(list)
    for member in ErrorCode:
        area, number = member.value.split('-')
        numbers[area].append(int(number))
    for area, seen in numbers.items():
        assert seen[0] == 1001, area
        assert seen == sorted(seen), area
        assert len(seen) == len(set(seen)), area


# --- the registry IS the catalog ---------------------------------------------


def test_catalog_lists_every_code_in_enum_order():
    assert [row.code for row in catalog_rows()] == [
        member.value for member in ErrorCode
    ]


def test_catalog_area_table_counts_every_code():
    areas = catalog_areas()
    assert list(areas) == AREAS
    for area, count in areas.items():
        assert count == sum(
            1 for m in ErrorCode if m.value.startswith(f'{area}-')
        ), area


def test_every_catalog_row_has_status_detail_and_description():
    for row in catalog_rows():
        assert row.status == 'other' or re.fullmatch(r'[1-5]\d\d', row.status)
        assert row.detail, row.code
        assert row.description, row.code
        assert row.raised_by, row.code


def test_a_value_in_a_message_is_a_param_of_its_code():
    """``<name>`` in the English message ⇔ ``name`` in params."""
    for row in catalog_rows():
        named = set(re.findall(r'<([a-z_]+)>', row.detail))
        assert named == set(row.params), row.code


# Codes no longer raised since ADR-0026 (the password sign-in and the
# membership confirm are gone): kept in the registry and the catalog, never
# reused, never raised. The catalog marks each "not raised since ADR-0026".
RETIRED = {'AUTH-1004', 'AUTH-1009', 'AUTH-1010', 'RPT-1002'}
NOT_RAISED = 'not raised since ADR-0026'


def test_retired_codes_are_marked_in_the_catalog():
    marked = {
        row.code for row in catalog_rows() if NOT_RAISED in row.raised_by
    }
    assert marked == RETIRED


def _string_constants() -> set[str]:
    found: set[str] = set()
    for path in APP_DIR.rglob('*.py'):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                found.add(node.value)
    return found


def test_every_fixed_catalog_message_is_the_apis_own_text():
    """A message with no value is written, word for word, in ``app/``: the
    catalog never paraphrases what the API sends."""
    constants = _string_constants()
    framework_words = {'GEN-1002', 'GEN-1007'}  # Starlette's/FastAPI's own
    for row in catalog_rows():
        if row.params or row.detail.startswith('('):
            continue
        if row.code in framework_words or row.code in RETIRED:
            continue
        assert row.detail in constants, row.code


# --- params: what the raise sites send == what the catalog says --------------


def _dict_keys(node: ast.AST, module: ast.Module) -> set[str] | None:
    if isinstance(node, ast.Dict):
        return {
            k.value
            for k in node.keys
            if isinstance(k, ast.Constant) and isinstance(k.value, str)
        }
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        for fn in ast.walk(module):
            if isinstance(fn, ast.FunctionDef) and fn.name == node.func.id:
                for ret in ast.walk(fn):
                    if isinstance(ret, ast.Return) and ret.value is not None:
                        return _dict_keys(ret.value, module)
    return None


def _code_of(nodes: list[ast.expr]) -> str | None:
    for node in nodes:
        for sub in ast.walk(node):
            if (
                isinstance(sub, ast.Attribute)
                and isinstance(sub.value, ast.Name)
                and sub.value.id == 'ErrorCode'
            ):
                return ErrorCode[sub.attr].value
    return None


def _params_sent() -> dict[str, set[frozenset[str]]]:
    """Every code that some site in ``app/`` sends with ``params``, and the
    key sets it sends: ``X(..., ErrorCode.Y, params={...})`` calls and the
    hand-built ``{'code': ErrorCode.Y..., 'params': {...}}`` bodies."""
    sent: dict[str, set[frozenset[str]]] = defaultdict(set)
    for path in APP_DIR.rglob('*.py'):
        module = ast.parse(path.read_text())
        for node in ast.walk(module):
            if isinstance(node, ast.Call):
                params = next(
                    (k.value for k in node.keywords if k.arg == 'params'),
                    None,
                )
                if params is None or (
                    isinstance(params, ast.Constant) and params.value is None
                ):
                    continue
                code = _code_of(
                    list(node.args)
                    + [k.value for k in node.keywords if k.arg != 'params']
                )
                keys = _dict_keys(params, module)
                if code and keys is not None:
                    sent[code].add(frozenset(keys))
            elif isinstance(node, ast.Dict):
                entries = {
                    k.value: v
                    for k, v in zip(node.keys, node.values, strict=True)
                    if isinstance(k, ast.Constant)
                }
                if 'code' in entries and 'params' in entries:
                    code = _code_of([entries['code']])
                    keys = _dict_keys(entries['params'], module)
                    if code and keys is not None:
                        sent[code].add(frozenset(keys))
    return sent


def test_each_params_code_sends_exactly_its_catalog_params():
    sent = _params_sent()
    expected = {
        row.code: row.params
        for row in catalog_rows()
        if row.params and row.code not in RETIRED
    }
    assert set(sent) == set(expected)
    for code, key_sets in sent.items():
        assert key_sets == {expected[code]}, code


def _used_members() -> set[str]:
    used: set[str] = set()
    for path in APP_DIR.rglob('*.py'):
        if path.name == 'error_codes.py':
            continue
        used.update(re.findall(r'ErrorCode\.([A-Z0-9_]+)', path.read_text()))
    return used


def test_every_code_is_raised_somewhere():
    """No dead code in the registry: each member is used in ``app/``,
    except the retired ones."""
    live = {m.name for m in ErrorCode if m.value not in RETIRED}
    assert live <= _used_members()


def test_a_retired_code_is_never_raised():
    retired = {m.name for m in ErrorCode if m.value in RETIRED}
    assert len(retired) == len(RETIRED)
    assert not retired & _used_members()


# --- the ADR-0024 codes, renumbered, words kept -------------------------------


@pytest.mark.parametrize(
    ('refusal', 'code', 'status', 'detail'),
    [
        (
            exceptions.EmailUnverified(),
            'AUTH-1005',
            403,
            'Verify your email on Borderless first',
        ),
        (
            exceptions.BindingConflict(
                'This email belongs to an applika account linked to another '
                'Borderless account. Sign in with that Borderless account, '
                'or contact support'
            ),
            'AUTH-1006',
            409,
            None,
        ),
        (
            exceptions.EmailAmbiguous(
                'More than one applika account uses this email; contact support'
            ),
            'AUTH-1007',
            409,
            None,
        ),
        (exceptions.EmailUnusable(), 'AUTH-1008', 422, None),
        (
            exceptions.BadgeRequired(),
            'RPT-1001',
            403,
            'Reports are for Borderless BASE and PSP members',
        ),
    ],
)
def test_the_named_codes_are_renumbered(refusal, code, status, detail):
    assert refusal.code == code
    assert refusal.status_code == status
    assert catalog()[code].status == str(status)
    assert refusal.message == (detail or catalog()[code].detail)


def test_the_borderless_openid_connect_codes():
    """ADR-0026 §13: AUTH-1046 to AUTH-1050. The three callback-only codes
    travel as ``?error=`` (status ``307``); AUTH-1049 is the refused web
    refresh (401) and AUTH-1050 the locked member route (403)."""
    rows = catalog()
    assert [rows[f'AUTH-{n}'].status for n in range(1046, 1051)] == [
        '307',
        '307',
        '307',
        '401',
        '403',
    ]
    locked = exceptions.MembershipLocked()
    assert (locked.code, locked.status_code) == ('AUTH-1050', 403)
    assert locked.message == rows['AUTH-1050'].detail == (
        'Your Borderless sign-in has ended. Sign in again on the applika '
        'website to use member features'
    )
    assert rows['AUTH-1049'].detail == (
        'Your Borderless sign-in has ended. Sign in again with Borderless'
    )
    assert exceptions.SessionServiceUnavailable().code == 'AUTH-1003'


def test_the_callback_only_words_say_what_happened_and_what_to_do():
    """AC21: the web shows ``errors.<code>``, whose en words are the
    catalog's; each callback-only code and the binding conflict name the
    failure and the remedy."""
    rows = catalog()
    assert [
        complete_login.LOGIN_EXPIRED,
        complete_login.LOGIN_DENIED,
        complete_login.LOGIN_UNVERIFIABLE,
        sign_in.BOUND_TO_ANOTHER,
    ] == [
        rows['AUTH-1046'].detail,
        rows['AUTH-1047'].detail,
        rows['AUTH-1048'].detail,
        rows['AUTH-1006'].detail,
    ]
    assert rows['AUTH-1047'].detail == (
        'Borderless did not complete the sign-in. Try signing in again'
    )
    assert rows['AUTH-1006'].detail == (
        'This email belongs to an applika account linked to another '
        'Borderless account. Sign in with that Borderless account, or '
        'contact support'
    )


def test_a_domain_exception_cannot_be_built_without_a_code():
    with pytest.raises(TypeError):
        exceptions.ResourceNotFound('Nope')  # ty: ignore[missing-argument]


# --- every handler: code always, params exactly when set ---------------------

HANDLED = [
    (exceptions.ResourceNotFound, handlers._resource_not_found_handler, 404),
    (exceptions.ResourceConflict, handlers._resource_conflict_handler, 409),
    (
        exceptions.ApplicationFinalized,
        handlers._application_finalized_handler,
        409,
    ),
    (
        exceptions.BusinessRuleViolation,
        handlers._business_rule_violation_handler,
        422,
    ),
    (exceptions.InvalidDate, handlers._invalid_date_handler, 422),
    (exceptions.ForbiddenAccess, handlers._forbidden_access_handler, 403),
    (exceptions.PdfRenderFailed, handlers._pdf_render_failed_handler, 500),
    (exceptions.CVExportFailed, handlers._cv_export_failed_handler, 500),
    (
        exceptions.ServiceUnavailable,
        handlers._service_unavailable_handler,
        503,
    ),
    (exceptions.InvalidSession, handlers._invalid_session_handler, 401),
    (exceptions.InvalidRequest, handlers._invalid_request_handler, 400),
]


@pytest.mark.parametrize(('exc_type', 'handler', 'status'), HANDLED)
async def test_handler_adds_code_and_no_params_key(exc_type, handler, status):
    response = await handler(
        _request(), exc_type('Some words', ErrorCode.APP_DRAFT_NOT_FOUND)
    )
    assert response.status_code == status
    assert list(_body(response).items()) == [
        ('detail', 'Some words'),
        ('code', 'APP-1009'),
    ]


@pytest.mark.parametrize(('exc_type', 'handler', 'status'), HANDLED)
async def test_handler_adds_params_after_code(exc_type, handler, status):
    exc = exc_type('x 3', ErrorCode.CV_BASE_CV_LIMIT, {'max': 3})
    response = await handler(_request(), exc)
    assert list(_body(response).items()) == [
        ('detail', 'x 3'),
        ('code', 'CV-1002'),
        ('params', {'max': 3}),
    ]


async def test_session_service_handler_keeps_retry_after():
    response = await handlers._session_service_unavailable_handler(
        _request(), exceptions.SessionServiceUnavailable()
    )
    assert response.status_code == 503
    assert response.headers['retry-after'] == '5'
    assert _body(response) == {
        'detail': 'Session service unavailable',
        'code': 'AUTH-1003',
    }


async def test_oauth_handler_keeps_error_first():
    response = await handlers._oauth_error_handler(
        _request(),
        exceptions.OAuthError(
            'slow_down', 'Polling too fast', ErrorCode.AUTH_DEVICE_SLOW_DOWN
        ),
    )
    assert response.status_code == 400
    assert list(_body(response).items()) == [
        ('error', 'slow_down'),
        ('detail', 'Polling too fast'),
        ('code', 'AUTH-1037'),
    ]


class _Waited(exceptions.CodedRefusal):
    status_code = 429


async def test_coded_refusal_handler_sends_params_and_headers():
    response = await handlers._coded_refusal_handler(
        _request(),
        _Waited(
            'Too many requests. Try again in 9 seconds.',
            ErrorCode.GEN_RATE_LIMITED,
            headers={'Retry-After': '9'},
            params={'seconds': 9},
        ),
    )
    assert response.status_code == 429
    assert response.headers['retry-after'] == '9'
    assert list(_body(response).items()) == [
        ('detail', 'Too many requests. Try again in 9 seconds.'),
        ('code', 'GEN-1004'),
        ('params', {'seconds': 9}),
    ]


async def test_coded_refusal_handler_answers_the_membership_lock():
    response = await handlers._coded_refusal_handler(
        _request(), exceptions.MembershipLocked()
    )
    assert response.status_code == 403
    assert _body(response) == {
        'detail': (
            'Your Borderless sign-in has ended. Sign in again on the '
            'applika website to use member features'
        ),
        'code': 'AUTH-1050',
    }


async def test_coded_refusal_handler_without_params():
    response = await handlers._coded_refusal_handler(
        _request(), exceptions.BadgeRequired()
    )
    assert _body(response) == {
        'detail': 'Reports are for Borderless BASE and PSP members',
        'code': 'RPT-1001',
    }


async def test_not_implemented_handler():
    response = await handlers._not_implemented_handler(
        _request(), NotImplementedError()
    )
    assert response.status_code == 501
    assert _body(response) == {
        'detail': 'This endpoint has been defined but not yet implemented',
        'code': 'GEN-1006',
    }


async def test_unhandled_exception_handler_answers_json():
    response = await handlers._unhandled_exception_handler(
        _request(), RuntimeError('secret detail never shown')
    )
    assert response.status_code == 500
    assert _body(response) == {
        'detail': 'Internal Server Error',
        'code': 'GEN-1005',
    }


@pytest.mark.parametrize(
    ('status', 'code'),
    [
        (400, 'GEN-1007'),
        (404, 'GEN-1001'),
        (405, 'GEN-1002'),
        (418, 'GEN-1008'),
    ],
)
async def test_framework_http_errors_get_their_code(status, code):
    from starlette.exceptions import HTTPException

    response = await handlers._http_exception_handler(
        _request(),
        HTTPException(status_code=status, headers={'Allow': 'GET'}),
    )
    assert response.status_code == status
    assert response.headers['allow'] == 'GET'
    assert _body(response)['code'] == code


async def test_framework_bodyless_status_has_no_body():
    from starlette.exceptions import HTTPException

    response = await handlers._http_exception_handler(
        _request(), HTTPException(status_code=304)
    )
    assert response.status_code == 304
    assert response.body == b''
