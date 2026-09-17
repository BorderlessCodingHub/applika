"""Integration tests for ``/applications/{id}/cv`` - the application CV copy.

Run end to end against a real Postgres. What they pin, by criterion:

* AC3 - the copy is a full snapshot of the master CV, identity and contact
  included, field for field.
* AC4 - the copy is immune to its master: editing the master leaves it alone,
  deleting the master is never blocked, and afterwards the copy keeps every
  field with ``base_cv_id`` null (the "source CV deleted" state the UI shows).
* AC5 - one copy per application; a second create is a 409.
* AC6 - PUT replaces every field and the change is really persisted.
* AC7 - DELETE frees the application, and a new copy can then be made from a
  *different* master CV.
* AC10 - create, update and delete are refused on a finalized (409) and on an
  archived (422) application, while GET keeps working on both.
* AC12 - deleting the application takes its copy with it, through the FK
  cascade rather than an ORM cascade.

Security gets its own block. The schema permits a cross-user copy - nothing
ties ``tailored_cvs.user_id`` to ``applications.user_id`` or to
``base_cvs.user_id`` - so ownership is enforced entirely at the use-case layer
and has to be pinned explicitly: another user's application is a 404 on all
four verbs, another user's master CV cannot be the clone source, an admin gets
no extra access, and the persisted row always belongs to the acting user.

The foreign rows are seeded straight through ``db_session`` rather than through
a second client: ``async_client`` and ``admin_client`` both write
``main_app.dependency_overrides[get_current_user]`` on the same global dict, so
one test cannot act as two identities over HTTP. This is the same workaround
``tests/integration/test_base_cv_api.py`` uses.
"""

from datetime import date, datetime, timezone
from typing import Any, cast

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.schema import CreateTable

from app.domain.models import (
    ApplicationModel,
    BaseCVModel,
    TailoredCVModel,
)
from app.lib.types import generate_snowflake_id
from tests import msg
from tests.base_db_setup import base_data

SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

IDENTITY = (
    'name',
    'full_name',
    'headline',
    'location',
    'email',
    'phone',
    'summary',
)

SNAPSHOT_FIELDS = IDENTITY + SECTIONS

FULL_SECTIONS: dict[str, Any] = {
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
            'period': '2020 - 2026',
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
            'period': '09/2016 - 07/2018',
        }
    ],
    'certifications': [{'id': 'crt-1', 'name': 'AWS SAA', 'issuer': 'Amazon'}],
    'languages': [
        {'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'},
        {'id': 'lng-2', 'name': 'English', 'level': 'C2'},
    ],
}

JOB_DESCRIPTION = 'Backend engineer. Python, Postgres, async.'


def base_cv_payload(**overrides: Any) -> dict:
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


def application_payload(**overrides: Any) -> dict:
    body: dict[str, Any] = {
        'company': base_data()['company_acme'].id,
        'role': 'Software Engineer',
        'mode': 'active',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': '2025-12-01',
        'job_description': JOB_DESCRIPTION,
    }
    body.update(overrides)
    return body


def update_payload(**overrides: Any) -> dict:
    """A complete PUT body: every editable field, changed from the master."""
    body: dict[str, Any] = {
        'name': 'Tailored for Acme',
        'full_name': 'Ada B. Lovelace',
        'headline': 'Principal Backend Engineer',
        'location': 'Porto, PT',
        'email': 'ada.work@example.com',
        'phone': '+351 911 111 111',
        'summary': 'Rewritten for this exact posting.',
        'links': [
            {'id': 'lnk-9', 'label': 'Portfolio', 'url': 'https://ada.works'}
        ],
        'skills': [
            {
                'id': 'skl-9',
                'category': 'Platform',
                'keywords': ['Go', 'Kubernetes'],
            }
        ],
        'experience': [
            {
                'id': 'exp-9',
                'company': 'Globex',
                'company_description': None,
                'role': 'Principal Engineer',
                'period': '2018 - 2020',
                'location': None,
                'bullets': ['Led the platform team'],
            }
        ],
        'projects': [
            {
                'id': 'prj-9',
                'name': 'kodi',
                'description': 'A planning tool',
                'link': None,
                'link_label': None,
            }
        ],
        'education': [
            {
                'id': 'edu-9',
                'institution': 'Northgate College',
                'degree': "Bachelor's degree",
                'area': 'Computer Science',
                'period': '09/2012 - 07/2016',
            }
        ],
        'certifications': [
            {'id': 'crt-9', 'name': 'CKA', 'issuer': 'The Linux Foundation'}
        ],
        'languages': [{'id': 'lng-9', 'name': 'Spanish', 'level': 'B2'}],
    }
    body.update(overrides)
    return body


# --- Helpers ---------------------------------------------------------------


async def _create_base_cv(client: AsyncClient, **overrides: Any) -> dict:
    response = await client.post(
        '/base-cvs', json=base_cv_payload(**overrides)
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def _create_application(client: AsyncClient, **overrides: Any) -> dict:
    response = await client.post(
        '/applications', json=application_payload(**overrides)
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def _create_copy(
    client: AsyncClient, application_id: str, base_cv_id: str
) -> dict:
    response = await client.post(
        f'/applications/{application_id}/cv',
        json={'base_cv_id': base_cv_id},
    )
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def _setup(client: AsyncClient) -> tuple[dict, dict, dict]:
    """A master CV, an application and the copy made from it."""
    base_cv = await _create_base_cv(client)
    application = await _create_application(client)
    copy = await _create_copy(client, application['id'], base_cv['id'])
    return base_cv, application, copy


async def _finalize(db_session: AsyncSession, application_id: str) -> None:
    """Mark the application finalized straight in the database.

    Going through ``POST /finalize`` would need a strict step definition and a
    matching step; the criterion here is about ``feedback_id`` being set, and
    that is exactly what the guard reads.
    """
    await db_session.execute(
        sa.update(ApplicationModel)
        .where(ApplicationModel.id == int(application_id))
        .values(
            feedback_id=base_data()['fb_denied'].id,
            feedback_date=date(2025, 12, 10),
        )
    )
    await db_session.commit()


async def _archive(db_session: AsyncSession, application_id: str) -> None:
    """Put the application in a cycle, i.e. archive it."""
    cycle_id = generate_snowflake_id()
    await db_session.execute(
        sa.text(
            'INSERT INTO cycles (id, user_id, name, created_at) '
            'VALUES (:id, :user_id, :name, :now)'
        ),
        {
            'id': cycle_id,
            'user_id': base_data()['user'].id,
            'name': 'Q4 2025',
            'now': datetime.now(timezone.utc),
        },
    )
    await db_session.execute(
        sa.update(ApplicationModel)
        .where(ApplicationModel.id == int(application_id))
        .values(cycle_id=cycle_id)
    )
    await db_session.commit()


async def _seed_foreign_base_cv(
    db_session: AsyncSession, user_id: int
) -> int:
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


async def _seed_foreign_application(
    db_session: AsyncSession, user_id: int
) -> int:
    """Insert an application owned by ``user_id`` straight into the database."""
    application = ApplicationModel(
        user_id=user_id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Compiler Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()
    return application.id


async def _seed_foreign_copy(
    db_session: AsyncSession, user_id: int, application_id: int
) -> int:
    tailored_cv = TailoredCVModel(
        user_id=user_id,
        application_id=application_id,
        base_cv_id=None,
        name="Somebody else's copy",
        full_name='Grace Hopper',
        headline='Rear Admiral',
        location='Arlington, VA',
        email='grace@example.com',
    )
    db_session.add(tailored_cv)
    await db_session.commit()
    return tailored_cv.id


async def _row(db_session: AsyncSession, copy_id: str) -> Any:
    await db_session.commit()
    return await db_session.scalar(
        sa.select(TailoredCVModel).where(
            TailoredCVModel.id == int(copy_id)
        )
    )


async def _count_rows(db_session: AsyncSession) -> int:
    await db_session.commit()
    result = await db_session.execute(
        sa.select(sa.func.count()).select_from(TailoredCVModel)
    )
    return result.scalar_one()


# --- AC3: the copy is a full snapshot --------------------------------------


async def test_create_copies_every_field_of_the_master_cv(
    async_client: AsyncClient,
):
    """AC3: identity, contact, summary and all seven sections, field for
    field."""
    base_cv = await _create_base_cv(async_client)
    application = await _create_application(async_client)

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': base_cv['id']},
    )

    assert response.status_code == 201, msg(201, response.text)
    copy = response.json()
    for field in SNAPSHOT_FIELDS:
        assert copy[field] == base_cv[field], (
            f'{field}: {base_cv[field]!r} != {copy[field]!r}'
        )
    assert copy['application_id'] == application['id']
    assert copy['base_cv_id'] == base_cv['id']
    # Its own identity, not the master's.
    assert copy['id'] != base_cv['id']


async def test_create_uses_the_master_label_verbatim(
    async_client: AsyncClient,
):
    """AC3: the copy is labelled with the master CV's label, unchanged."""
    base_cv = await _create_base_cv(async_client, name='Platform CV')
    application = await _create_application(async_client)

    copy = await _create_copy(
        async_client, application['id'], base_cv['id']
    )

    assert copy['name'] == 'Platform CV', msg('Platform CV', copy['name'])


async def test_create_sets_no_ai_provenance(async_client: AsyncClient):
    """AC11: the only binding today copies, so nothing is AI-generated."""
    _, _, copy = await _setup(async_client)

    assert copy['was_ai_generated'] is False, msg(
        False, copy['was_ai_generated']
    )
    assert copy['adjustments'] == [], msg([], copy['adjustments'])


async def test_create_preserves_client_generated_section_ids(
    async_client: AsyncClient,
):
    """AC3: sub-item ids come from the client and survive the copy."""
    _, _, copy = await _setup(async_client)

    assert [item['id'] for item in copy['links']] == ['lnk-1', 'lnk-2']
    assert [item['id'] for item in copy['experience']] == ['exp-1']


async def test_the_copy_does_not_leak_user_id(async_client: AsyncClient):
    """``user_id`` stays off the wire, exactly like ``BaseCVOut``."""
    _, _, copy = await _setup(async_client)

    assert 'user_id' not in copy, msg('no user_id', sorted(copy))


async def test_get_returns_the_copy(async_client: AsyncClient):
    application_id = (await _setup(async_client))[1]['id']

    response = await async_client.get(f'/applications/{application_id}/cv')

    assert response.status_code == 200, msg(200, response.text)
    assert response.json()['full_name'] == 'Ada Lovelace'


async def test_get_without_a_copy_is_404(async_client: AsyncClient):
    application = await _create_application(async_client)

    response = await async_client.get(f'/applications/{application["id"]}/cv')

    assert response.status_code == 404, msg(404, response.status_code)


# --- AC5: at most one copy per application ---------------------------------


async def test_a_second_copy_is_refused(async_client: AsyncClient):
    """AC5: the application already has one, so this is a 409."""
    base_cv, application, _ = await _setup(async_client)
    other_master = await _create_base_cv(async_client, name='Other CV')

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': other_master['id']},
    )

    assert response.status_code == 409, msg(409, response.text)
    assert 'already has a CV copy' in response.json()['detail']


async def test_a_second_copy_from_the_same_master_is_refused(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC5: and the database still holds exactly one row."""
    base_cv, application, _ = await _setup(async_client)

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': base_cv['id']},
    )

    assert response.status_code == 409, msg(409, response.text)
    assert await _count_rows(db_session) == 1, msg(
        1, await _count_rows(db_session)
    )


# --- AC4: the copy is immune to its master ---------------------------------


async def test_editing_the_master_leaves_the_copy_untouched(
    async_client: AsyncClient,
):
    """AC4: the copy is a snapshot, not a view."""
    base_cv, application, copy = await _setup(async_client)

    patched = await async_client.patch(
        f'/base-cvs/{base_cv["id"]}',
        json={
            'full_name': 'Someone Else',
            'summary': 'A completely different summary.',
            'skills': [
                {'id': 'skl-x', 'category': 'Legacy', 'keywords': ['COBOL']}
            ],
        },
    )
    fetched = await async_client.get(f'/applications/{application["id"]}/cv')

    assert patched.status_code == 200, msg(200, patched.text)
    assert fetched.json()['full_name'] == 'Ada Lovelace'
    assert fetched.json()['summary'] == 'Ten years of backend engineering.'
    assert fetched.json()['skills'] == FULL_SECTIONS['skills']
    assert fetched.json() == copy | {
        'updated_at': fetched.json()['updated_at']
    }


async def test_deleting_the_master_is_never_blocked_and_keeps_the_copy(
    async_client: AsyncClient,
):
    """AC4: 204 on the master, and the copy keeps every field.

    ``base_cv_id`` becomes null - the copy has forgotten its source, which is
    the state the UI renders as "source CV deleted".
    """
    base_cv, application, copy = await _setup(async_client)

    deleted = await async_client.delete(f'/base-cvs/{base_cv["id"]}')
    fetched = await async_client.get(f'/applications/{application["id"]}/cv')

    assert deleted.status_code == 204, msg(204, deleted.text)
    assert fetched.status_code == 200, msg(200, fetched.text)
    after = fetched.json()
    assert after['base_cv_id'] is None, msg(None, after['base_cv_id'])
    for field in SNAPSHOT_FIELDS:
        assert after[field] == copy[field], field


async def test_the_copy_survives_deleting_every_master_cv(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC4: the copy is not a dependent row - it outlives all its sources."""
    base_cv, application, _ = await _setup(async_client)

    await async_client.delete(f'/base-cvs/{base_cv["id"]}')

    assert await _count_rows(db_session) == 1, msg(
        1, await _count_rows(db_session)
    )
    listed = await async_client.get('/base-cvs')
    assert listed.json() == [], msg([], listed.json())


# --- AC6: every field is editable ------------------------------------------


async def test_update_replaces_every_field_and_persists(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC6: the PUT body is the whole document and all of it lands."""
    _, application, copy = await _setup(async_client)
    body = update_payload()

    response = await async_client.put(
        f'/applications/{application["id"]}/cv', json=body
    )

    assert response.status_code == 200, msg(200, response.text)
    updated = response.json()
    for field in SNAPSHOT_FIELDS:
        assert updated[field] == body[field], field
    # ...and it is really in the database, not just in the response.
    row = await _row(db_session, copy['id'])
    assert row.full_name == 'Ada B. Lovelace'
    assert row.skills == update_payload()['skills']
    assert row.languages == body['languages']


async def test_update_leaves_provenance_alone(async_client: AsyncClient):
    """A manual edit sets no AI metadata and keeps the source link."""
    base_cv, application, _ = await _setup(async_client)

    response = await async_client.put(
        f'/applications/{application["id"]}/cv', json=update_payload()
    )

    assert response.json()['base_cv_id'] == base_cv['id']
    assert response.json()['was_ai_generated'] is False
    assert response.json()['adjustments'] == []


async def test_update_does_not_touch_the_master_cv(async_client: AsyncClient):
    """AC4: editing the copy is not editing the master."""
    base_cv, application, _ = await _setup(async_client)

    await async_client.put(
        f'/applications/{application["id"]}/cv', json=update_payload()
    )
    master = await async_client.get(f'/base-cvs/{base_cv["id"]}')

    assert master.json()['full_name'] == 'Ada Lovelace'
    assert master.json()['skills'] == FULL_SECTIONS['skills']


async def test_update_rejects_provenance_fields(async_client: AsyncClient):
    """``was_ai_generated`` is not something a client may set."""
    _, application, _ = await _setup(async_client)

    response = await async_client.put(
        f'/applications/{application["id"]}/cv',
        json=update_payload(was_ai_generated=True),
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_without_a_copy_is_404(async_client: AsyncClient):
    application = await _create_application(async_client)

    response = await async_client.put(
        f'/applications/{application["id"]}/cv', json=update_payload()
    )

    assert response.status_code == 404, msg(404, response.status_code)


# --- AC7: delete the copy, then make another one ---------------------------


async def test_delete_frees_the_application_for_a_new_copy(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC7: 204, then a new copy from a *different* master CV succeeds."""
    _, application, _ = await _setup(async_client)
    other_master = await _create_base_cv(async_client, name='Frontend CV')

    deleted = await async_client.delete(
        f'/applications/{application["id"]}/cv'
    )
    recreated = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': other_master['id']},
    )

    assert deleted.status_code == 204, msg(204, deleted.text)
    assert recreated.status_code == 201, msg(201, recreated.text)
    assert recreated.json()['name'] == 'Frontend CV'
    assert recreated.json()['base_cv_id'] == other_master['id']
    assert await _count_rows(db_session) == 1


async def test_delete_makes_the_copy_unreadable(async_client: AsyncClient):
    _, application, _ = await _setup(async_client)

    await async_client.delete(f'/applications/{application["id"]}/cv')
    fetched = await async_client.get(f'/applications/{application["id"]}/cv')

    assert fetched.status_code == 404, msg(404, fetched.status_code)


async def test_delete_does_not_touch_the_master_cv(async_client: AsyncClient):
    """AC7: deleting the copy leaves every master CV in place."""
    base_cv, application, _ = await _setup(async_client)

    await async_client.delete(f'/applications/{application["id"]}/cv')
    master = await async_client.get(f'/base-cvs/{base_cv["id"]}')

    assert master.status_code == 200, msg(200, master.status_code)


async def test_delete_without_a_copy_is_404(async_client: AsyncClient):
    application = await _create_application(async_client)

    response = await async_client.delete(
        f'/applications/{application["id"]}/cv'
    )

    assert response.status_code == 404, msg(404, response.status_code)


# --- AC10: read-only when finalized or archived ----------------------------


async def test_finalized_application_refuses_create(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC10: a conflict, with the same message a step refusal uses."""
    base_cv = await _create_base_cv(async_client)
    application = await _create_application(async_client)
    await _finalize(db_session, application['id'])

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': base_cv['id']},
    )

    assert response.status_code == 409, msg(409, response.text)
    assert response.json()['detail'] == (
        'This application has already been finalized'
    )


async def test_finalized_application_refuses_update_and_delete_but_not_get(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC10: writing is a 409; viewing the copy still returns it."""
    _, application, copy = await _setup(async_client)
    await _finalize(db_session, application['id'])

    updated = await async_client.put(
        f'/applications/{application["id"]}/cv', json=update_payload()
    )
    deleted = await async_client.delete(
        f'/applications/{application["id"]}/cv'
    )
    fetched = await async_client.get(f'/applications/{application["id"]}/cv')

    assert updated.status_code == 409, msg(409, updated.text)
    assert deleted.status_code == 409, msg(409, deleted.text)
    assert fetched.status_code == 200, msg(200, fetched.text)
    assert fetched.json()['id'] == copy['id']
    assert fetched.json()['full_name'] == 'Ada Lovelace'


async def test_archived_application_refuses_create(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC10: a business-rule violation, with the step refusal's message."""
    base_cv = await _create_base_cv(async_client)
    application = await _create_application(async_client)
    await _archive(db_session, application['id'])

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': base_cv['id']},
    )

    assert response.status_code == 422, msg(422, response.text)
    assert response.json()['detail'] == (
        'Cannot modify an application from an archived cycle'
    )


async def test_archived_application_refuses_update_and_delete_but_not_get(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC10: writing is a 422; viewing the copy still returns it."""
    _, application, copy = await _setup(async_client)
    await _archive(db_session, application['id'])

    updated = await async_client.put(
        f'/applications/{application["id"]}/cv', json=update_payload()
    )
    deleted = await async_client.delete(
        f'/applications/{application["id"]}/cv'
    )
    fetched = await async_client.get(f'/applications/{application["id"]}/cv')

    assert updated.status_code == 422, msg(422, updated.text)
    assert deleted.status_code == 422, msg(422, deleted.text)
    assert fetched.status_code == 200, msg(200, fetched.text)
    assert fetched.json()['id'] == copy['id']


@pytest.mark.parametrize(
    'make_read_only', [_finalize, _archive], ids=['finalized', 'archived']
)
async def test_the_refusal_matches_how_steps_are_refused_today(
    async_client: AsyncClient, db_session: AsyncSession, make_read_only
):
    """AC10, literally: the CV copy and a step answer identically.

    Same application, same state, two different endpoints - the status code
    and the message must agree, which is what "matching how steps are refused
    today" asks for. Both read-only states are compared, so the CV copy cannot
    drift from the step refusal in one of them.
    """
    base_cv = await _create_base_cv(async_client)
    application = await _create_application(async_client)
    await make_read_only(db_session, application['id'])

    step_response = await async_client.post(
        f'/applications/{application["id"]}/steps',
        json={
            'step_id': str(base_data()['step_applied'].id),
            'step_date': '2025-12-05',
        },
    )
    cv_response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': base_cv['id']},
    )

    assert cv_response.status_code == step_response.status_code, msg(
        step_response.status_code, cv_response.status_code
    )
    assert cv_response.json()['detail'] == step_response.json()['detail']


# --- AC12: the copy dies with its application ------------------------------


async def test_deleting_the_application_deletes_its_copy(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC12: through the FK cascade - ``delete_by_id`` runs no ORM cascade."""
    _, application, copy = await _setup(async_client)

    deleted = await async_client.delete(f'/applications/{application["id"]}')
    fetched = await async_client.get(f'/applications/{application["id"]}/cv')

    assert deleted.status_code == 204, msg(204, deleted.text)
    assert fetched.status_code == 404, msg(404, fetched.status_code)
    assert await _row(db_session, copy['id']) is None
    assert await _count_rows(db_session) == 0


async def test_deleting_the_user_deletes_their_copies(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _setup(async_client)

    await db_session.execute(
        sa.text('DELETE FROM users WHERE id = :id'),
        {'id': base_data()['user'].id},
    )
    await db_session.commit()

    assert await _count_rows(db_session) == 0


# --- SECURITY: ownership is enforced at the use-case layer only ------------


async def test_another_users_application_is_404_on_create(
    async_client: AsyncClient, db_session: AsyncSession
):
    """IDOR: authorize against the *application's* owner, not the copy's."""
    base_cv = await _create_base_cv(async_client)
    foreign_application = await _seed_foreign_application(
        db_session, base_data()['admin_user'].id
    )

    response = await async_client.post(
        f'/applications/{foreign_application}/cv',
        json={'base_cv_id': base_cv['id']},
    )

    assert response.status_code == 404, msg(404, response.text)
    assert await _count_rows(db_session) == 0


async def test_another_users_application_is_404_on_get(
    async_client: AsyncClient, db_session: AsyncSession
):
    """IDOR: a cross-user copy is unreadable even though the schema allows it."""
    owner_id = base_data()['admin_user'].id
    foreign_application = await _seed_foreign_application(db_session, owner_id)
    await _seed_foreign_copy(db_session, owner_id, foreign_application)

    response = await async_client.get(
        f'/applications/{foreign_application}/cv'
    )

    assert response.status_code == 404, msg(404, response.text)


async def test_another_users_application_is_404_on_update(
    async_client: AsyncClient, db_session: AsyncSession
):
    """IDOR."""
    owner_id = base_data()['admin_user'].id
    foreign_application = await _seed_foreign_application(db_session, owner_id)
    copy_id = await _seed_foreign_copy(
        db_session, owner_id, foreign_application
    )

    response = await async_client.put(
        f'/applications/{foreign_application}/cv', json=update_payload()
    )

    assert response.status_code == 404, msg(404, response.text)
    row = await _row(db_session, str(copy_id))
    assert row.full_name == 'Grace Hopper', msg('Grace Hopper', row.full_name)


async def test_another_users_application_is_404_on_delete(
    async_client: AsyncClient, db_session: AsyncSession
):
    """IDOR."""
    owner_id = base_data()['admin_user'].id
    foreign_application = await _seed_foreign_application(db_session, owner_id)
    await _seed_foreign_copy(db_session, owner_id, foreign_application)

    response = await async_client.delete(
        f'/applications/{foreign_application}/cv'
    )

    assert response.status_code == 404, msg(404, response.text)
    assert await _count_rows(db_session) == 1


async def test_another_users_master_cv_cannot_be_the_clone_source(
    async_client: AsyncClient, db_session: AsyncSession
):
    """IDOR: the source master CV is authorized on its own, not just the app.

    Own the application, point at somebody else's master CV: 404, and nothing
    is written. Without the separate ``get_by_id_and_user_id`` on the base CV
    repository this would happily clone another user's CV into your
    application.
    """
    application = await _create_application(async_client)
    foreign_base_cv = await _seed_foreign_base_cv(
        db_session, base_data()['admin_user'].id
    )

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': str(foreign_base_cv)},
    )

    assert response.status_code == 404, msg(404, response.text)
    assert response.json()['detail'] == 'Base CV not found'
    assert await _count_rows(db_session) == 0


async def test_an_unknown_master_cv_is_404(async_client: AsyncClient):
    application = await _create_application(async_client)

    response = await async_client.post(
        f'/applications/{application["id"]}/cv',
        json={'base_cv_id': str(generate_snowflake_id())},
    )

    assert response.status_code == 404, msg(404, response.text)


async def test_admin_gets_no_extra_access_to_another_users_copy(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """ADR-0004: ``is_admin`` grants nothing through the user routes.

    The acting user is the admin; the application and its copy belong to the
    regular user and are seeded directly, because both client fixtures write
    to the same ``dependency_overrides`` dict and cannot coexist in one test.
    """
    owner_id = base_data()['user'].id
    foreign_application = await _seed_foreign_application(db_session, owner_id)
    copy_id = await _seed_foreign_copy(
        db_session, owner_id, foreign_application
    )
    foreign_base_cv = await _seed_foreign_base_cv(db_session, owner_id)

    fetched = await admin_client.get(f'/applications/{foreign_application}/cv')
    created = await admin_client.post(
        f'/applications/{foreign_application}/cv',
        json={'base_cv_id': str(foreign_base_cv)},
    )
    updated = await admin_client.put(
        f'/applications/{foreign_application}/cv', json=update_payload()
    )
    deleted = await admin_client.delete(
        f'/applications/{foreign_application}/cv'
    )

    assert fetched.status_code == 404, msg(404, fetched.status_code)
    assert created.status_code == 404, msg(404, created.status_code)
    assert updated.status_code == 404, msg(404, updated.status_code)
    assert deleted.status_code == 404, msg(404, deleted.status_code)
    row = await _row(db_session, str(copy_id))
    assert row is not None and row.full_name == 'Grace Hopper'


async def test_the_persisted_copy_belongs_to_the_acting_user(
    async_client: AsyncClient, db_session: AsyncSession
):
    """The stored ``user_id`` is the acting user's, never anything else."""
    _, _, copy = await _setup(async_client)

    row = await _row(db_session, copy['id'])

    assert row.user_id == base_data()['user'].id, msg(
        base_data()['user'].id, row.user_id
    )


async def test_an_unknown_application_is_404_on_every_verb(
    async_client: AsyncClient,
):
    unknown = generate_snowflake_id()
    base_cv = await _create_base_cv(async_client)

    created = await async_client.post(
        f'/applications/{unknown}/cv', json={'base_cv_id': base_cv['id']}
    )
    fetched = await async_client.get(f'/applications/{unknown}/cv')
    updated = await async_client.put(
        f'/applications/{unknown}/cv', json=update_payload()
    )
    deleted = await async_client.delete(f'/applications/{unknown}/cv')

    for response in (created, fetched, updated, deleted):
        assert response.status_code == 404, msg(404, response.status_code)


# --- The ORM mirrors the migration -----------------------------------------


async def test_orm_server_defaults_match_the_migration(
    db_session: AsyncSession,
):
    """The ``create_all`` schema defaults exactly like ``f2a9c1d4b6e8``.

    A raw INSERT that omits ``summary``, the seven sections, ``adjustments``
    and
    ``was_ai_generated`` must land ``''``, ``[]`` and ``false``. Without the
    ``server_default``s on the ORM columns this fails with NOT NULL
    violations, and the test schema would have drifted away from the schema
    production actually runs.
    """
    application_id = await _seed_foreign_application(
        db_session, base_data()['user'].id
    )
    row_id = generate_snowflake_id()
    await db_session.execute(
        sa.text(
            'INSERT INTO tailored_cvs '
            '(id, user_id, application_id, name, full_name, headline, '
            'location, email, created_at) '
            'VALUES (:id, :user_id, :application_id, :name, :full_name, '
            ':headline, :location, :email, :now)'
        ),
        {
            'id': row_id,
            'user_id': base_data()['user'].id,
            'application_id': application_id,
            'name': 'Bare copy',
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
            'SELECT summary, phone, base_cv_id, was_ai_generated, '
            'adjustments, links, skills, experience, projects, '
            'education, certifications, languages '
            'FROM tailored_cvs WHERE id = :id'
        ),
        {'id': row_id},
    )
    row = result.mappings().one()

    assert row['summary'] == '', msg('', row['summary'])
    assert row['phone'] is None, msg(None, row['phone'])
    assert row['base_cv_id'] is None, msg(None, row['base_cv_id'])
    assert row['was_ai_generated'] is False, msg(
        False, row['was_ai_generated']
    )
    assert row['adjustments'] == [], msg([], row['adjustments'])
    for section in SECTIONS:
        assert row[section] == [], section


def test_orm_declares_the_migrations_server_defaults():
    """The mapping, not just the database, carries the defaults."""
    columns = TailoredCVModel.__table__.c

    assert columns.summary.server_default is not None, 'summary'
    assert columns.summary.server_default.arg.text == "''"
    assert columns.was_ai_generated.server_default is not None
    assert columns.was_ai_generated.server_default.arg.text == 'false'
    assert columns.was_ai_generated.nullable is False
    for section in (*SECTIONS, 'adjustments'):
        server_default = columns[section].server_default
        assert server_default is not None, section
        assert server_default.arg.text == "'[]'::jsonb", section
        assert columns[section].nullable is False, section


def test_orm_mirrors_the_migrations_constraints():
    """FK cascades, the UNIQUE and the index, exactly as the revision built."""
    table = cast(sa.Table, TailoredCVModel.__table__)
    ondelete = {
        next(iter(table.c[column].foreign_keys)).parent.name: next(
            iter(table.c[column].foreign_keys)
        ).ondelete
        for column in ('user_id', 'application_id', 'base_cv_id')
    }

    assert ondelete == {
        'user_id': 'CASCADE',
        'application_id': 'CASCADE',
        'base_cv_id': 'SET NULL',
    }, msg('the migration cascades', ondelete)
    unique = [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, sa.UniqueConstraint)
    ]
    assert [c.name for c in unique] == ['uq_tailored_cvs_application_id']
    assert [sorted(c.name for c in u.columns) for u in unique] == [
        ['application_id']
    ]
    assert {index.name for index in table.indexes} == {
        'idx_tailored_cvs_user_id'
    }
    # Landmine 8: base_cv_id deliberately has no index.
    assert all(
        'base_cv_id' not in index.columns for index in table.indexes
    )


def test_primary_key_follows_adr_0003():
    """BIGINT, Snowflake generated in Python, no sequence, no server default."""
    table = cast(sa.Table, TailoredCVModel.__table__)
    id_column = table.c.id

    assert isinstance(id_column.type, sa.BigInteger), id_column.type
    assert id_column.primary_key is True
    assert id_column.server_default is None
    default = cast(sa.ColumnDefault, id_column.default)
    assert default is not None
    assert default.is_callable is True
    assert default.arg.__name__ == generate_snowflake_id.__name__, default.arg
    assert table.autoincrement_column is None
    ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))
    assert 'SERIAL' not in ddl.upper(), ddl


def test_the_application_relationship_leaves_the_cascade_to_the_database():
    """AC12 rides on the FK, so the ORM must not fight it.

    ``ApplicationRepository.delete_by_id`` issues a bulk DELETE that runs no
    ORM cascade; ``passive_deletes`` is what stops SQLAlchemy from trying to
    null out the copy's NOT NULL ``application_id`` when the relationship
    happens to be loaded.
    """
    relationship = ApplicationModel.__mapper__.relationships['tailored_cv']

    assert relationship.passive_deletes is True
    assert relationship.uselist is False
