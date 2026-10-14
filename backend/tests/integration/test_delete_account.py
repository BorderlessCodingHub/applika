import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import envs
from app.domain.models import UserModel
from tests import msg
from tests.base_db_setup import base_data


@pytest.fixture(autouse=True)
def _discord_encryption_key(monkeypatch):
    """A valid Fernet key so ``_seed_connection`` can encrypt a refresh
    token for the rows this module seeds directly."""
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )


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


async def test_delete_linked_account_frees_discord_id_for_another_user(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    """Deleting a linked Applika account removes the Discord link (R-011):
    another user can then link the same Discord id."""
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )
    from app.core.tokens import create_access_token
    from tests.integration.test_account_link_discord import (
        FakeDiscordOAuthService,
        _get_connection,
        _override_discord_service,
        _seed_connection,
        _status,
    )

    user_id = base_data()['user'].id
    other_id = base_data()['admin_user'].id
    await _seed_connection(db_session, user_id, discord_id=555)

    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204, msg(204, resp.status_code)

    result = await db_session.execute(
        select(UserModel).where(UserModel.id == user_id)
    )
    assert result.scalar_one_or_none() is None

    connection = await _get_connection(db_session, user_id)
    assert connection is None

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(other_id)
    token, _, _ = create_access_token('2')

    async_client.cookies.set('__access', token)
    response = await async_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )
    assert _status(response.headers['location']) == 'linked'

    other_connection = await _get_connection(db_session, other_id)
    assert other_connection is not None
    assert other_connection.discord_id == 555


async def test_delete_linked_account_tries_to_revoke(
    async_client: AsyncClient,
    db_session: AsyncSession,
    redis_client,
    monkeypatch,
):
    """Delete's own revoke attempt (T102): best-effort, before the row goes
    by cascade."""
    from cryptography.fernet import Fernet

    from app.config.settings import envs
    from tests.integration.test_account_link_discord import (
        FakeDiscordOAuthService,
        _override_discord_service,
        _seed_connection,
    )

    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    fake = FakeDiscordOAuthService()
    _override_discord_service(fake)
    await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=555,
        refresh_token='the-refresh-token',
    )

    resp = await async_client.delete('/users/me')

    assert resp.status_code == 204, msg(204, resp.status_code)
    assert fake.revoke_calls == ['the-refresh-token']


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


@pytest.mark.usefixtures('jobs_beta')  # KODI-052: needs "jobs"
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
