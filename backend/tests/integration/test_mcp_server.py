"""The hosted MCP server, ``POST /mcp`` (ADR-0028, PRD 0023).

Real Postgres and Redis, the app's own routing, middleware and error
handlers, and the SDK session manager running (``mcp_runtime.run()``, what
the app's lifespan enters). MCP tokens are minted at run time through
``CreateMcpTokenUseCase`` and never written to a file. One Redis container
serves the whole module (``redis_container`` below).

Each of the 25 CLI tools: its happy path with the REST body, another user's row
as not found, and its absence and refusal outside its scope. Then the
token's life: 401 ``AUTH-1051`` + ``WWW-Authenticate``, 503 fail closed,
429, the 90-day slide, Devices, revoke, account delete, Borderless grant
end, refresh, the archived-cycle refusal and the ``cvs`` gate.
"""

import base64
import copy
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
import redis.asyncio as redis
from httpx import ASGITransport, AsyncClient
from jsonschema import Draft202012Validator
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from testcontainers.redis import RedisContainer

from app.application.dto.application import (
    ApplicationCompanyInputDTO,
    ApplicationCreateDTO,
)
from app.application.dto.base_cv import BaseCVCreateDTO
from app.application.dto.tailored_cv import TailoredCVCreateDTO
from app.application.dto.timeline_event import CreateTimelineEventDTO
from app.application.services.session_store import (
    SessionStore,
    id_key,
    mcp_key,
    mcp_token_hash,
)
from app.application.use_cases.applications.create_application import (
    CreateApplicationUseCase,
)
from app.application.use_cases.base_cvs.create import CreateBaseCVUseCase
from app.application.use_cases.borderless.end_grant import (
    EndBorderlessGrantUseCase,
)
from app.application.use_cases.tailored_cvs.create import (
    CreateTailoredCVUseCase,
)
from app.application.use_cases.timeline_events.create import (
    CreateTimelineEventUseCase,
)
from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs
from app.core.enums import EventType, InterviewType
from app.domain.models import (
    ApplicationModel,
    CompanyModel,
    CycleModel,
    FeatureBetaUserModel,
    UserSessionModel,
)
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)
from app.main import app as main_app
from app.presentation.dependencies import resolve_tailoring
from app.presentation.mcp.deps import deps
from app.presentation.mcp.server import mcp_runtime, registry
from app.presentation.mcp.tools.guide import TIP, TIP_KEY
from app.presentation.schemas.base_cv import BaseCVCreate
from tests.base_db_setup import base_data
from tests.conftest import MemoryAccessStore
from tests.features_seed import enrol, seed_cvs_feature
from tests.integration.conftest import SECOND_USER_ID
from tests.integration.mcp_client import (
    MCP_HEADERS,
    call,
    mcp_app,
    result,
    rpc,
    tool_names,
)
from tests.integration.test_tailored_cv_api import base_cv_payload
from tests.sessions_seed import live_access_token, open_mcp_token, open_session

USER = base_data()['user']
PLATFORM_ID = base_data()['plat_linkedin'].id
COMPANY_ID = base_data()['company_acme'].id
TOKEN_INVALID = (
    'MCP token invalid, revoked or expired. '
    'Create a new one in Applika: Profile > MCP.'
)
NOT_FOUND = {'detail': 'Not Found', 'code': 'GEN-1001'}
NINETY_DAYS = 90 * 86400
TIP_BLOCK = {'type': 'text', 'text': TIP}

READ = {
    'guide',
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


@pytest.fixture(scope='module')
def redis_container():
    """One Redis for the module: ``redis_client`` flushes it per test."""
    container = RedisContainer('redis:7.2-alpine')
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture
async def mcp(async_engine, db_session, redis_client, job_queue):
    async with mcp_app(async_engine, redis_client, job_queue) as client:
        yield client


@dataclass(frozen=True)
class Rows:
    application_id: int
    event_id: int
    cv_id: int | None = None


async def _seed(
    async_engine: AsyncEngine, user_id: int, with_cv: bool = False
) -> Rows:
    """An open application with an interview; with ``with_cv``, a master CV
    and its copy on that application. Through the app's own use cases."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        app_repo = ApplicationRepository(session)
        application = await CreateApplicationUseCase(
            app_repo, PlatformRepository(session), CompanyRepository(session)
        ).execute(
            ApplicationCreateDTO(
                company=ApplicationCompanyInputDTO(
                    name=f'Company {user_id}', url=None
                ),
                role='Backend Engineer',
                mode='active',
                platform_id=PLATFORM_ID,
                application_date=date(2025, 12, 1),
                link_to_job=None,
                user_id=user_id,
            )
        )
        event = await CreateTimelineEventUseCase(
            app_repo, TimelineEventRepository(session)
        ).execute(
            CreateTimelineEventDTO(
                user_id=user_id,
                application_id=application.id,
                event_type=EventType.INTERVIEW,
                interview_type=InterviewType.TECHNICAL,
                event_date=date(2025, 12, 2),
            )
        )
        cv_id = None
        if with_cv:
            cv = await CreateBaseCVUseCase(BaseCVRepository(session)).execute(
                BaseCVCreateDTO(
                    user_id=user_id,
                    **BaseCVCreate.model_validate(
                        base_cv_payload()
                    ).model_dump(),
                )
            )
            await CreateTailoredCVUseCase(
                TailoredCVRepository(session),
                BaseCVRepository(session),
                app_repo,
                resolve_tailoring,
            ).execute(
                TailoredCVCreateDTO(
                    user_id=user_id,
                    application_id=application.id,
                    base_cv_id=cv.id,
                )
            )
            cv_id = cv.id
    return Rows(application.id, event.id, cv_id)


async def _row(async_engine: AsyncEngine, session_id: int) -> UserSessionModel:
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        row = await session.get(UserSessionModel, session_id)
        assert row is not None
        return row


async def _execute(async_engine: AsyncEngine, statement) -> None:
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        await session.execute(statement)
        await session.commit()


def _error(answer: dict[str, Any]) -> dict[str, Any]:
    assert answer['isError'] is True, answer
    assert answer['content'][-1] == TIP_BLOCK, answer
    body = answer['structuredContent']
    text = answer['content'][0]['text']
    assert text.endswith(f' ({body["code"]})'), text
    if isinstance(body['detail'], str):
        assert text == f'{body["detail"]} ({body["code"]})'
    return body


def _ok(answer: dict[str, Any]) -> Any:
    assert answer['isError'] is False, answer
    assert answer['content'][-1] == TIP_BLOCK, answer
    structured = answer['structuredContent']
    text = json.loads(answer['content'][0]['text'])
    expected = text if isinstance(text, dict) else {'result': text}
    assert structured == expected
    return text


def _validates_output(name: str, answer: dict[str, Any]) -> None:
    tool = registry.get(name)
    assert tool is not None and tool.output_schema is not None
    Draft202012Validator(tool.output_schema).validate(
        answer['structuredContent']
    )


# ---------------------------------------------------------------------------
# initialize, tools/list
# ---------------------------------------------------------------------------


async def test_initialize_names_the_server_and_gives_the_instructions(
    mcp: AsyncClient, mcp_token_read
):
    answer = await result(
        mcp,
        mcp_token_read.token,
        'initialize',
        {
            'protocolVersion': '2025-06-18',
            'capabilities': {},
            'clientInfo': {'name': 'test', 'version': '1'},
        },
    )
    assert answer['serverInfo']['name'] == 'applika'
    assert 'tools' in answer['capabilities']
    instructions = answer['instructions']
    assert instructions.startswith('# Applika MCP server')
    assert 'whoami' in instructions
    # No CV part without the feature; the scope note names what is missing.
    assert '## 8. CVs' not in instructions
    assert 'Scope: `read`.' in instructions
    assert USER.email not in instructions


async def test_initialize_shows_the_cv_part_to_a_cvs_user(
    mcp: AsyncClient, mcp_token_full, cvs_beta
):
    answer = await result(
        mcp,
        mcp_token_full.token,
        'initialize',
        {
            'protocolVersion': '2025-06-18',
            'capabilities': {},
            'clientInfo': {'name': 'test', 'version': '1'},
        },
    )
    assert '## 8. CVs' in answer['instructions']
    assert 'Scope: `read`, `write`, `delete`.' in answer['instructions']


@pytest.mark.parametrize(
    ('scope', 'with_cvs', 'expected'),
    [
        (('read',), False, READ),
        (('read', 'write'), False, READ | WRITE),
        (('read', 'write', 'delete'), False, READ | WRITE | DELETE),
        (('read',), True, READ | CV_READ),
        (('read', 'write'), True, READ | WRITE | CV_READ | CV_WRITE),
        (
            ('read', 'write', 'delete'),
            True,
            READ | WRITE | DELETE | CV_READ | CV_WRITE | CV_DELETE,
        ),
    ],
)
async def test_tools_list_follows_the_scope_and_cvs(
    mcp: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    scope,
    with_cvs,
    expected,
):
    _, token = await open_mcp_token(async_engine, redis_client, USER.id, scope)
    if with_cvs:
        await enrol(db_session, USER.id, await seed_cvs_feature(db_session))
    listed = await result(mcp, token, 'tools/list')
    assert {tool['name'] for tool in listed['tools']} == expected
    for tool in listed['tools']:
        hints = tool['annotations']
        name = tool['name']
        if name in READ | CV_READ:
            assert hints['readOnlyHint'] is True, name
        if name in DELETE | CV_DELETE:
            assert hints['destructiveHint'] is True, name
            assert hints['readOnlyHint'] is False, name
        if name in WRITE | CV_WRITE:
            assert hints['destructiveHint'] is False, name


async def test_each_tool_outside_its_scope_is_absent_and_refused(
    mcp: AsyncClient, mcp_token_read, mcp_token_read_write, cvs_beta
):
    read_only = await tool_names(mcp, mcp_token_read.token)
    for name in WRITE | DELETE | CV_WRITE | CV_DELETE:
        assert name not in read_only
        body = _error(await call(mcp, mcp_token_read.token, name, {}))
        assert body['code'] == 'AUTH-1052', name
        assert body['detail'] == (
            "This MCP token's scope does not allow this tool. Create a "
            'token with more access in Applika: Profile > MCP.'
        )
    read_write = await tool_names(mcp, mcp_token_read_write.token)
    for name in DELETE | CV_DELETE:
        assert name not in read_write
        body = _error(await call(mcp, mcp_token_read_write.token, name, {}))
        assert body['code'] == 'AUTH-1052', name


async def test_an_unknown_tool_is_the_unknown_route_body(
    mcp: AsyncClient, mcp_token_full
):
    body = _error(await call(mcp, mcp_token_full.token, 'run_sql', {}))
    assert body == NOT_FOUND


async def test_invalid_arguments_are_the_rest_422(
    mcp: AsyncClient, mcp_token_full
):
    body = _error(
        await call(
            mcp,
            mcp_token_full.token,
            'get_application',
            {'application_id': 'not-an-id', 'extra': 1},
        )
    )
    assert body['code'] == 'GEN-1003'
    assert isinstance(body['detail'], list)
    assert {tuple(error['loc']) for error in body['detail']} >= {
        ('application_id',),
        ('extra',),
    }


INITIALIZE = {
    'protocolVersion': '2025-06-18',
    'capabilities': {},
    'clientInfo': {'name': 'test', 'version': '1'},
}


async def test_guide_answers_the_instructions_initialize_gives(
    mcp: AsyncClient, mcp_token_read
):
    first = await result(mcp, mcp_token_read.token, 'initialize', INITIALIZE)
    answer = await call(mcp, mcp_token_read.token, 'guide')
    assert answer['isError'] is False
    assert answer['content'] == [
        {'type': 'text', 'text': first['instructions']}
    ]
    assert 'Scope: `read`.' in answer['content'][0]['text']
    assert '## 8. CVs' not in answer['content'][0]['text']


async def test_guide_shows_the_cv_part_and_the_full_scope(
    mcp: AsyncClient, mcp_token_full, cvs_beta
):
    answer = await call(mcp, mcp_token_full.token, 'guide')
    text = answer['content'][0]['text']
    assert '## 8. CVs' in text
    assert 'Scope: `read`, `write`, `delete`.' in text
    assert USER.email not in text


async def test_every_other_tool_ends_its_content_with_the_guide_tip(
    mcp: AsyncClient, mcp_token_read
):
    meta = {TIP_KEY: TIP}
    whoami = await call(mcp, mcp_token_read.token, 'whoami')
    assert [block['type'] for block in whoami['content']] == ['text', 'text']
    assert whoami['content'][-1] == TIP_BLOCK
    assert whoami['_meta'] == meta
    _ok(whoami)
    refused = await call(mcp, mcp_token_read.token, 'create_application', {})
    assert refused['content'][-1] == TIP_BLOCK
    assert refused['_meta'] == meta
    assert _error(refused)['code'] == 'AUTH-1052'
    unknown = await call(mcp, mcp_token_read.token, 'run_sql', {})
    assert unknown['content'][-1] == TIP_BLOCK
    assert unknown['_meta'] == meta
    guide = await call(mcp, mcp_token_read.token, 'guide')
    assert len(guide['content']) == 1
    assert '_meta' not in guide


# ---------------------------------------------------------------------------
# read tools: the REST body
# ---------------------------------------------------------------------------


async def test_whoami(mcp: AsyncClient, mcp_token_read):
    answer = await call(mcp, mcp_token_read.token, 'whoami')
    assert _ok(answer) == {
        'id': str(USER.id),
        'username': USER.username,
        'name': None,
        'email': USER.email,
    }
    _validates_output('whoami', answer)


async def test_lookups_are_the_rest_lists(
    mcp: AsyncClient, async_client: AsyncClient, mcp_token_read, async_engine
):
    await _seed(async_engine, USER.id)
    for name, path, args in (
        ('list_platforms', '/platforms', {}),
        ('list_platforms', '/platforms?name=link', {'name': 'link'}),
        ('search_companies', '/companies', {}),
        ('search_companies', '/companies?name=acme', {'name': 'acme'}),
    ):
        answer = await call(mcp, mcp_token_read.token, name, args)
        rest = await async_client.get(path)
        assert rest.status_code == 200
        assert _ok(answer) == rest.json(), name
        assert rest.json(), name
        _validates_output(name, answer)


async def test_list_and_get_applications_and_timeline(
    mcp: AsyncClient, async_client: AsyncClient, mcp_token_read, async_engine
):
    mine = await _seed(async_engine, USER.id)
    answer = await call(mcp, mcp_token_read.token, 'list_applications')
    rest = await async_client.get('/applications')
    assert _ok(answer) == rest.json()
    _validates_output('list_applications', answer)

    one = await call(
        mcp,
        mcp_token_read.token,
        'get_application',
        {'application_id': str(mine.application_id)},
    )
    assert _ok(one) == rest.json()[0]
    _validates_output('get_application', one)

    timeline = await call(
        mcp,
        mcp_token_read.token,
        'list_timeline',
        {'application_id': str(mine.application_id)},
    )
    rest_timeline = await async_client.get(
        f'/applications/{mine.application_id}/timeline'
    )
    assert _ok(timeline) == rest_timeline.json()
    assert len(rest_timeline.json()) == 1
    _validates_output('list_timeline', timeline)


async def test_list_applications_filters_as_the_cli(
    mcp: AsyncClient, mcp_token_read_write, async_engine
):
    token = mcp_token_read_write.token
    await _seed(async_engine, USER.id)
    created = _ok(
        await call(
            mcp,
            token,
            'create_application',
            {
                'company': {'name': 'Globex', 'url': None},
                'role': 'Data Analyst',
                'mode': 'passive',
                'platform_id': str(PLATFORM_ID),
                'application_date': '2026-01-10',
            },
        )
    )

    async def ids(**filters: Any) -> list[str]:
        listed = _ok(await call(mcp, token, 'list_applications', filters))
        return [item['id'] for item in listed]

    assert (await ids(search='GLOBEX')) == [created['id']]
    assert (await ids(mode='passive')) == [created['id']]
    assert len(await ids(mode='all')) == 2
    assert (await ids(from_date='2026-01-10', to_date='2026-01-10')) == [
        created['id']
    ]
    assert len(await ids(platform='linkedin')) == 2
    assert (await ids(status='finalized')) == []
    assert len(await ids(status='active')) == 2
    unknown = _error(
        await call(mcp, token, 'list_applications', {'platform': 'Monster'})
    )
    assert unknown == {'detail': 'Platform not found', 'code': 'CAT-1002'}


# ---------------------------------------------------------------------------
# write tools
# ---------------------------------------------------------------------------


async def test_create_and_edit_an_application(
    mcp: AsyncClient, async_client: AsyncClient, mcp_token_read_write
):
    token = mcp_token_read_write.token
    created_answer = await call(
        mcp,
        token,
        'create_application',
        {
            'company': str(COMPANY_ID),
            'role': 'Platform Engineer',
            'mode': 'active',
            'platform_id': str(PLATFORM_ID),
            'application_date': '2026-01-05',
            'observation': 'Referred by Ana',
            'expected_salary': 9000,
            'currency': 'USD',
            'salary_period': 'monthly',
            'job_description': 'Build the platform.',
        },
    )
    created = _ok(created_answer)
    _validates_output('create_application', created_answer)
    assert created['role'] == 'Platform Engineer'
    assert created['company_id'] == str(COMPANY_ID)

    edited_answer = await call(
        mcp,
        token,
        'edit_application',
        {
            'application_id': created['id'],
            'role': 'Staff Platform Engineer',
            'clear': ['salary', 'observation'],
        },
    )
    edited = _ok(edited_answer)
    _validates_output('edit_application', edited_answer)
    assert edited['role'] == 'Staff Platform Engineer'
    # Kept: what was not sent. Cleared: what was named. Sticky: the posting.
    assert edited['company_id'] == str(COMPANY_ID)
    assert edited['application_date'] == '2026-01-05'
    assert edited['observation'] is None
    assert edited['expected_salary'] is None
    assert edited['currency'] is None
    assert edited['job_description'] == 'Build the platform.'
    rest = await async_client.get('/applications')
    assert rest.json() == [edited]

    nulled = _ok(
        await call(
            mcp,
            token,
            'edit_application',
            {'application_id': created['id'], 'job_description': None},
        )
    )
    assert nulled['job_description'] is None

    refused = _error(
        await call(
            mcp,
            token,
            'edit_application',
            {'application_id': created['id'], 'mode': 'sometimes'},
        )
    )
    assert refused['code'] == 'GEN-1003'
    assert refused['detail'][0]['loc'] == ['mode']


async def test_finalize_reopen_and_the_outcome_close(
    mcp: AsyncClient, mcp_token_read_write, async_engine
):
    token = mcp_token_read_write.token
    mine = await _seed(async_engine, USER.id)
    target = {'application_id': str(mine.application_id)}

    closed_answer = await call(mcp, token, 'finalize_application', target)
    closed = _ok(closed_answer)
    _validates_output('finalize_application', closed_answer)
    assert closed['finalized'] is True
    # Idempotent, as the web's plain close.
    assert _ok(await call(mcp, token, 'finalize_application', target))[
        'finalized'
    ]

    reopened_answer = await call(mcp, token, 'reopen_application', target)
    _validates_output('reopen_application', reopened_answer)
    assert _ok(reopened_answer)['finalized'] is False

    offer = _ok(
        await call(
            mcp,
            token,
            'finalize_application',
            {
                **target,
                'outcome': 'offer',
                'salary_amount': '8000.00',
                'salary_currency': 'USD',
                'salary_period': 'monthly',
            },
        )
    )
    assert offer['finalized'] is True
    # The answer is REST's Application: no CLI-only field (ADR-0028).
    assert 'salary_offer' not in offer
    assert 'feedback' not in offer
    assert offer['last_step'] is not None

    missing = _error(
        await call(
            mcp, token, 'finalize_application', {**target, 'outcome': 'offer'}
        )
    )
    assert missing['code'] == 'GEN-1003'


async def test_timeline_writes(
    mcp: AsyncClient,
    async_client: AsyncClient,
    mcp_token_full,
    async_engine,
):
    token = mcp_token_full.token
    mine = await _seed(async_engine, USER.id)
    app_id = str(mine.application_id)

    interview_answer = await call(
        mcp,
        token,
        'add_timeline_event',
        {
            'application_id': app_id,
            'event_type': 'interview',
            'interview_type': 'cultural',
            'event_date': '2025-12-05',
            'start_time': '10:00',
            'end_time': '11:00',
            'timezone': 'Europe/Lisbon',
        },
    )
    interview = _ok(interview_answer)
    _validates_output('add_timeline_event', interview_answer)
    assert interview['event_type'] == 'interview'

    edited_answer = await call(
        mcp,
        token,
        'edit_timeline_event',
        {
            'application_id': app_id,
            'event_id': interview['id'],
            'observation': 'Went well',
        },
    )
    edited = _ok(edited_answer)
    _validates_output('edit_timeline_event', edited_answer)
    # Merged: the schedule and the type stay, the note is added.
    assert edited['observation'] == 'Went well'
    assert edited['interview_type'] == 'cultural'
    assert edited['start_time'] == '10:00:00'

    retyped = _ok(
        await call(
            mcp,
            token,
            'edit_timeline_event',
            {
                'application_id': app_id,
                'event_id': interview['id'],
                'event_type': 'denied',
                'denied_reason': 'ghosted',
            },
        )
    )
    # Away from interview: the schedule and interview type are dropped.
    assert retyped['event_type'] == 'denied'
    assert retyped['denied_reason'] == 'ghosted'
    assert 'start_time' not in retyped

    kept_open = _ok(
        await call(
            mcp,
            token,
            'add_timeline_event',
            {
                'application_id': app_id,
                'event_type': 'denied',
                'event_date': '2025-12-06',
                'keep_open': True,
            },
        )
    )
    assert kept_open['event_type'] == 'denied'

    deleted_answer = await call(
        mcp,
        token,
        'delete_timeline_event',
        {'application_id': app_id, 'event_id': kept_open['id']},
    )
    assert _ok(deleted_answer) == {'deleted': True}
    _validates_output('delete_timeline_event', deleted_answer)

    # An offer without keep_open closes the application, as the CLI did.
    closing = await call(
        mcp,
        token,
        'add_timeline_event',
        {
            'application_id': app_id,
            'event_type': 'offer',
            'event_date': '2025-12-07',
            'salary_amount': '7000.00',
            'salary_currency': 'EUR',
            'salary_period': 'annually',
        },
    )
    _validates_output('add_timeline_event', closing)
    application = _ok(closing)
    assert application['id'] == app_id
    assert application['finalized'] is True
    events = (await async_client.get(f'/applications/{app_id}/timeline')).json()
    assert [event['event_type'] for event in events][-1] == 'offer'

    # A closed application refuses timeline writes with the web's 409.
    refused = _error(
        await call(
            mcp,
            token,
            'edit_timeline_event',
            {
                'application_id': app_id,
                'event_id': str(mine.event_id),
                'observation': 'late note',
            },
        )
    )
    assert refused == {
        'detail': 'Reopen the application to edit it (it is currently closed)',
        'code': 'APP-1003',
    }


# ---------------------------------------------------------------------------
# CV tools
# ---------------------------------------------------------------------------


async def test_master_cv_tools(
    mcp: AsyncClient,
    async_client: AsyncClient,
    mcp_token_full,
    cvs_beta,
    job_queue,
):
    token = mcp_token_full.token
    payload = copy.deepcopy(base_cv_payload())
    for section in ('links', 'experience'):
        for item in payload[section]:
            item.pop('id', None)
    created_answer = await call(mcp, token, 'create_cv', payload)
    created = _ok(created_answer)
    _validates_output('create_cv', created_answer)
    # Missing item ids are assigned.
    assert all(item['id'] for item in created['experience'])
    assert job_queue.recomputes == [int(created['id'])]

    listed = await call(mcp, token, 'list_cvs')
    assert _ok(listed) == (await async_client.get('/base-cvs')).json()
    _validates_output('list_cvs', listed)

    got = await call(mcp, token, 'get_cv', {'cv_id': created['id']})
    rest = await async_client.get(f'/base-cvs/{created["id"]}')
    assert _ok(got) == rest.json()
    _validates_output('get_cv', got)

    edited_answer = await call(
        mcp,
        token,
        'edit_cv',
        {'cv_id': created['id'], 'headline': 'Principal Engineer'},
    )
    edited = _ok(edited_answer)
    _validates_output('edit_cv', edited_answer)
    assert edited['headline'] == 'Principal Engineer'
    assert edited['experience'] == created['experience']

    markdown = await call(mcp, token, 'download_cv', {'cv_id': created['id']})
    rest_markdown = await async_client.get(
        f'/base-cvs/{created["id"]}/markdown'
    )
    assert markdown['isError'] is False
    assert markdown['content'] == [
        {'type': 'text', 'text': rest_markdown.text},
        TIP_BLOCK,
    ]

    pdf = await call(
        mcp, token, 'download_cv', {'cv_id': created['id'], 'format': 'pdf'}
    )
    resource = pdf['content'][0]
    assert resource['type'] == 'resource'
    assert resource['resource']['mimeType'] == 'application/pdf'
    assert base64.b64decode(resource['resource']['blob']).startswith(b'%PDF')

    deleted = await call(mcp, token, 'delete_cv', {'cv_id': created['id']})
    assert _ok(deleted) == {'deleted': True}
    assert (await async_client.get('/base-cvs')).json() == []


async def test_application_cv_tools(
    mcp: AsyncClient,
    async_client: AsyncClient,
    mcp_token_full,
    cvs_beta,
    async_engine,
):
    token = mcp_token_full.token
    mine = await _seed(async_engine, USER.id, with_cv=True)
    app_id = str(mine.application_id)
    target = {'application_id': app_id}

    got = await call(mcp, token, 'get_application_cv', target)
    rest = await async_client.get(f'/applications/{app_id}/cv')
    assert _ok(got) == rest.json()
    _validates_output('get_application_cv', got)

    edited_answer = await call(
        mcp,
        token,
        'edit_application_cv',
        {**target, 'headline': 'Tailored headline'},
    )
    edited = _ok(edited_answer)
    _validates_output('edit_application_cv', edited_answer)
    assert edited['headline'] == 'Tailored headline'
    assert edited['experience'] == rest.json()['experience']

    for name in ('download_application_cv', 'diff_application_cv'):
        markdown = await call(mcp, token, name, target)
        assert markdown['isError'] is False, name
        assert markdown['content'][0]['type'] == 'text'
        assert markdown['content'][0]['text'], name
    diff = await call(mcp, token, 'diff_application_cv', target)
    rest_diff = await async_client.get(
        f'/applications/{app_id}/cv/diff/markdown'
    )
    assert diff['content'][0]['text'] == rest_diff.text
    pdf = await call(
        mcp, token, 'download_application_cv', {**target, 'format': 'pdf'}
    )
    assert pdf['content'][0]['resource']['mimeType'] == 'application/pdf'
    diff_pdf = await call(
        mcp, token, 'diff_application_cv', {**target, 'format': 'pdf'}
    )
    assert base64.b64decode(
        diff_pdf['content'][0]['resource']['blob']
    ).startswith(b'%PDF')

    deleted = await call(mcp, token, 'delete_application_cv', target)
    assert _ok(deleted) == {'deleted': True}
    recreated_answer = await call(
        mcp,
        token,
        'create_application_cv',
        {**target, 'base_cv_id': str(mine.cv_id)},
    )
    recreated = _ok(recreated_answer)
    _validates_output('create_application_cv', recreated_answer)
    assert recreated['application_id'] == app_id

    keywords = _error(
        await call(
            mcp,
            token,
            'create_application_cv',
            {**target, 'base_cv_id': str(mine.cv_id), 'tailoring': 'keywords'},
        )
    )
    assert keywords == {
        'detail': 'Unknown tailoring option',
        'code': 'CV-1007',
    }


async def test_losing_cvs_drops_the_cv_tools_on_the_next_request(
    mcp: AsyncClient, mcp_token_full, cvs_beta, async_engine
):
    token = mcp_token_full.token
    assert CV_READ <= await tool_names(mcp, token)
    await _execute(
        async_engine,
        delete(FeatureBetaUserModel).where(
            FeatureBetaUserModel.user_id == USER.id
        ),
    )
    names = await tool_names(mcp, token)
    assert not names & (CV_READ | CV_WRITE | CV_DELETE)
    assert _error(await call(mcp, token, 'list_cvs')) == NOT_FOUND


# ---------------------------------------------------------------------------
# own rows only (ADR-0004), admins too
# ---------------------------------------------------------------------------


async def test_another_users_rows_are_not_found(
    mcp: AsyncClient,
    mcp_token_full,
    cvs_beta,
    async_engine,
    second_user,
    async_client: AsyncClient,
):
    token = mcp_token_full.token
    theirs = await _seed(async_engine, SECOND_USER_ID, with_cv=True)
    mine = await _seed(async_engine, USER.id)
    app_id = str(theirs.application_id)
    event = {'application_id': app_id, 'event_id': str(theirs.event_id)}
    app_not_found = 'APP-1001'
    cases: list[tuple[str, dict[str, Any], str]] = [
        ('get_application', {'application_id': app_id}, app_not_found),
        ('list_timeline', {'application_id': app_id}, app_not_found),
        (
            'edit_application',
            {'application_id': app_id, 'role': 'x'},
            app_not_found,
        ),
        ('finalize_application', {'application_id': app_id}, app_not_found),
        ('reopen_application', {'application_id': app_id}, app_not_found),
        (
            'add_timeline_event',
            {
                'application_id': app_id,
                'event_type': 'interview',
                'event_date': '2025-12-03',
            },
            app_not_found,
        ),
        ('edit_timeline_event', {**event, 'observation': 'x'}, app_not_found),
        ('delete_timeline_event', event, app_not_found),
        (
            'edit_timeline_event',
            {
                'application_id': str(mine.application_id),
                'event_id': str(theirs.event_id),
                'observation': 'x',
            },
            'EVT-1001',
        ),
        ('get_cv', {'cv_id': str(theirs.cv_id)}, 'CV-1001'),
        ('download_cv', {'cv_id': str(theirs.cv_id)}, 'CV-1001'),
        ('edit_cv', {'cv_id': str(theirs.cv_id), 'name': 'x'}, 'CV-1001'),
        ('delete_cv', {'cv_id': str(theirs.cv_id)}, 'CV-1001'),
        ('get_application_cv', {'application_id': app_id}, app_not_found),
        (
            'download_application_cv',
            {'application_id': app_id},
            app_not_found,
        ),
        ('diff_application_cv', {'application_id': app_id}, app_not_found),
        (
            'edit_application_cv',
            {'application_id': app_id, 'name': 'x'},
            app_not_found,
        ),
        ('delete_application_cv', {'application_id': app_id}, app_not_found),
        (
            'create_application_cv',
            {
                'application_id': str(mine.application_id),
                'base_cv_id': str(theirs.cv_id),
            },
            'CV-1001',
        ),
    ]
    # Their private company: hidden from every other user (ADR-0014).
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        company = CompanyModel(
            name='Their Secret Co',
            url='https://secret.example.com',
            is_public=False,
            created_by=SECOND_USER_ID,
        )
        session.add(company)
        await session.commit()
        their_company = company.id
    cases.append((
        'create_application',
        {
            'company': str(their_company),
            'role': 'x',
            'mode': 'active',
            'platform_id': str(PLATFORM_ID),
            'application_date': '2026-01-01',
        },
        'CAT-1001',
    ))
    for name, arguments, code in cases:
        body = _error(await call(mcp, token, name, arguments))
        assert body['code'] == code, (name, body)

    names = {
        row['name']
        for row in _ok(await call(mcp, token, 'search_companies', {}))
    }
    assert 'Their Secret Co' not in names
    # The REST answer for the same action is the same body.
    rest = await async_client.get(f'/base-cvs/{theirs.cv_id}')
    mcp_body = _error(
        await call(mcp, token, 'get_cv', {'cv_id': str(theirs.cv_id)})
    )
    assert rest.status_code == 404
    assert mcp_body == rest.json()
    # Lists show only the caller's rows.
    listed = _ok(await call(mcp, token, 'list_applications'))
    assert [item['id'] for item in listed] == [str(mine.application_id)]
    assert _ok(await call(mcp, token, 'list_cvs')) == []


async def test_an_admin_sees_only_their_own_rows_too(
    mcp: AsyncClient, async_engine, redis_client, second_user
):
    admin = base_data()['admin_user']
    theirs = await _seed(async_engine, SECOND_USER_ID)
    _, token = await open_mcp_token(async_engine, redis_client, admin.id)
    body = _error(
        await call(
            mcp,
            token,
            'get_application',
            {'application_id': str(theirs.application_id)},
        )
    )
    assert body['code'] == 'APP-1001'
    names = await tool_names(mcp, token)
    assert not {name for name in names if 'admin' in name}


# ---------------------------------------------------------------------------
# the archived cycle
# ---------------------------------------------------------------------------


async def test_an_archived_application_refuses_close_and_edit_with_the_webs_words(
    mcp: AsyncClient,
    async_client: AsyncClient,
    mcp_token_read_write,
    async_engine,
):
    mine = await _seed(async_engine, USER.id)
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        cycle = CycleModel(user_id=USER.id, name='2025')
        session.add(cycle)
        await session.commit()
        await session.execute(
            update(ApplicationModel)
            .where(ApplicationModel.id == mine.application_id)
            .values(cycle_id=cycle.id)
        )
        await session.commit()
    archived = {
        'detail': 'Cannot modify an application from an archived cycle',
        'code': 'APP-1002',
    }
    target = {'application_id': str(mine.application_id)}
    token = mcp_token_read_write.token
    for name, arguments in (
        ('finalize_application', target),
        ('reopen_application', target),
        ('edit_application', {**target, 'role': 'New role'}),
    ):
        assert _error(await call(mcp, token, name, arguments)) == archived
    rest = await async_client.post(
        f'/applications/{mine.application_id}/finalize'
    )
    assert rest.status_code == 422
    assert rest.json() == archived


# ---------------------------------------------------------------------------
# the token: 401, 503, 429
# ---------------------------------------------------------------------------


def _assert_token_refused(response) -> None:
    assert response.status_code == 401
    assert response.json() == {'detail': TOKEN_INVALID, 'code': 'AUTH-1051'}
    assert response.headers['www-authenticate'] == 'Bearer'


async def test_no_token_a_jwt_or_a_fake_token_is_401(
    mcp: AsyncClient, redis_client, db_session
):
    _assert_token_refused(await rpc(mcp, None, 'tools/list'))
    jwt = await live_access_token(redis_client, USER.id)
    _assert_token_refused(await rpc(mcp, jwt, 'tools/list'))
    _assert_token_refused(
        await rpc(mcp, 'applika_mcp_fake_' + '0' * 38, 'tools/list')
    )
    _assert_token_refused(await rpc(mcp, 'applika_mcp_short', 'tools/list'))


async def test_a_revoked_token_is_401_on_its_next_call(
    mcp: AsyncClient,
    real_client: AsyncClient,
    mcp_token_read,
    async_engine,
    redis_client,
):
    assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success
    web = await open_session(async_engine, redis_client, USER.id)
    revoked = await real_client.delete(
        f'/users/me/sessions/{mcp_token_read.session_id}',
        cookies={ACCESS_COOKIE_NAME: web.access_token},
    )
    assert revoked.status_code == 204
    _assert_token_refused(await rpc(mcp, mcp_token_read.token, 'tools/list'))
    assert not await redis_client.exists(
        mcp_key(mcp_token_hash(mcp_token_read.token))
    )
    row = await _row(async_engine, mcp_token_read.session_id)
    assert row.end_reason == 'revoked'


async def test_an_expired_token_is_401(
    mcp: AsyncClient, mcp_token_read, redis_client
):
    past = int((datetime.now(UTC) - timedelta(seconds=1)).timestamp())
    await redis_client.expireat(
        mcp_key(mcp_token_hash(mcp_token_read.token)), past
    )
    await redis_client.expireat(id_key(mcp_token_read.session_id), past)
    _assert_token_refused(await rpc(mcp, mcp_token_read.token, 'tools/list'))


async def test_a_token_whose_user_is_gone_is_401_and_ends(
    mcp: AsyncClient, mcp_token_read, async_engine, redis_client
):
    """A user row gone under a live token (its row went by CASCADE, its
    keys did not): 401 AUTH-1014 and the keys end."""
    await _execute(
        async_engine,
        delete(UserSessionModel).where(
            UserSessionModel.id == mcp_token_read.session_id
        ),
    )
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        from app.domain.models import UserModel

        user = await session.get(UserModel, USER.id)
        assert user is not None
        await session.delete(user)
        await session.commit()
    response = await rpc(mcp, mcp_token_read.token, 'tools/list')
    assert response.status_code == 401
    assert response.json() == {'detail': 'User not found', 'code': 'AUTH-1014'}
    assert response.headers['www-authenticate'] == 'Bearer'
    assert not await redis_client.exists(id_key(mcp_token_read.session_id))
    assert not await redis_client.exists(
        mcp_key(mcp_token_hash(mcp_token_read.token))
    )


async def test_redis_down_is_503_retry_after_5(
    mcp: AsyncClient, mcp_token_read
):
    down = redis.from_url(
        'redis://127.0.0.1:1/0',
        decode_responses=True,
        socket_connect_timeout=0.2,
    )
    saved = deps.redis_factory
    deps.redis_factory = lambda: down
    try:
        response = await rpc(mcp, mcp_token_read.token, 'tools/list')
    finally:
        deps.redis_factory = saved
        await down.aclose()
    assert response.status_code == 503
    assert response.json() == {
        'detail': 'Session service unavailable',
        'code': 'AUTH-1003',
    }
    assert response.headers['retry-after'] == '5'


async def test_too_many_calls_are_429_with_the_wait(
    mcp: AsyncClient, mcp_token_read, redis_client, monkeypatch
):
    monkeypatch.setattr(envs, 'RATE_LIMIT_ENABLED', True)
    monkeypatch.setattr(envs, 'RATE_LIMIT_MCP', 2)
    monkeypatch.setattr(envs, 'RATE_LIMIT_DEFAULT', 100)
    for _ in range(2):
        assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success
    refused = await rpc(mcp, mcp_token_read.token, 'tools/list')
    assert refused.status_code == 429
    body = refused.json()
    assert body['code'] == 'GEN-1004'
    seconds = body['params']['seconds']
    assert (
        body['detail'] == f'Too many requests. Try again in {seconds} seconds.'
    )
    assert refused.headers['retry-after'] == str(seconds)
    keys = await redis_client.keys('applika:ratelimit:mcp:mcp:*')
    assert len(keys) == 1
    assert mcp_token_read.token not in keys[0]


# ---------------------------------------------------------------------------
# the 90-day slide, Devices, revoke-others, account delete, grant end
# ---------------------------------------------------------------------------


async def test_a_call_slides_both_keys_and_postgres_follows_once_a_day(
    mcp: AsyncClient, mcp_token_read, redis_client, async_engine
):
    token_key = mcp_key(mcp_token_hash(mcp_token_read.token))
    hash_key = id_key(mcp_token_read.session_id)
    soon = int((datetime.now(UTC) + timedelta(days=3)).timestamp())
    await redis_client.expireat(token_key, soon)
    await redis_client.expireat(hash_key, soon)
    created = await _row(async_engine, mcp_token_read.session_id)

    assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success
    for key in (token_key, hash_key):
        assert NINETY_DAYS - 60 < await redis_client.ttl(key) <= NINETY_DAYS
    # Less than a day behind: Postgres is not written.
    assert (
        await _row(async_engine, mcp_token_read.session_id)
    ).expires_at == created.expires_at

    behind = datetime.now(UTC) + timedelta(days=80)
    await _execute(
        async_engine,
        update(UserSessionModel)
        .where(UserSessionModel.id == mcp_token_read.session_id)
        .values(expires_at=behind),
    )
    assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success
    bumped = (await _row(async_engine, mcp_token_read.session_id)).expires_at
    expected = datetime.now(UTC) + timedelta(days=90)
    assert abs((bumped - expected).total_seconds()) < 60
    assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success
    assert (
        await _row(async_engine, mcp_token_read.session_id)
    ).expires_at == bumped


async def test_one_token_in_two_apps_is_one_device_with_the_latest_use(
    mcp: AsyncClient,
    real_client: AsyncClient,
    mcp_token_read,
    async_engine,
    redis_client,
):
    for ip in ('198.51.100.1', '198.51.100.2'):
        async with AsyncClient(
            transport=ASGITransport(app=main_app, client=(ip, 5000)),
            base_url='http://test/api',
        ) as app_client:
            response = await app_client.post(
                '/mcp',
                json={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'},
                headers={
                    **MCP_HEADERS,
                    'Authorization': f'Bearer {mcp_token_read.token}',
                },
            )
            assert response.status_code == 200
    web = await open_session(async_engine, redis_client, USER.id)
    listed = await real_client.get(
        '/users/me/sessions',
        cookies={ACCESS_COOKIE_NAME: web.access_token},
    )
    mcp_rows = [row for row in listed.json() if row['client_type'] == 'mcp']
    assert len(mcp_rows) == 1
    row = mcp_rows[0]
    assert row['id'] == str(mcp_token_read.session_id)
    assert row['last_ip'] == '198.51.100.2'
    assert row['last_used_at'] is not None
    assert row['scope'] == ['read']
    assert row['sign_in_method'] == 'mcp_token'
    assert row['device_name'] == 'Test MCP'
    assert mcp_token_read.token not in listed.text


async def test_redis_decides_an_mcp_token_whose_row_lags_behind(
    mcp: AsyncClient,
    real_client: AsyncClient,
    mcp_token_read,
    mcp_token_full,
    async_engine,
    redis_client,
):
    """Postgres follows the 90-day slide at most once a day, so a live
    token's row can read past its ``expires_at``. Redis is the truth: the
    list shows it active, revoking it ends it at once, and so does sign
    out everywhere else."""
    past = datetime.now(UTC) - timedelta(hours=1)
    for token in (mcp_token_read, mcp_token_full):
        await _execute(
            async_engine,
            update(UserSessionModel)
            .where(UserSessionModel.id == token.session_id)
            .values(expires_at=past),
        )
    assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success
    # That call slid Postgres again; put it back in the lag window.
    await _execute(
        async_engine,
        update(UserSessionModel)
        .where(UserSessionModel.id == mcp_token_read.session_id)
        .values(expires_at=past),
    )
    web = await open_session(async_engine, redis_client, USER.id)
    cookies = {ACCESS_COOKIE_NAME: web.access_token}
    listed = (
        await real_client.get('/users/me/sessions', cookies=cookies)
    ).json()
    statuses = {row['id']: row['status'] for row in listed}
    assert statuses[str(mcp_token_read.session_id)] == 'active'
    assert statuses[str(mcp_token_full.session_id)] == 'active'

    revoked = await real_client.delete(
        f'/users/me/sessions/{mcp_token_read.session_id}', cookies=cookies
    )
    assert revoked.status_code == 204
    _assert_token_refused(await rpc(mcp, mcp_token_read.token, 'tools/list'))
    assert (await _row(async_engine, mcp_token_read.session_id)).end_reason == (
        'revoked'
    )

    others = await real_client.post(
        '/users/me/sessions/revoke-others', cookies=cookies
    )
    assert others.json() == {'revoked': 1}
    _assert_token_refused(await rpc(mcp, mcp_token_full.token, 'tools/list'))
    assert (await _row(async_engine, mcp_token_full.session_id)).end_reason == (
        'revoked'
    )


async def test_sign_out_everywhere_else_ends_the_mcp_token(
    mcp: AsyncClient,
    real_client: AsyncClient,
    mcp_token_read,
    async_engine,
    redis_client,
):
    web = await open_session(async_engine, redis_client, USER.id)
    response = await real_client.post(
        '/users/me/sessions/revoke-others',
        cookies={ACCESS_COOKIE_NAME: web.access_token},
    )
    assert response.json() == {'revoked': 1}
    _assert_token_refused(await rpc(mcp, mcp_token_read.token, 'tools/list'))


async def test_deleting_the_account_ends_every_mcp_token(
    mcp: AsyncClient,
    real_client: AsyncClient,
    mcp_token_read,
    mcp_token_full,
    async_engine,
    redis_client,
):
    web = await open_session(async_engine, redis_client, USER.id)
    response = await real_client.delete(
        '/users/me', cookies={ACCESS_COOKIE_NAME: web.access_token}
    )
    assert response.status_code == 204
    for token in (mcp_token_read.token, mcp_token_full.token):
        _assert_token_refused(await rpc(mcp, token, 'tools/list'))
        assert not await redis_client.exists(mcp_key(mcp_token_hash(token)))
    assert not await redis_client.exists(id_key(mcp_token_read.session_id))
    # Only the session keys went: no bare ``applika:session:`` was touched.
    assert await redis_client.keys('applika:mcp:*') == []


async def test_a_borderless_grant_end_leaves_the_mcp_token(
    mcp: AsyncClient, mcp_token_read, async_engine, redis_client
):
    web = await open_session(async_engine, redis_client, USER.id)
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        ended = await EndBorderlessGrantUseCase(
            session,
            UserSessionRepository(session),
            SessionStore(redis_client),
            MemoryAccessStore(),
        ).execute(USER.id)
    assert ended == 1
    assert (await _row(async_engine, web.session_id)).ended_at is not None
    assert (await rpc(mcp, mcp_token_read.token, 'tools/list')).is_success


async def test_refresh_never_resolves_an_mcp_session(
    real_client: AsyncClient, mcp_token_read, redis_client
):
    store = SessionStore(redis_client)
    assert await store.resolve_refresh(mcp_token_read.token) is None
    assert await store.resolve_refresh('') is None
    assert not await store.is_legacy(mcp_token_read.session_id)
    response = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: mcp_token_read.token}
    )
    assert response.status_code == 401
    assert (await store.live(mcp_token_read.session_id)).alive


# ---------------------------------------------------------------------------
# the route and the lifespan
# ---------------------------------------------------------------------------


async def test_get_and_delete_on_mcp_are_405(mcp: AsyncClient):
    for method in ('GET', 'DELETE'):
        response = await mcp.request(method, '/mcp')
        assert response.status_code == 405
        assert response.json() == {
            'detail': 'Method Not Allowed',
            'code': 'GEN-1002',
        }
        assert response.headers['allow'] == 'POST'


async def test_the_app_lifespan_runs_the_session_manager(monkeypatch):
    from app.main import lifespan
    from app.worker import broker

    async def _noop() -> None:
        return None

    monkeypatch.setattr(broker, 'start_client', _noop)
    monkeypatch.setattr(broker, 'stop_client', _noop)
    assert mcp_runtime._manager is None
    async with lifespan(main_app):
        assert mcp_runtime._manager is not None
        assert mcp_runtime._manager.stateless is True
        assert mcp_runtime._manager.json_response is True
    assert mcp_runtime._manager is None


async def test_the_token_is_never_stored_in_postgres(
    mcp_token_full, async_engine
):
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        rows = (await session.execute(select(UserSessionModel))).scalars()
        dumped = repr([vars(row) for row in rows])
    assert mcp_token_full.token not in dumped
    assert mcp_token_hash(mcp_token_full.token) not in dumped
