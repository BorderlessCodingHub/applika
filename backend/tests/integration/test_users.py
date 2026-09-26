import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import envs
from tests import msg
from tests.base_db_setup import base_data


@pytest.fixture(autouse=True)
def _discord_encryption_key(monkeypatch):
    """A valid Fernet key so ``_seed_connection`` can encrypt a refresh
    token for the rows this module seeds directly."""
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )


async def test_get_me_returns_new_fields_as_none(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Act
    response = await async_client.get('/users/me')

    # Assert: new fields should be present and None for a fresh user
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['username'] == base_data()['user'].username
    assert data['current_role'] is None, msg(None, data['current_role'])
    assert data['salary_currency'] is None, msg(None, data['salary_currency'])
    assert data['salary_period'] is None, msg(None, data['salary_period'])
    assert data['seniority_level'] is None, msg(None, data['seniority_level'])
    assert data['location'] is None, msg(None, data['location'])
    assert data['availability'] is None, msg(None, data['availability'])
    assert data['bio'] is None, msg(None, data['bio'])
    assert data['linkedin_url'] is None, msg(None, data['linkedin_url'])


async def test_update_user_profile_partial(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: only update a subset of fields
    payload = {
        'first_name': 'John',
        'last_name': 'Doe',
        'current_role': 'Senior Frontend Engineer',
        'location': 'Sao Paulo, Brazil',
    }

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['first_name'] == 'John', msg('John', data['first_name'])
    assert data['last_name'] == 'Doe', msg('Doe', data['last_name'])
    assert data['current_role'] == 'Senior Frontend Engineer', msg(
        'Senior Frontend Engineer', data['current_role']
    )
    assert data['location'] == 'Sao Paulo, Brazil', msg(
        'Sao Paulo, Brazil', data['location']
    )
    # Fields not sent should remain unchanged
    assert data['salary_currency'] is None, msg(None, data['salary_currency'])
    assert data['bio'] is None, msg(None, data['bio'])


async def test_update_user_profile_with_enums(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: update with enum fields
    payload = {
        'salary_currency': 'BRL',
        'salary_period': 'monthly',
        'seniority_level': 'senior',
        'availability': 'open_to_work',
        'current_salary': 15000.00,
        'experience_years': 8,
    }

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['salary_currency'] == 'BRL', msg('BRL', data['salary_currency'])
    assert data['salary_period'] == 'monthly', msg(
        'monthly', data['salary_period']
    )
    assert data['seniority_level'] == 'senior', msg(
        'senior', data['seniority_level']
    )
    assert data['availability'] == 'open_to_work', msg(
        'open_to_work', data['availability']
    )
    assert data['current_salary'] == 15000.0, msg(
        15000.0, data['current_salary']
    )
    assert data['experience_years'] == 8, msg(8, data['experience_years'])


async def test_update_user_profile_invalid_enum_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: invalid availability value
    payload = {'availability': 'invalid_status'}

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_user_profile_invalid_currency_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: invalid currency value
    payload = {'salary_currency': 'XYZ'}

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_user_tech_stack(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange
    payload = {
        'tech_stack': ['Python', 'FastAPI', 'React', 'TypeScript'],
    }

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['tech_stack'] == ['Python', 'FastAPI', 'React', 'TypeScript'], (
        msg(['Python', 'FastAPI', 'React', 'TypeScript'], data['tech_stack'])
    )


async def test_update_user_bio_and_linkedin(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange
    payload = {
        'bio': 'Passionate software engineer with 8 years of experience.',
        'linkedin_url': 'https://linkedin.com/in/johndoe',
    }

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['bio'] == payload['bio'], msg(payload['bio'], data['bio'])
    assert data['linkedin_url'] == payload['linkedin_url'], msg(
        payload['linkedin_url'], data['linkedin_url']
    )


async def test_update_user_full_profile(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: update all fields at once
    payload = {
        'first_name': 'Jane',
        'last_name': 'Smith',
        'current_role': 'Staff Engineer',
        'current_company': 'Big Tech Co',
        'current_salary': 250000.00,
        'salary_currency': 'USD',
        'salary_period': 'annual',
        'experience_years': 12,
        'seniority_level': 'staff',
        'location': 'San Francisco, USA',
        'availability': 'casually_looking',
        'bio': 'Building distributed systems at scale.',
        'linkedin_url': 'https://linkedin.com/in/janesmith',
        'tech_stack': ['Go', 'Kubernetes', 'PostgreSQL'],
    }

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['first_name'] == 'Jane', msg('Jane', data['first_name'])
    assert data['last_name'] == 'Smith', msg('Smith', data['last_name'])
    assert data['current_role'] == 'Staff Engineer', msg(
        'Staff Engineer', data['current_role']
    )
    assert data['current_company'] == 'Big Tech Co', msg(
        'Big Tech Co', data['current_company']
    )
    assert data['salary_currency'] == 'USD', msg('USD', data['salary_currency'])
    # R-031: `annual` is accepted, stored and returned as annually.
    assert data['salary_period'] == 'annually', msg(
        'annually', data['salary_period']
    )
    assert data['experience_years'] == 12, msg(12, data['experience_years'])
    assert data['seniority_level'] == 'staff', msg(
        'staff', data['seniority_level']
    )
    assert data['location'] == 'San Francisco, USA', msg(
        'San Francisco, USA', data['location']
    )
    assert data['availability'] == 'casually_looking', msg(
        'casually_looking', data['availability']
    )
    assert data['bio'] == payload['bio'], msg(payload['bio'], data['bio'])
    assert data['linkedin_url'] == payload['linkedin_url'], msg(
        payload['linkedin_url'], data['linkedin_url']
    )
    assert data['tech_stack'] == ['Go', 'Kubernetes', 'PostgreSQL'], msg(
        ['Go', 'Kubernetes', 'PostgreSQL'], data['tech_stack']
    )


async def test_update_user_empty_payload_no_changes(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: empty payload should not change anything
    payload = {}

    # Act
    response = await async_client.patch('/users/me', json=payload)

    # Assert: should still return 200 with current user data
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['username'] == base_data()['user'].username


async def test_get_me_discord_linked_false_when_unlinked(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/users/me')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['discord_linked'] is False
    assert data['discord'] is None
    assert 'discord_id' not in data


async def test_get_me_discord_linked_true_when_linked(
    async_client: AsyncClient, db_session: AsyncSession
):
    from tests.integration.test_account_link_discord import _seed_connection

    await _seed_connection(
        db_session, base_data()['user'].id, discord_id=555, username='ada'
    )

    response = await async_client.get('/users/me')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['discord_linked'] is True
    assert data['discord']['username'] == 'ada'
    assert data['discord']['status'] == 'active'
    assert data['discord']['avatar_url'] is None
    assert 'discord_id' not in data
    assert 'discord_id' not in data['discord']


async def test_get_me_discord_avatar_url_is_computed(
    async_client: AsyncClient, db_session: AsyncSession
):
    from tests.integration.test_account_link_discord import _seed_connection

    connection = await _seed_connection(
        db_session, base_data()['user'].id, discord_id=555
    )
    connection.avatar = 'avatar-hash'
    db_session.add(connection)
    await db_session.commit()

    response = await async_client.get('/users/me')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['discord']['avatar_url'] == (
        'https://cdn.discordapp.com/avatars/555/avatar-hash.png?size=64'
    )


async def test_get_me_discord_needs_reconnect_status(
    async_client: AsyncClient, db_session: AsyncSession
):
    from app.core.enums import DiscordConnectionStatus
    from tests.integration.test_account_link_discord import _seed_connection

    await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=555,
        status=DiscordConnectionStatus.NEEDS_RECONNECT,
    )

    response = await async_client.get('/users/me')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['discord']['status'] == 'needs_reconnect'


async def test_patch_me_discord_linked_present_no_discord_id(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.patch('/users/me', json={'first_name': 'Ada'})

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert 'discord_linked' in data
    assert 'discord' in data
    assert 'discord_id' not in data


async def test_admin_user_detail_has_no_discord_key(
    admin_client: AsyncClient, db_session: AsyncSession
):
    response = await admin_client.get(f'/admin/users/{base_data()["user"].id}')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert 'discord_id' not in data
    assert 'discord_linked' not in data
