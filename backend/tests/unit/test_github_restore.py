"""The GitHub restore use cases (ADR-0024) on a real database.

Four outcomes: ``restored`` (binding and badges move to the old account,
the caller's sessions end, the empty caller is deleted, one commit),
``not_found``, ``has_data`` (every data table counts), ``already_bound``.
Nothing from GitHub is stored.
"""

from datetime import UTC, date, datetime
from typing import Any, cast

import pytest
from sqlalchemy import func, select

from app.application.use_cases.account_link_state import (
    AccountLinkStateUseCase,
)
from app.application.use_cases.github_restore.begin import (
    ALREADY_RESTORED,
    NOT_CONFIGURED,
    BeginGithubRestoreUseCase,
)
from app.application.use_cases.github_restore.complete import (
    CompleteGithubRestoreUseCase,
)
from app.core.enums import EventType, InterviewType, WorkMode
from app.core.exceptions import ResourceConflict, ServiceUnavailable
from app.domain.models import (
    ApplicationModel,
    BaseCVModel,
    BorderlessAccountModel,
    CycleModel,
    GithubConnectionModel,
    QuinzenalReportModel,
    TailoredCVModel,
    TimelineEventModel,
    UserBadgeModel,
    UserModel,
    UserSessionModel,
)
from app.domain.repositories.github_connection_repository import (
    GithubConnectionRepository,
)
from app.domain.repositories.user_repository import (
    DATA_TABLES,
    UserRepository,
)
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless
from tests.fake_redis import FakeRedis

OLD_ID = base_data()['user'].id
CALLER_ID = 900
GITHUB_ID = 4242


class FakeStore:
    def __init__(self) -> None:
        self.ended: list[int] = []

    async def end(self, session_id: int) -> None:
        self.ended.append(session_id)


async def _caller(db_session, *, bound: bool = True) -> None:
    db_session.add(UserModel(id=CALLER_ID, username='new', email='n@x.io'))
    await db_session.commit()
    if bound:
        await bind_borderless(db_session, CALLER_ID, borderless_id='bl-new')


async def _github_row(db_session, user_id: int = OLD_ID) -> None:
    db_session.add(
        GithubConnectionModel(
            user_id=user_id,
            github_id=GITHUB_ID,
            username='octocat',
            linked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()


def _complete(db_session, store=None) -> CompleteGithubRestoreUseCase:
    return CompleteGithubRestoreUseCase(db_session, cast(Any, store or FakeStore()))


@pytest.mark.asyncio
async def test_restored_moves_binding_and_badges_and_deletes_the_caller(
    db_session,
):
    await _caller(db_session)
    await _github_row(db_session)
    session_row = UserSessionModel(
        user_id=CALLER_ID,
        client_type='web',
        sign_in_method='borderless',
        device_name='Chrome',
        expires_at=datetime.now(UTC),
    )
    db_session.add(session_row)
    await db_session.commit()
    store = FakeStore()

    result = await _complete(db_session, store).execute(CALLER_ID, GITHUB_ID)

    assert (result.status, result.user_id) == ('restored', OLD_ID)
    assert store.ended == [session_row.id]
    db_session.expire_all()
    assert await db_session.get(UserModel, CALLER_ID) is None
    binding = await db_session.scalar(select(BorderlessAccountModel))
    assert binding.user_id == OLD_ID
    assert binding.borderless_user_id == 'bl-new'
    badges = list(await db_session.scalars(select(UserBadgeModel)))
    assert [b.user_id for b in badges] == [OLD_ID]
    # The GitHub row is the K1 seed; the restore stores nothing new.
    assert (
        await db_session.scalar(
            select(func.count()).select_from(GithubConnectionModel)
        )
        == 1
    )


@pytest.mark.asyncio
async def test_not_found_stores_nothing(db_session):
    await _caller(db_session)
    result = await _complete(db_session).execute(CALLER_ID, GITHUB_ID)
    assert result.status == 'not_found'
    assert await db_session.get(UserModel, CALLER_ID) is not None
    assert (
        await db_session.scalar(
            select(func.count()).select_from(GithubConnectionModel)
        )
        == 0
    )


@pytest.mark.asyncio
async def test_identity_of_the_caller_itself_is_not_found(db_session):
    await _caller(db_session)
    await _github_row(db_session, CALLER_ID)
    result = await _complete(db_session).execute(CALLER_ID, GITHUB_ID)
    assert result.status == 'not_found'


@pytest.mark.asyncio
async def test_already_bound_old_account_is_refused(db_session):
    await _caller(db_session)
    await _github_row(db_session)
    await bind_borderless(db_session, OLD_ID, borderless_id='bl-old')
    result = await _complete(db_session).execute(CALLER_ID, GITHUB_ID)
    assert result.status == 'already_bound'
    assert await db_session.get(UserModel, CALLER_ID) is not None


def _rows_for(table, user_id: int) -> list:
    today = date.today()
    app = ApplicationModel(
        id=7001,
        user_id=user_id,
        platform_id=1,
        application_date=today,
        role='Dev',
        mode=WorkMode.REMOTE,
        company_name='Acme',
    )
    cv = dict(
        user_id=user_id,
        name='cv',
        full_name='Ada',
        headline='Dev',
        location='Earth',
        email='a@b.c',
    )
    return {
        ApplicationModel: [app],
        CycleModel: [CycleModel(user_id=user_id, name='c')],
        QuinzenalReportModel: [
            QuinzenalReportModel(
                user_id=user_id,
                report_day=1,
                start_date=today,
                phase=1,
                mock_interviews_count=0,
                linkedin_posts_count=0,
                strategic_connections_count=0,
                biggest_win='w',
                biggest_challenge='c',
                next_fortnight_goal='g',
                submitted_at=datetime.now(UTC),
            )
        ],
        BaseCVModel: [BaseCVModel(**cv)],
        TailoredCVModel: [app, TailoredCVModel(application_id=7001, **cv)],
        TimelineEventModel: [
            app,
            TimelineEventModel(
                application_id=7001,
                user_id=user_id,
                event_type=EventType.INTERVIEW,
                interview_type=InterviewType.UNKNOWN,
                event_date=today,
            ),
        ],
    }[table]


@pytest.mark.asyncio
@pytest.mark.parametrize('table', DATA_TABLES, ids=lambda t: t.__tablename__)
async def test_has_data_for_every_data_table(db_session, table):
    """A tailored CV and a timeline event need an application of their
    own; ``DATA_TABLES`` lists each table so any one row counts."""
    await _caller(db_session)
    await _github_row(db_session)
    rows = _rows_for(table, CALLER_ID)
    for row in rows:
        db_session.add(row)
        await db_session.flush()
    await db_session.commit()
    result = await _complete(db_session).execute(CALLER_ID, GITHUB_ID)

    assert result.status == 'has_data'
    assert await db_session.get(UserModel, CALLER_ID) is not None


@pytest.mark.asyncio
async def test_draft_application_counts_as_data(db_session):
    await _caller(db_session)
    [app] = _rows_for(ApplicationModel, CALLER_ID)
    app.is_draft = True
    db_session.add(app)
    await db_session.commit()
    assert await UserRepository(db_session).holds_data(CALLER_ID) is True
    assert await UserRepository(db_session).holds_data(OLD_ID) is False


@pytest.mark.asyncio
async def test_begin_marks_prompt_seen_and_answers_the_consent_url(
    db_session, github_oauth
):
    redis = FakeRedis()
    use_case = BeginGithubRestoreUseCase(
        UserRepository(db_session),
        GithubConnectionRepository(db_session),
        AccountLinkStateUseCase(cast(Any, redis)),
        github_oauth,
    )

    url = await use_case.execute(OLD_ID)

    assert 'scope=read%3Auser' in url
    [key] = redis.data
    assert key.startswith('applika:account_link:github_restore:')
    assert url.endswith(key.rsplit(':', 1)[1])
    assert redis.data[key] == str(OLD_ID)
    db_session.expire_all()
    user = await db_session.get(UserModel, OLD_ID)
    assert user.github_restore_prompt_seen_at is not None


@pytest.mark.asyncio
async def test_begin_refuses_an_account_with_github_data(
    db_session, github_oauth
):
    await _github_row(db_session)
    use_case = BeginGithubRestoreUseCase(
        UserRepository(db_session),
        GithubConnectionRepository(db_session),
        AccountLinkStateUseCase(cast(Any, FakeRedis())),
        github_oauth,
    )
    with pytest.raises(ResourceConflict) as excinfo:
        await use_case.execute(OLD_ID)
    assert excinfo.value.message == ALREADY_RESTORED


@pytest.mark.asyncio
async def test_begin_not_configured_is_503(db_session, github_oauth):
    github_oauth.configured = False
    use_case = BeginGithubRestoreUseCase(
        UserRepository(db_session),
        GithubConnectionRepository(db_session),
        AccountLinkStateUseCase(cast(Any, FakeRedis())),
        github_oauth,
    )
    with pytest.raises(ServiceUnavailable) as excinfo:
        await use_case.execute(OLD_ID)
    assert excinfo.value.message == NOT_CONFIGURED
