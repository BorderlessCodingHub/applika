"""Integration tests for ``/base-cvs`` - the master CV CRUD, capped at 3.

Three acceptance criteria are covered end to end against a real Postgres:

* AC1 - a signed-in user creates a master CV with a label, identity and
  contact, a summary and the seven sections, and every field comes back
  unchanged.
* AC2 - the fourth master CV is refused with the limit message, **including**
  when several creates arrive at the same time. Two tests cover this: one
  fires simultaneous requests through ``asyncio.gather`` under realistic
  timing, and one holds the race window open with a barrier so the result does
  not depend on how fast Postgres happened to answer. Dropping the
  ``SELECT ... FOR UPDATE`` from the create use case makes the second fail.
* AC3 - list, get, update and delete, own rows only. Another user's master CV
  is a 404 on every one of them, and an admin gets no extra access.

Two ORM-versus-migration guarantees are pinned here as well: the section and
summary ``server_default``s (so the ``create_all`` test schema cannot silently
drift from the schema revision ``f2a9c1d4b6e8`` builds) and the Snowflake
primary key of ADR-0003 (BIGINT, generated in Python, no sequence).
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, cast

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.schema import CreateTable

from app.domain.models import BaseCVModel
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.lib.types import generate_snowflake_id
from app.main import app as main_app
from app.presentation.dependencies import (
    DbSession,
    get_base_cv_repository,
)
from tests import msg
from tests.base_db_setup import base_data

LIMIT_MESSAGE = 'Base CV limit reached (max 3 per user)'

# How many creates race each other, and how long the deterministic race
# test holds the window open before giving up on a second arrival.
RACERS = 4
BARRIER_WAIT = 1.0

SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

FULL_SECTIONS = {
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'},
        {'id': 'lnk-2', 'label': 'Site', 'url': 'https://ada.dev'},
    ],
    'skills': [
        {
            'id': 'skl-1',
            'category': 'Languages & Frameworks',
            'keywords': ['Python', 'PostgreSQL', 'FastAPI'],
        },
        {'id': 'skl-2', 'category': 'Platform', 'keywords': ['Docker']},
    ],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'company_description': 'Anvils, mostly',
            'role': 'Staff Engineer',
            # An explicit ``null`` finish: the entry is current, and the
            # create echo comes back identical rather than growing a key.
            'start': '2020-02',
            'end': None,
            'location': 'Lisbon, PT',
            'bullets': ['Cut p99 by half', 'Owned the billing rewrite'],
        }
    ],
    'projects': [
        {
            'id': 'prj-1',
            'name': 'applika',
            'description': 'Job application tracker',
            'link': 'https://applika.dev',
            'link_label': 'applika.dev',
        }
    ],
    'education': [
        {
            'id': 'edu-1',
            'institution': 'Riverside Institute',
            'degree': "Master's degree",
            'area': 'Distributed Systems',
            'start': '2016-09',
            'end': '2018-07',
        }
    ],
    'certifications': [{'id': 'crt-1', 'name': 'AWS SAA', 'issuer': 'Amazon'}],
    'languages': [
        {'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'},
        {'id': 'lng-2', 'name': 'English', 'level': 'C2'},
    ],
}


def payload(**overrides: Any) -> dict:
    """A complete create body; ``overrides`` replaces any part of it."""
    body: dict[str, Any] = {
        'name': 'Backend CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+351 900 000 000',
        'summary': 'Ten years of backend engineering.',
        **{section: FULL_SECTIONS[section] for section in SECTIONS},
    }
    body.update(overrides)
    return body


def minimal_payload(**overrides: Any) -> dict:
    """Only the required identity fields - everything else defaulted."""
    body: dict[str, Any] = {
        'name': 'Bare CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
    }
    body.update(overrides)
    return body


async def _create(client: AsyncClient, **overrides: Any) -> dict:
    response = await client.post('/base-cvs', json=payload(**overrides))
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def _count_rows(db_session: AsyncSession, user_id: int) -> int:
    await db_session.commit()
    result = await db_session.execute(
        sa
        .select(sa.func.count())
        .select_from(BaseCVModel)
        .where(BaseCVModel.user_id == user_id)
    )
    return result.scalar_one()


async def _seed_foreign_cv(db_session: AsyncSession, user_id: int) -> int:
    """Insert a master CV owned by ``user_id`` straight into the database."""
    base_cv = BaseCVModel(
        user_id=user_id,
        name="Somebody else's CV",
        full_name='Grace Hopper',
        headline='Rear Admiral',
        location='Arlington, VA',
        email='grace@example.com',
    )
    db_session.add(base_cv)
    await db_session.commit()
    return base_cv.id


# --- AC1: create persists every field ---------------------------------------


async def test_create_returns_201_and_persists_every_field(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC1: label, identity, contact, summary and all seven sections
    survive."""
    body = payload()

    response = await async_client.post('/base-cvs', json=body)

    assert response.status_code == 201, msg(201, response.text)
    data = response.json()
    for field in (
        'name',
        'full_name',
        'headline',
        'location',
        'email',
        'phone',
        'summary',
    ):
        assert data[field] == body[field], msg(body[field], data[field])
    for section in SECTIONS:
        assert data[section] == body[section], section
    assert data['created_at'] is not None
    assert isinstance(data['id'], str), msg('str', type(data['id']))

    # The row is really there, owned by the acting user.
    assert await _count_rows(db_session, base_data()['user'].id) == 1


async def test_create_preserves_client_generated_section_ids(
    async_client: AsyncClient,
):
    """AC1: sub-item ids come from the client and are never re-minted."""
    created = await _create(async_client)

    fetched = await async_client.get(f'/base-cvs/{created["id"]}')

    assert fetched.status_code == 200, msg(200, fetched.text)
    data = fetched.json()
    assert [item['id'] for item in data['links']] == ['lnk-1', 'lnk-2']
    assert [item['id'] for item in data['experience']] == ['exp-1']
    assert [item['id'] for item in data['projects']] == ['prj-1']
    assert [item['id'] for item in data['certifications']] == ['crt-1']
    assert [item['id'] for item in data['languages']] == ['lng-1', 'lng-2']


async def test_create_defaults_phone_summary_and_sections(
    async_client: AsyncClient,
):
    """AC1: the optional phone is null, summary is empty, sections are []."""
    response = await async_client.post('/base-cvs', json=minimal_payload())

    assert response.status_code == 201, msg(201, response.text)
    data = response.json()
    assert data['phone'] is None, msg(None, data['phone'])
    assert data['summary'] == '', msg('', data['summary'])
    for section in SECTIONS:
        assert data[section] == [], section


async def test_create_does_not_accept_a_user_id_from_the_body(
    async_client: AsyncClient,
):
    """The owner is stamped from the session, never read from the body."""
    response = await async_client.post(
        '/base-cvs',
        json=minimal_payload(user_id=str(base_data()['admin_user'].id)),
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_create_does_not_leak_the_user_id_on_the_wire(
    async_client: AsyncClient,
):
    """The pinned contract has no ``user_id`` field."""
    data = await _create(async_client)

    assert 'user_id' not in data, msg('no user_id', sorted(data))


async def test_create_rejects_a_missing_required_field(
    async_client: AsyncClient,
):
    body = minimal_payload()
    del body['headline']

    response = await async_client.post('/base-cvs', json=body)

    assert response.status_code == 422, msg(422, response.status_code)


# --- AC2: the fourth master CV is refused ------------------------------------


async def test_fourth_create_is_refused_with_the_limit_message(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC2: "a user can create up to 3 master CV's" - the 4th is a 409."""
    for index in range(3):
        await _create(async_client, name=f'CV {index}')

    response = await async_client.post('/base-cvs', json=payload(name='CV 4'))

    assert response.status_code == 409, msg(409, response.text)
    assert response.json()['detail'] == LIMIT_MESSAGE, msg(
        LIMIT_MESSAGE, response.json()['detail']
    )
    assert await _count_rows(db_session, base_data()['user'].id) == 3


async def test_concurrent_creates_never_exceed_three(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC2: four creates fired at once, starting from two, land at three.

    ``asyncio.gather`` really does run these simultaneously: every request
    takes its own session and its own pooled connection. This is the
    realistic-load check; the deterministic proof that the lock - and not
    luck - is what serializes them is the test below.
    """
    user_id = base_data()['user'].id
    for index in range(2):
        await _create(async_client, name=f'CV {index}')

    responses = await asyncio.gather(*[
        async_client.post('/base-cvs', json=payload(name=f'Race {index}'))
        for index in range(4)
    ])

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [201, 409, 409, 409], msg([201, 409, 409, 409], statuses)
    for response in responses:
        if response.status_code == 409:
            assert response.json()['detail'] == LIMIT_MESSAGE
    assert await _count_rows(db_session, user_id) == 3, msg(
        3, await _count_rows(db_session, user_id)
    )


class _BarrierBaseCVRepository(BaseCVRepository):
    """A repository that parks every create between its count and its insert.

    The barrier sits in ``count_by_user_id`` - the one call the create use
    case always makes - and it is wide enough for all ``RACERS`` requests.
    Four requests can only meet there if they all counted before any of them
    inserted, which is exactly the interleaving the cap must survive.

    With the ``FOR UPDATE`` lock in place only one request ever gets as far as
    the count, so the barrier times out after ``BARRIER_WAIT``, that request
    finishes, and the rest follow one at a time and see a count of 3. Take the
    lock away and all four arrive together, all read 2 and all insert - four
    master CVs for one user, and this test fails.
    """

    barrier: asyncio.Barrier

    async def count_by_user_id(self, user_id: int) -> int:
        count = await super().count_by_user_id(user_id)
        try:
            await asyncio.wait_for(self.barrier.wait(), timeout=BARRIER_WAIT)
        except TimeoutError, asyncio.BrokenBarrierError:
            # Expected once the lock does its job: nobody else can arrive.
            pass
        return count


async def test_the_user_row_lock_is_what_serializes_concurrent_creates(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC2, deterministically: the fourth master CV cannot slip through.

    Every create is forced to pause between counting and inserting, so the
    window a race would need is held wide open for ``BARRIER_WAIT`` seconds.
    Only one request can ever be inside that window.
    """
    user_id = base_data()['user'].id
    for index in range(2):
        await _create(async_client, name=f'CV {index}')

    barrier = asyncio.Barrier(RACERS)

    def _override(session: DbSession):
        repository = _BarrierBaseCVRepository(session)
        repository.barrier = barrier
        return repository

    main_app.dependency_overrides[get_base_cv_repository] = _override
    try:
        responses = await asyncio.gather(*[
            async_client.post('/base-cvs', json=payload(name=f'Race {index}'))
            for index in range(RACERS)
        ])
    finally:
        main_app.dependency_overrides.pop(get_base_cv_repository, None)

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [201] + [409] * (RACERS - 1), msg(
        [201] + [409] * (RACERS - 1), statuses
    )
    assert await _count_rows(db_session, user_id) == 3, msg(
        3, await _count_rows(db_session, user_id)
    )


async def test_the_cap_is_per_user_not_global(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Another user sitting at the cap does not block this one.

    The other user's three master CVs are seeded straight into the database:
    ``async_client`` and ``admin_client`` share one global
    ``dependency_overrides`` dict, so a single test can only act as one
    identity through the API.
    """
    other_user_id = base_data()['admin_user'].id
    for _ in range(3):
        await _seed_foreign_cv(db_session, other_user_id)

    response = await async_client.post(
        '/base-cvs', json=payload(name='My first CV')
    )

    assert response.status_code == 201, msg(201, response.text)
    assert await _count_rows(db_session, other_user_id) == 3
    assert await _count_rows(db_session, base_data()['user'].id) == 1


async def test_deleting_frees_a_slot(async_client: AsyncClient):
    """Delete is never blocked, and it makes room for a new master CV."""
    created = [await _create(async_client, name=f'CV {i}') for i in range(3)]

    deleted = await async_client.delete(f'/base-cvs/{created[0]["id"]}')
    recreated = await async_client.post('/base-cvs', json=payload(name='New'))

    assert deleted.status_code == 204, msg(204, deleted.status_code)
    assert recreated.status_code == 201, msg(201, recreated.text)


# --- AC3: list / get / update / delete ---------------------------------------


async def test_list_returns_the_users_own_master_cvs(async_client: AsyncClient):
    """AC3: list."""
    for index in range(2):
        await _create(async_client, name=f'CV {index}')

    response = await async_client.get('/base-cvs')

    assert response.status_code == 200, msg(200, response.text)
    data = response.json()
    assert len(data) == 2, msg(2, len(data))
    assert {item['name'] for item in data} == {'CV 0', 'CV 1'}


async def test_list_excludes_another_users_master_cvs(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC3: own rows only (ADR-0004)."""
    await _seed_foreign_cv(db_session, base_data()['admin_user'].id)
    await _create(async_client, name='Mine')

    response = await async_client.get('/base-cvs')

    assert response.status_code == 200, msg(200, response.text)
    data = response.json()
    assert [item['name'] for item in data] == ['Mine'], msg(['Mine'], data)


async def test_list_is_empty_when_the_user_has_none(async_client: AsyncClient):
    response = await async_client.get('/base-cvs')

    assert response.status_code == 200, msg(200, response.text)
    assert response.json() == [], msg([], response.json())


async def test_get_returns_the_users_own_master_cv(async_client: AsyncClient):
    """AC3: show."""
    created = await _create(async_client)

    response = await async_client.get(f'/base-cvs/{created["id"]}')

    assert response.status_code == 200, msg(200, response.text)
    assert response.json() == created, msg(created, response.json())


async def test_get_unknown_id_is_404(async_client: AsyncClient):
    response = await async_client.get('/base-cvs/123456789012345678')

    assert response.status_code == 404, msg(404, response.status_code)


async def test_patch_updates_only_the_fields_provided(
    async_client: AsyncClient,
):
    """AC3: update is a true partial update - unset fields are untouched."""
    created = await _create(async_client)

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={'headline': 'Principal Engineer'}
    )

    assert response.status_code == 200, msg(200, response.text)
    data = response.json()
    assert data['headline'] == 'Principal Engineer'
    for field in ('name', 'full_name', 'location', 'email', 'phone'):
        assert data[field] == created[field], field
    assert data['summary'] == created['summary']
    for section in SECTIONS:
        assert data[section] == created[section], section


async def test_patch_replaces_a_section_whole(async_client: AsyncClient):
    """AC3: a section explicitly provided replaces that section entirely."""
    created = await _create(async_client)
    replacement = [{'id': 'lng-9', 'name': 'French', 'level': 'B1'}]

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={'languages': replacement}
    )

    assert response.status_code == 200, msg(200, response.text)
    data = response.json()
    assert data['languages'] == replacement, msg(replacement, data)
    # Every other section is untouched.
    assert data['links'] == created['links']
    assert data['skills'] == created['skills']


async def test_patch_can_clear_the_optional_phone(async_client: AsyncClient):
    created = await _create(async_client)

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={'phone': None}
    )

    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['phone'] is None


async def test_patch_with_an_empty_body_changes_nothing(
    async_client: AsyncClient,
):
    created = await _create(async_client)

    response = await async_client.patch(f'/base-cvs/{created["id"]}', json={})

    assert response.status_code == 200, msg(200, response.text)
    data = response.json()
    assert data['name'] == created['name']
    for section in SECTIONS:
        assert data[section] == created[section], section


async def test_patch_rejects_an_explicit_null_on_a_scalar(
    async_client: AsyncClient,
):
    """AC3: a NOT NULL column is never cleared - 422, never a 500.

    ``null`` here means the client asked to clear a column the schema
    declares NOT NULL. That must be refused at the edge; letting it reach
    Postgres raises an unhandled ``IntegrityError`` and the pinned contract
    for PATCH is ``200 | 404 | 422``.
    """
    created = await _create(async_client)

    for field in (
        'name',
        'full_name',
        'headline',
        'location',
        'email',
        'summary',
    ):
        response = await async_client.patch(
            f'/base-cvs/{created["id"]}', json={field: None}
        )
        assert response.status_code == 422, msg(
            422, f'{field} -> {response.status_code}'
        )


async def test_patch_rejects_an_explicit_null_on_a_section(
    async_client: AsyncClient,
):
    """AC3: the seven JSONB sections are NOT NULL too - clear them with []."""
    created = await _create(async_client)

    for section in SECTIONS:
        response = await async_client.patch(
            f'/base-cvs/{created["id"]}', json={section: None}
        )
        assert response.status_code == 422, msg(
            422, f'{section} -> {response.status_code}'
        )


async def test_patch_empties_a_section_with_an_empty_list(
    async_client: AsyncClient,
):
    """The supported way to clear a section: send ``[]``, not ``null``."""
    created = await _create(async_client)

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={'skills': []}
    )

    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['skills'] == [], msg([], response.json()['skills'])


async def test_patch_null_leaves_the_row_untouched(
    async_client: AsyncClient, db_session: AsyncSession
):
    """The refused PATCH changes nothing and the row is still readable."""
    created = await _create(async_client)

    refused = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={'name': None}
    )
    fetched = await async_client.get(f'/base-cvs/{created["id"]}')

    assert refused.status_code == 422, msg(422, refused.status_code)
    assert fetched.status_code == 200, msg(200, fetched.text)
    assert fetched.json() == created, msg(created, fetched.json())
    assert await _count_rows(db_session, base_data()['user'].id) == 1


async def test_patch_rejects_an_unknown_field(async_client: AsyncClient):
    created = await _create(async_client)

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={'user_id': '2'}
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_patch_unknown_id_is_404(async_client: AsyncClient):
    response = await async_client.patch(
        '/base-cvs/123456789012345678', json={'name': 'Nope'}
    )

    assert response.status_code == 404, msg(404, response.status_code)


async def test_delete_returns_204_and_the_row_is_gone(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC3: delete - 204, never 409."""
    created = await _create(async_client)

    response = await async_client.delete(f'/base-cvs/{created["id"]}')

    assert response.status_code == 204, msg(204, response.status_code)
    follow_up = await async_client.get(f'/base-cvs/{created["id"]}')
    assert follow_up.status_code == 404, msg(404, follow_up.status_code)
    assert await _count_rows(db_session, base_data()['user'].id) == 0


async def test_delete_unknown_id_is_404(async_client: AsyncClient):
    response = await async_client.delete('/base-cvs/123456789012345678')

    assert response.status_code == 404, msg(404, response.status_code)


# --- AC3: ownership - another user's row is a 404, admin included ------------


async def test_another_users_master_cv_is_404_on_get(
    async_client: AsyncClient, db_session: AsyncSession
):
    foreign_id = await _seed_foreign_cv(
        db_session, base_data()['admin_user'].id
    )

    response = await async_client.get(f'/base-cvs/{foreign_id}')

    assert response.status_code == 404, msg(404, response.status_code)


async def test_another_users_master_cv_is_404_on_patch(
    async_client: AsyncClient, db_session: AsyncSession
):
    foreign_id = await _seed_foreign_cv(
        db_session, base_data()['admin_user'].id
    )

    response = await async_client.patch(
        f'/base-cvs/{foreign_id}', json={'name': 'Hijacked'}
    )

    assert response.status_code == 404, msg(404, response.status_code)
    assert await _count_rows(db_session, base_data()['admin_user'].id) == 1


async def test_another_users_master_cv_is_404_on_delete(
    async_client: AsyncClient, db_session: AsyncSession
):
    foreign_id = await _seed_foreign_cv(
        db_session, base_data()['admin_user'].id
    )

    response = await async_client.delete(f'/base-cvs/{foreign_id}')

    assert response.status_code == 404, msg(404, response.status_code)
    assert await _count_rows(db_session, base_data()['admin_user'].id) == 1


async def test_admin_gets_no_extra_access_to_another_users_master_cv(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """ADR-0004: ``is_admin`` grants nothing through the user routes.

    The acting user here is the admin; the master CV belongs to the regular
    user and is seeded directly, because both client fixtures write to the
    same ``dependency_overrides`` dict and cannot coexist in one test.
    """
    owner_id = base_data()['user'].id
    foreign_id = await _seed_foreign_cv(db_session, owner_id)

    fetched = await admin_client.get(f'/base-cvs/{foreign_id}')
    patched = await admin_client.patch(
        f'/base-cvs/{foreign_id}', json={'name': 'Hijacked'}
    )
    deleted = await admin_client.delete(f'/base-cvs/{foreign_id}')
    listed = await admin_client.get('/base-cvs')

    assert fetched.status_code == 404, msg(404, fetched.status_code)
    assert patched.status_code == 404, msg(404, patched.status_code)
    assert deleted.status_code == 404, msg(404, deleted.status_code)
    assert listed.json() == [], msg([], listed.json())
    assert await _count_rows(db_session, owner_id) == 1


# --- KODI-007: experience and education periods ------------------------------
#
# The owner: "Today for Education and Experience, the period input is optional,
# this must be required, and needs to change, instead of a bare text input it
# needs to ask when started and when finished (finish is optional, when empty
# is counted as Present), it's a date input but only for month and year
# "MM/yyyy" for both start and finish."
#
# On the wire that is ISO ``YYYY-MM`` in both directions: ``MM/yyyy`` is the
# *input and display* format and lives in the frontend, while the API stores
# and returns the ISO month RenderCV's ``start_date``/``end_date`` take
# unchanged. These tests pin the server half of AC1, AC2 and AC3.

DATED_SECTIONS = ('experience', 'education')


def _dated_item(section: str, **overrides: Any) -> dict[str, Any]:
    """One experience or education item, with its period overridden."""
    item = dict(FULL_SECTIONS[section][0])
    item.pop('end', None)
    item.update(overrides)
    return item


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_an_entry_without_a_start_is_refused(
    async_client: AsyncClient, section: str
):
    """AC1 + AC2: the start month is required on **both** sections.

    Education is the widening: its period used to be optional free text, and
    the owner's sentence names both sections in one breath.
    """
    item = _dated_item(section)
    del item['start']

    response = await async_client.post(
        '/base-cvs', json=payload(**{section: [item]})
    )

    assert response.status_code == 422, msg(422, response.text)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_the_retired_period_field_is_refused(
    async_client: AsyncClient, section: str
):
    """``period`` is gone, not deprecated: sending it is a 422.

    ``extra='forbid'`` is what makes that true, and asserting it here is what
    stops the old free-text field from creeping back in beside the new pair.
    """
    item = _dated_item(section, start='2020-02')
    item['period'] = '2020 - 2026'

    response = await async_client.post(
        '/base-cvs', json=payload(**{section: [item]})
    )

    assert response.status_code == 422, msg(422, response.text)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_an_entry_with_no_finish_round_trips_as_current(
    async_client: AsyncClient, section: str
):
    """AC1 + AC2: "finish is optional, when empty is counted as Present".

    An omitted ``end`` comes back as ``null`` rather than as an empty string
    or a guessed month - that ``null`` is what the renderer turns into
    ``present``.
    """
    item = _dated_item(section, start='2024-02')

    created = await _create(async_client, **{section: [item]})
    fetched = await async_client.get(f'/base-cvs/{created["id"]}')

    assert fetched.status_code == 200, msg(200, fetched.text)
    stored = fetched.json()[section][0]
    assert stored['start'] == '2024-02', msg('2024-02', stored)
    assert stored['end'] is None, msg(None, stored)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_the_period_is_stored_and_returned_as_iso_months(
    async_client: AsyncClient, section: str
):
    """AC3: ISO ``YYYY-MM`` on the wire, byte for byte, in both directions."""
    item = _dated_item(section, start='2016-09', end='2018-07')

    created = await _create(async_client, **{section: [item]})

    assert created[section][0]['start'] == '2016-09'
    assert created[section][0]['end'] == '2018-07'


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_a_finish_earlier_than_its_start_is_refused(
    async_client: AsyncClient, section: str
):
    """AC3: "a finish earlier than its start is refused"."""
    item = _dated_item(section, start='2024-02', end='2023-02')

    response = await async_client.post(
        '/base-cvs', json=payload(**{section: [item]})
    )

    assert response.status_code == 422, msg(422, response.text)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_a_finish_in_the_same_month_as_its_start_is_accepted(
    async_client: AsyncClient, section: str
):
    """The boundary: *earlier* is refused, equal is a one-month entry.

    The migration seeds every carried-over item with ``start`` and ``end``
    both ``2026-01`` (the owner: "seed as "01/2026" to both start and
    finish"), so refusing an equal pair would make the migrated data
    unreadable through its own API.
    """
    item = _dated_item(section, start='2026-01', end='2026-01')

    created = await _create(async_client, **{section: [item]})

    assert created[section][0]['end'] == '2026-01', msg(
        'an equal pair is a valid one-month entry', created[section][0]
    )


@pytest.mark.parametrize(
    'value',
    [
        '01/2026',  # the owner's display format - the frontend's job
        '2026-1',  # unpadded month
        '2026-00',  # not a month
        '2026-13',  # not a month either
        '2026',  # a year alone
        '2026-01-15',  # a day-level date; this ticket is months only
        'present',  # the renderer's word, never a stored value
        '',
    ],
)
@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_a_start_that_is_not_an_iso_month_is_refused(
    async_client: AsyncClient, section: str, value: str
):
    """AC3: the wire is ISO ``YYYY-MM`` and nothing else.

    ``01/2026`` is in this list on purpose: it is exactly what the owner asked
    the *input* to look like, and exactly what the API must not be handed.
    The frontend converts; the server stores ISO.
    """
    item = _dated_item(section, start=value)

    response = await async_client.post(
        '/base-cvs', json=payload(**{section: [item]})
    )

    assert response.status_code == 422, msg(422, response.text)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_a_finish_that_is_not_an_iso_month_is_refused(
    async_client: AsyncClient, section: str
):
    item = _dated_item(section, start='2020-02', end='12/2024')

    response = await async_client.post(
        '/base-cvs', json=payload(**{section: [item]})
    )

    assert response.status_code == 422, msg(422, response.text)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_patch_refuses_a_finish_earlier_than_its_start(
    async_client: AsyncClient, section: str
):
    """AC3 on the partial update: the rule lives on the item, not the body.

    A PATCH replaces a section whole, so the same item model validates it and
    the same 422 comes back - the create path is not the only guarded one.
    """
    created = await _create(async_client)
    item = _dated_item(section, start='2024-02', end='2020-02')

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={section: [item]}
    )

    assert response.status_code == 422, msg(422, response.text)


@pytest.mark.parametrize('section', DATED_SECTIONS)
async def test_patch_can_clear_a_finish_to_make_an_entry_current(
    async_client: AsyncClient, section: str
):
    """A user still in the job removes the finish; it stores as null."""
    created = await _create(async_client)
    item = _dated_item(section, start='2020-02')

    response = await async_client.patch(
        f'/base-cvs/{created["id"]}', json={section: [item]}
    )

    assert response.status_code == 200, msg(200, response.text)
    assert response.json()[section][0]['end'] is None, msg(
        None, response.json()[section][0]
    )


# --- The ORM mirrors the migration -------------------------------------------


async def test_orm_server_defaults_match_the_migration(
    db_session: AsyncSession,
):
    """The ``create_all`` schema defaults exactly like ``f2a9c1d4b6e8``.

    A raw INSERT that omits ``summary`` and the seven sections must land ``''``
    and ``[]``, the same values ``test_section_defaults_are_empty_arrays``
    pins on the migrated schema. Without the ``server_default``s on the ORM
    columns this test fails with NOT NULL violations, and the two schemas
    would have drifted apart unnoticed.
    """
    row_id = generate_snowflake_id()
    await db_session.execute(
        sa.text(
            'INSERT INTO base_cvs '
            '(id, user_id, name, full_name, headline, location, email, '
            'created_at) '
            'VALUES (:id, :user_id, :name, :full_name, :headline, '
            ':location, :email, :now)'
        ),
        {
            'id': row_id,
            'user_id': base_data()['user'].id,
            'name': 'Bare CV',
            'full_name': 'Ada Lovelace',
            'headline': 'Backend Engineer',
            'location': 'Lisbon, PT',
            'email': 'ada@example.com',
            'now': datetime.now(timezone.utc),
        },
    )
    await db_session.commit()

    result = await db_session.execute(
        sa.text(
            'SELECT summary, phone, links, skills, experience, projects, '
            'education, certifications, languages '
            'FROM base_cvs WHERE id = :id'
        ),
        {'id': row_id},
    )
    row = result.mappings().one()

    assert row['summary'] == '', msg('', row['summary'])
    assert row['phone'] is None, msg(None, row['phone'])
    for section in SECTIONS:
        assert row[section] == [], section


def test_orm_declares_the_migrations_server_defaults():
    """The mapping, not just the database, carries the defaults."""
    columns = BaseCVModel.__table__.c

    assert columns.summary.server_default is not None, 'summary'
    assert columns.summary.server_default.arg.text == "''"
    for section in SECTIONS:
        server_default = columns[section].server_default
        assert server_default is not None, section
        assert server_default.arg.text == "'[]'::jsonb", section
        assert columns[section].nullable is False, section


def test_primary_key_follows_adr_0003():
    """BIGINT, Snowflake generated in Python, no sequence, no server default."""
    table = cast(sa.Table, BaseCVModel.__table__)
    id_column = table.c.id

    assert isinstance(id_column.type, sa.BigInteger), id_column.type
    assert id_column.primary_key is True
    assert id_column.server_default is None
    default = cast(sa.ColumnDefault, id_column.default)
    assert default is not None
    assert default.is_callable is True
    # SQLAlchemy wraps the callable, so compare identity by name.
    assert default.arg.__name__ == generate_snowflake_id.__name__, default.arg
    # No BIGSERIAL and no sequence in the emitted DDL.
    assert table.autoincrement_column is None
    ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))
    assert 'SERIAL' not in ddl.upper(), ddl


def test_user_id_cascades_like_every_other_user_owned_table():
    foreign_key = next(iter(BaseCVModel.__table__.c.user_id.foreign_keys))

    assert foreign_key.column.table.name == 'users'
    assert foreign_key.ondelete == 'CASCADE'


async def test_deleting_the_user_deletes_their_master_cvs(
    async_client: AsyncClient, db_session: AsyncSession
):
    user_id = base_data()['user'].id
    await _create(async_client)

    await db_session.execute(
        sa.text('DELETE FROM users WHERE id = :id'), {'id': user_id}
    )
    await db_session.commit()

    assert await _count_rows(db_session, user_id) == 0
