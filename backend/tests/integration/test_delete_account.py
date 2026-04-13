from datetime import date

from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel, UserModel
from tests import msg
from tests.base_db_setup import base_data


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
    assert result.scalar_one_or_none() is None, (
        'User should be deleted from db'
    )


async def test_delete_own_account_clears_cookies(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.delete('/users/me')
    assert resp.status_code == 204

    # Response should contain Set-Cookie headers that clear __access
    # and __refresh (max-age=0 or expires in the past)
    cookie_headers = resp.headers.get_list('set-cookie')
    cookie_names = [c.split('=')[0].strip() for c in cookie_headers]
    assert '__access' in cookie_names, (
        'Expected __access cookie to be cleared'
    )
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
    await db_session.execute(text(
        "INSERT INTO applications "
        "(id, user_id, platform_id, company_name, role, mode, "
        " application_date, created_at) "
        "VALUES (:id, :uid, :pid, 'TestCo', 'Engineer', 'active', "
        " '2026-01-15', now())"
    ), {'id': 9999, 'uid': user_id, 'pid': plat_id})
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
