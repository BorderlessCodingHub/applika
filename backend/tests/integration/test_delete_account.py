import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import UserModel
from tests import msg
from tests.base_db_setup import base_data
from tests.sessions_seed import open_session


async def test_delete_own_account_returns_204(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204, msg(204, resp.status_code)


async def test_delete_own_account_removes_user_from_db(
    async_client: AsyncClient, db_session: AsyncSession
):
    user_id = base_data()['user'].id

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    result = await db_session.execute(
        select(UserModel).where(UserModel.id == user_id)
    )
    assert result.scalar_one_or_none() is None, 'User should be deleted from db'


async def test_delete_own_account_clears_cookies(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    # Response should contain Set-Cookie headers that clear __access
    # and __refresh (max-age=0 or expires in the past)
    cookie_headers = resp.headers.get_list('set-cookie')
    cookie_names = [c.split('=')[0].strip() for c in cookie_headers]
    assert '__access' in cookie_names, 'Expected __access cookie to be cleared'
    assert '__refresh' in cookie_names, (
        'Expected __refresh cookie to be cleared'
    )


async def test_delete_own_account_cascades_applications(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Deleting a user should cascade-delete their applications
    via the database ON DELETE CASCADE constraint."""
    user_id = base_data()['user'].id
    plat_id = base_data()['plat_linkedin'].id

    # Insert an application directly via SQL to avoid session conflicts
    await db_session.execute(
        text(
            'INSERT INTO applications '
            '(id, user_id, platform_id, company_name, role, mode, '
            ' application_date, created_at) '
            "VALUES (:id, :uid, :pid, 'TestCo', 'Engineer', 'active', "
            " '2026-01-15', now())"
        ),
        {'id': 9999, 'uid': user_id, 'pid': plat_id},
    )
    await db_session.commit()

    # Delete account via API
    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    # Verify cascaded deletion
    result = await db_session.execute(
        text('SELECT id FROM applications WHERE id = 9999')
    )
    assert result.scalar_one_or_none() is None, (
        'Applications should be cascade-deleted'
    )


async def test_delete_nonexistent_user_still_returns_204(
    async_client: AsyncClient, db_session: AsyncSession
):
    """If user is somehow already gone, endpoint should still 204."""
    user_id = base_data()['user'].id

    # Manually delete the user first
    await db_session.execute(
        text('DELETE FROM users WHERE id = :uid'), {'uid': user_id}
    )
    await db_session.commit()

    # Endpoint should not fail
    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204, msg(204, resp.status_code)


async def test_delete_removes_binding_badges_and_github_row(
    async_client: AsyncClient, db_session: AsyncSession
):
    """ADR-0024: the Borderless binding, the badges and the GitHub
    identity go with the account (CASCADE)."""
    from datetime import UTC, datetime

    from app.domain.models import (
        BorderlessAccountModel,
        GithubConnectionModel,
        UserBadgeModel,
    )
    from tests.conftest import bind_borderless

    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id)
    db_session.add(
        GithubConnectionModel(
            user_id=user_id,
            github_id=99,
            username='octo',
            linked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    for model in (BorderlessAccountModel, UserBadgeModel, GithubConnectionModel):
        rows = (await db_session.execute(select(model.id))).all()
        assert rows == [], model.__tablename__


async def test_delete_account_keeps_private_catalog_rows_created_by_null(
    async_client: AsyncClient, db_session: AsyncSession
):
    """ADR-0014: a user's private companies/platforms are not deleted with
    the account - only ``created_by`` is set NULL (``ON DELETE SET NULL``),
    same as any other catalog row that outlives its creator."""
    company_resp = await async_client.post(
        '/companies',
        json={'name': 'Orphan Co', 'url': 'https://orphanco.example.com'},
    )
    assert company_resp.status_code == 201
    company_id = int(company_resp.json()['id'])

    platform_resp = await async_client.post(
        '/platforms', json={'name': 'Orphan Board'}
    )
    assert platform_resp.status_code == 201
    platform_id = int(platform_resp.json()['id'])

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    company_row = (
        (
            await db_session.execute(
                text(
                    'SELECT created_by, is_public FROM companies WHERE id = :id'
                ),
                {'id': company_id},
            )
        )
        .mappings()
        .first()
    )
    assert company_row is not None
    assert company_row['created_by'] is None
    assert company_row['is_public'] is False

    platform_row = (
        (
            await db_session.execute(
                text(
                    'SELECT created_by, is_public FROM platforms WHERE id = :id'
                ),
                {'id': platform_id},
            )
        )
        .mappings()
        .first()
    )
    assert platform_row is not None
    assert platform_row['created_by'] is None
    assert platform_row['is_public'] is False


@pytest.mark.usefixtures('cvs_beta')  # ADR-0021: drafts need "cvs"
async def test_delete_own_account_cascades_drafts(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A draft is a plain ``applications`` row, so deleting the account
    cascades it away (and its CV copy) the same as an ordinary
    application (KODI-032, T054)."""
    draft_resp = await async_client.post(
        '/applications/drafts',
        json={
            'company_id': base_data()['company_acme'].id,
            'company_name': 'Acme Corp',
            'role': 'Draft Role',
            'platform_id': base_data()['plat_linkedin'].id,
        },
    )
    assert draft_resp.status_code == 201, msg(201, draft_resp.text)
    draft_id = draft_resp.json()['id']

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    result = await db_session.execute(
        text('SELECT id FROM applications WHERE id = :id'),
        {'id': int(draft_id)},
    )
    assert result.scalar_one_or_none() is None, (
        'Draft applications should be cascade-deleted'
    )


@pytest.mark.usefixtures('jobs_beta', 'cvs_beta')  # "jobs" and "cvs"
async def test_delete_own_account_removes_job_board_rows_but_not_jobs(
    async_client: AsyncClient, db_session: AsyncSession
):
    """KODI-047: the user's fits, dismissals, saved searches and drafts from
    jobs go with the account (FK CASCADE); the shared jobs and sources stay.
    """
    from tests.integration.jobs_seed import seed_base_cv, seed_sources
    from tests.integration.test_jobs_api import add_fit, add_job

    user_id = base_data()['user'].id
    await seed_sources(db_session)
    job_id = await add_job(db_session)
    cv = await seed_base_cv(db_session, user_id, ['python'])
    await add_fit(db_session, user_id, job_id, cv, 80)
    assert (
        await async_client.put(f'/jobs/{job_id}/dismissal')
    ).status_code == 204
    search = await async_client.post(
        '/job-searches', json={'name': 'Mine', 'filters': {}}
    )
    assert search.status_code == 201, msg(201, search.text)
    draft = await async_client.post(
        '/applications/drafts/from-job', json={'job_id': str(job_id)}
    )
    assert draft.status_code == 201, msg(201, draft.text)

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    for table in (
        'job_fit_scores',
        'job_dismissals',
        'saved_job_searches',
        'applications',
    ):
        count = await db_session.scalar(
            text(f'SELECT count(*) FROM {table} WHERE user_id = :id'),
            {'id': user_id},
        )
        assert count == 0, msg(f'0 rows in {table}', count)
    jobs = await db_session.scalar(
        text('SELECT count(*) FROM jobs WHERE id = :id'), {'id': job_id}
    )
    sources = await db_session.scalar(text('SELECT count(*) FROM job_sources'))
    assert jobs == 1
    assert sources == 2


async def test_delete_account_ends_every_session_at_once(
    async_client: AsyncClient,
    db_session: AsyncSession,
    redis_client,
    async_engine,
):
    """KODI-057 (R-008, AC8): every session of the account ends with it -
    both Redis keys of each open session are gone (so its tokens are
    refused, see test_session_lifecycle), the rows go by CASCADE. Another
    user's session is untouched."""
    from app.domain.models import UserSessionModel

    user = base_data()['user']
    other = base_data()['admin_user']
    web = await open_session(async_engine, redis_client, user.id)
    cli = await open_session(
        async_engine,
        redis_client,
        user.id,
        client_type='cli',
        sign_in_method='cli_browser',
    )
    others = await open_session(async_engine, redis_client, other.id)

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204, msg(204, resp.status_code)

    for tokens in (web, cli):
        assert (
            await redis_client.exists(
                f'applika:session:{tokens.refresh_token}',
                f'applika:session:id:{tokens.session_id}',
            )
            == 0
        )
    rows = (
        await db_session.execute(
            select(UserSessionModel.id).where(
                UserSessionModel.user_id == user.id
            )
        )
    ).all()
    assert rows == []
    assert (
        await redis_client.exists(
            f'applika:session:{others.refresh_token}',
            f'applika:session:id:{others.session_id}',
        )
        == 2
    )
