from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import GithubConnectionModel, UserBadgeModel, UserModel
from tests import msg
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless


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


async def test_get_me_without_binding_or_github_row(
    async_client: AsyncClient,
):
    data = (await async_client.get('/users/me')).json()
    assert data['badges'] == []
    assert data['borderless'] is None
    assert data['github_id'] is None
    assert data['github_restore'] == {'available': True, 'prompt': True}
    for gone in ('discord', 'discord_linked', 'discord_id'):
        assert gone not in data
    # The CLI's fields are unchanged.
    for kept in ('username', 'first_name', 'last_name', 'email'):
        assert kept in data


async def test_get_me_lists_badges_and_the_borderless_access(
    async_client: AsyncClient, db_session: AsyncSession
):
    binding = await bind_borderless(db_session, base_data()['user'].id)
    db_session.add(
        UserBadgeModel(
            user_id=base_data()['user'].id,
            badge='borderless_base',
            source='borderless',
            revoked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    data = (await async_client.get('/users/me')).json()

    assert [b['badge'] for b in data['badges']] == ['borderless_psp']
    assert data['borderless']['status'] == 'active'
    assert data['borderless']['email'] == binding.email
    assert 'token' not in str(data['borderless'])


async def test_get_me_reports_an_expired_or_refused_access(
    async_client: AsyncClient, db_session: AsyncSession
):
    await bind_borderless(
        db_session,
        base_data()['user'].id,
        expires_in=timedelta(seconds=-1),
    )
    data = (await async_client.get('/users/me')).json()
    assert data['borderless']['status'] == 'expired'
    assert [b['badge'] for b in data['badges']] == ['borderless_psp']


async def test_github_row_sets_github_id_and_hides_the_restore(
    async_client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        GithubConnectionModel(
            user_id=base_data()['user'].id,
            github_id=777,
            username='octo',
            linked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    data = (await async_client.get('/users/me')).json()
    assert data['github_id'] == 777
    assert data['github_restore'] == {'available': False, 'prompt': False}
    patched = (
        await async_client.patch('/users/me', json={'first_name': 'Ada'})
    ).json()
    assert patched['github_id'] == 777
    assert patched['first_name'] == 'Ada'


async def test_dismiss_answers_the_prompt_once_and_is_idempotent(
    async_client: AsyncClient, db_session: AsyncSession
):
    for _ in range(2):
        response = await async_client.post('/users/me/github-restore/dismiss')
        assert response.status_code == 204
    user = await db_session.get(
        UserModel, base_data()['user'].id, populate_existing=True
    )
    assert user is not None
    assert user.github_restore_prompt_seen_at is not None


async def test_admin_user_detail_has_no_discord_key(
    admin_client: AsyncClient, db_session: AsyncSession
):
    response = await admin_client.get(f'/admin/users/{base_data()["user"].id}')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert 'discord_id' not in data
    assert 'discord_linked' not in data
