from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Currency, ExperienceLevel, SalaryPeriod, WorkMode
from app.domain.models import ApplicationModel, CompanyModel
from tests import msg
from tests.base_db_setup import base_data


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _base_payload(**overrides) -> dict:
    """Minimal valid create/update payload using the existing company by ID."""
    payload = {
        'company': base_data()['company_acme'].id,
        'role': 'Software Engineer',
        'mode': 'active',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': '2025-12-01',
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# CREATE — company resolution cases
# ---------------------------------------------------------------------------


async def test_create_application_with_existing_company_id(
    async_client: AsyncClient, db_session: AsyncSession
):
    """company field as SnowflakeID → resolves to existing company name."""
    payload = _base_payload(
        role='Backend Engineer',
        link_to_job='https://example.com/job/1',
    )

    response = await async_client.post('/applications', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['company_id'] == str(base_data()['company_acme'].id), msg(
        str(base_data()['company_acme'].id), data['company_id']
    )
    assert data['company_name'] == 'Acme Corp', msg(
        'Acme Corp', data['company_name']
    )
    assert 'old_company' not in data, msg(
        'old_company not in response', data.keys()
    )


async def test_create_application_with_anonymous_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    """company field as {name, url: null} → company_id is null, name stored."""
    payload = _base_payload(
        company={'name': 'Stealth Startup', 'url': None},
        role='Frontend Engineer',
    )

    response = await async_client.post('/applications', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['company_id'] is None, msg(None, data['company_id'])
    assert data['company_name'] == 'Stealth Startup', msg(
        'Stealth Startup', data['company_name']
    )


async def test_create_application_with_new_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    """company field as {name, url} → new company created, company_id set."""
    payload = _base_payload(
        company={
            'name': 'Google',
            'url': 'https://www.linkedin.com/company/google',
        },
        role='SRE',
    )

    response = await async_client.post('/applications', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['company_name'] == 'Google', msg('Google', data['company_name'])
    assert data['company_id'] is not None, msg(
        'company_id should be set', data['company_id']
    )


async def test_create_application_with_nonexistent_company_id_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    """company field as SnowflakeID that does not exist → 404."""
    payload = _base_payload(company=999999)

    response = await async_client.post('/applications', json=payload)

    assert response.status_code == 404, msg(404, response.status_code)


async def test_create_application_with_optional_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Full payload with enum fields succeeds and returns them correctly."""
    payload = _base_payload(
        expected_salary=85000.0,
        salary_range_min=80000.0,
        salary_range_max=90000.0,
        currency='USD',
        salary_period='annual',
        experience_level='senior',
        work_mode='remote',
        country='United States',
        observation='Applied via referral',
    )

    response = await async_client.post('/applications', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['currency'] == 'USD', msg('USD', data['currency'])
    # R-031: `annual` from an installed CLI is accepted and read back as
    # annually.
    assert data['salary_period'] == 'annually', msg(
        'annually', data['salary_period']
    )
    assert data['experience_level'] == 'senior', msg('senior', data['experience_level'])
    assert data['work_mode'] == 'remote', msg('remote', data['work_mode'])
    assert data['country'] == 'United States', msg('United States', data['country'])


async def test_create_application_without_optional_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Minimal payload — optional enum fields are None in response."""
    response = await async_client.post('/applications', json=_base_payload())

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['currency'] is None, msg(None, data['currency'])
    assert data['salary_period'] is None, msg(None, data['salary_period'])
    assert data['experience_level'] is None, msg(None, data['experience_level'])
    assert data['work_mode'] is None, msg(None, data['work_mode'])
    assert data['country'] is None, msg(None, data['country'])


async def test_create_application_invalid_enum_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Invalid enum value → 422."""
    payload = _base_payload(currency='INVALID')

    response = await async_client.post('/applications', json=payload)

    assert response.status_code == 422, msg(422, response.status_code)


# ---------------------------------------------------------------------------
# UPDATE — company resolution cases
# ---------------------------------------------------------------------------


async def test_update_application_with_existing_company_id(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PUT with company as SnowflakeID updates company_id and company_name."""
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Junior Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    # Add a second company to switch to
    db_session.add(CompanyModel(
        id=2,
        name='TechCorp',
        url='https://www.linkedin.com/company/techcorp',
        created_by=base_data()['user'].id,
    ))
    await db_session.commit()

    update_payload = _base_payload(company=2, role='Senior Engineer')
    response = await async_client.put('/applications/1', json=update_payload)

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['company_id'] == '2', msg('2', data['company_id'])
    assert data['company_name'] == 'TechCorp', msg('TechCorp', data['company_name'])


async def test_update_application_with_anonymous_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PUT with {name, url: null} clears company_id and stores name."""
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    update_payload = _base_payload(
        company={'name': 'Confidential', 'url': None},
        role='Staff Engineer',
    )
    response = await async_client.put('/applications/1', json=update_payload)

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['company_id'] is None, msg(None, data['company_id'])
    assert data['company_name'] == 'Confidential', msg(
        'Confidential', data['company_name']
    )


async def test_update_application_with_new_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PUT with {name, url} registers a new company and links it."""
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    update_payload = _base_payload(
        company={
            'name': 'Meta',
            'url': 'https://www.linkedin.com/company/meta',
        },
        role='Principal Engineer',
    )
    response = await async_client.put('/applications/1', json=update_payload)

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['company_name'] == 'Meta', msg('Meta', data['company_name'])
    assert data['company_id'] is not None, msg(
        'company_id should be set', data['company_id']
    )


async def test_update_application_with_enum_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PUT with enum fields updates them correctly."""
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    update_payload = _base_payload(
        role='Senior Software Engineer',
        currency='EUR',
        salary_period='monthly',
        experience_level='staff',
        work_mode='hybrid',
        country='Germany',
    )
    response = await async_client.put('/applications/1', json=update_payload)

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['role'] == 'Senior Software Engineer', msg(
        'Senior Software Engineer', data['role']
    )
    assert data['currency'] == 'EUR', msg('EUR', data['currency'])
    assert data['salary_period'] == 'monthly', msg('monthly', data['salary_period'])
    assert data['experience_level'] == 'staff', msg('staff', data['experience_level'])
    assert data['work_mode'] == 'hybrid', msg('hybrid', data['work_mode'])
    assert data['country'] == 'Germany', msg('Germany', data['country'])


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------


async def test_list_applications(
    async_client: AsyncClient, db_session: AsyncSession
):
    """GET /applications returns all user applications ordered by date desc."""
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=None,
            company_name='Stealth Startup',
            role='Fullstack Engineer',
            mode='passive',
            application_date=date(2025, 12, 12),
        ),
    ])
    await db_session.commit()

    response = await async_client.get('/applications')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 2, msg(2, len(data))
    # Ordered by application_date desc — newer first
    assert data[0]['id'] == '2', msg('2', data[0]['id'])
    assert data[0]['company_id'] is None, msg(None, data[0]['company_id'])
    assert data[0]['company_name'] == 'Stealth Startup', msg(
        'Stealth Startup', data[0]['company_name']
    )
    assert data[1]['id'] == '1', msg('1', data[1]['id'])
    assert data[1]['company_id'] == '1', msg('1', data[1]['company_id'])
    assert data[1]['company_name'] == 'Acme Corp', msg(
        'Acme Corp', data[1]['company_name']
    )


async def test_list_applications_response_has_no_old_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    """old_company must not appear in the response schema."""
    db_session.add(ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    ))
    await db_session.commit()

    response = await async_client.get('/applications')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 1
    assert 'old_company' not in data[0], msg(
        'old_company not in response', list(data[0].keys())
    )


async def test_list_applications_with_enum_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Applications with enum fields are returned correctly."""
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
            currency=Currency.BRL,
            salary_period=SalaryPeriod.MONTHLY,
            experience_level=ExperienceLevel.SENIOR,
            work_mode=WorkMode.REMOTE,
            country='Brazil',
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Fullstack Engineer',
            mode='active',
            application_date=date(2025, 12, 12),
        ),
    ])
    await db_session.commit()

    response = await async_client.get('/applications')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 2, msg(2, len(data))

    # Newer application (id=2) is first, has no enums
    assert data[0]['currency'] is None, msg(None, data[0]['currency'])

    # Older application (id=1) has enum fields
    assert data[1]['currency'] == 'BRL', msg('BRL', data[1]['currency'])
    assert data[1]['salary_period'] == 'monthly', msg('monthly', data[1]['salary_period'])
    assert data[1]['experience_level'] == 'senior', msg('senior', data[1]['experience_level'])
    assert data[1]['work_mode'] == 'remote', msg('remote', data[1]['work_mode'])
    assert data[1]['country'] == 'Brazil', msg('Brazil', data[1]['country'])


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------


async def test_delete_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    """DELETE /applications/{id} removes the record."""
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    response = await async_client.delete('/applications/1')

    assert response.status_code == 204, msg(204, response.status_code)

    await db_session.run_sync(lambda s: s.expire_all())
    deleted = await db_session.get(ApplicationModel, 1)
    assert deleted is None, msg(None, deleted)


# ---------------------------------------------------------------------------
# job_description
#
# Optional, additive, at most 50 000 characters. The interesting half is the
# PUT: every other optional field clears when omitted (the full-replace
# semantics applika-cli 0.1.4 has always relied on), but job_description is
# sticky, because a published CLI that has never heard of the field must not
# wipe it. Both halves are asserted over HTTP here, because the set-ness the
# rule depends on is created in the route and would be destroyed by a plain
# model_dump().
# ---------------------------------------------------------------------------

JOB_DESCRIPTION = 'We are looking for a backend engineer. Python, Postgres.'
MAX_JOB_DESCRIPTION = 50_000


async def _create_application(client: AsyncClient, **overrides) -> dict:
    response = await client.post(
        '/applications', json=_base_payload(**overrides)
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def test_create_application_with_job_description(
    async_client: AsyncClient,
):
    """AC8: the posting is stored on create and comes back on the wire."""
    data = await _create_application(
        async_client, job_description=JOB_DESCRIPTION
    )

    assert data['job_description'] == JOB_DESCRIPTION, msg(
        JOB_DESCRIPTION, data['job_description']
    )


async def test_create_application_without_job_description_is_null(
    async_client: AsyncClient,
):
    """AC13: the field is optional - a CLI that omits it still gets a 201."""
    data = await _create_application(async_client)

    assert data['job_description'] is None, msg(
        None, data['job_description']
    )


async def test_create_application_job_description_too_long_is_422(
    async_client: AsyncClient,
):
    """50 001 characters is one too many."""
    response = await async_client.post(
        '/applications',
        json=_base_payload(job_description='x' * (MAX_JOB_DESCRIPTION + 1)),
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_create_application_job_description_at_the_limit_is_201(
    async_client: AsyncClient,
):
    """Exactly 50 000 characters is accepted."""
    response = await async_client.post(
        '/applications',
        json=_base_payload(job_description='x' * MAX_JOB_DESCRIPTION),
    )

    assert response.status_code == 201, msg(201, response.status_code)


async def test_update_without_job_description_keeps_the_stored_text(
    async_client: AsyncClient,
):
    """AC13: the applika-cli 0.1.4 PUT body, which has no such key.

    This is the test that fails if the route ever goes back to a plain
    ``model_dump()``: every key would be present in ``model_fields_set`` and
    the stored posting would be wiped by a client that never mentioned it.
    """
    created = await _create_application(
        async_client, job_description=JOB_DESCRIPTION
    )

    response = await async_client.put(
        f'/applications/{created["id"]}',
        json=_base_payload(role='Senior Engineer'),
    )

    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['job_description'] == JOB_DESCRIPTION, msg(
        JOB_DESCRIPTION, response.json()['job_description']
    )
    assert response.json()['role'] == 'Senior Engineer'


async def test_update_with_explicit_null_clears_the_job_description(
    async_client: AsyncClient,
):
    """AC8: sending ``null`` on purpose really does clear the stored text."""
    created = await _create_application(
        async_client, job_description=JOB_DESCRIPTION
    )

    response = await async_client.put(
        f'/applications/{created["id"]}',
        json=_base_payload(job_description=None),
    )

    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['job_description'] is None, msg(
        None, response.json()['job_description']
    )


async def test_update_replaces_the_job_description(async_client: AsyncClient):
    """AC8: the posting is editable when updating the application."""
    created = await _create_application(
        async_client, job_description=JOB_DESCRIPTION
    )

    response = await async_client.put(
        f'/applications/{created["id"]}',
        json=_base_payload(job_description='A different posting.'),
    )

    assert response.json()['job_description'] == 'A different posting.'


async def test_update_still_clears_other_omitted_optional_fields(
    async_client: AsyncClient,
):
    """The regression guard on PUT semantics for everything else.

    ``observation``, ``link_to_job`` and ``expected_salary`` are full-replace
    fields and must keep clearing when omitted. Only ``job_description`` is
    sticky; if carrying its set-ness had leaked into the other fields, this
    fails.
    """
    created = await _create_application(
        async_client,
        job_description=JOB_DESCRIPTION,
        observation='A stale note',
        link_to_job='https://example.com/job/7',
        expected_salary=4321.0,
    )
    assert created['observation'] == 'A stale note'

    response = await async_client.put(
        f'/applications/{created["id"]}', json=_base_payload()
    )

    data = response.json()
    assert data['observation'] is None, msg(None, data['observation'])
    assert data['link_to_job'] is None, msg(None, data['link_to_job'])
    assert data['expected_salary'] is None, msg(
        None, data['expected_salary']
    )
    # ...and the sticky field survived the same request.
    assert data['job_description'] == JOB_DESCRIPTION


async def test_update_job_description_too_long_is_422(
    async_client: AsyncClient,
):
    created = await _create_application(async_client)

    response = await async_client.put(
        f'/applications/{created["id"]}',
        json=_base_payload(job_description='x' * (MAX_JOB_DESCRIPTION + 1)),
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_list_applications_carries_the_job_description(
    async_client: AsyncClient,
):
    """AC8: the list endpoint carries the field too."""
    await _create_application(async_client, job_description=JOB_DESCRIPTION)

    response = await async_client.get('/applications')

    assert response.status_code == 200, msg(200, response.status_code)
    descriptions = [item['job_description'] for item in response.json()]
    assert JOB_DESCRIPTION in descriptions, msg(
        JOB_DESCRIPTION, descriptions
    )
