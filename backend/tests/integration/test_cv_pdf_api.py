"""Integration tests for the two PDF export routes.

These run the **real** pipeline - mapper, vendored theme, RenderCV, the Typst
compiler - against a real Postgres. Nothing about the render is mocked, because
the thing worth proving is precisely that a row in the database comes back out
as a PDF a browser will open.

What they pin, by criterion:

* **AC2** - a master CV and an application's CV copy both produce a PDF on the
  server, typeset from the stored data with the fixed ``applika`` theme and no
  theme parameter anywhere in the request. Source Sans 3 is asserted to be
  embedded in the bytes, which is what makes the PDF look the same on a machine
  that has never heard of the font.
* **AC1, the download half** - the copy of a *finalized* application and the
  copy of an application *archived in a cycle* both download. The refusals that
  landed with the CV copy itself are re-asserted beside them, so a future change
  cannot open the write path while "fixing" the read path.
* **ADR-0004** - another user's row is a 404, indistinguishable from a miss,
  and being an admin grants nothing.

Every CV here is invented: "Ada Example" and friends.

The foreign rows are seeded straight through ``db_session`` rather than through
a second client: ``async_client`` and ``admin_client`` both write
``main_app.dependency_overrides[get_current_user]`` on the same global dict, so
one test cannot act as two identities over HTTP. Same workaround as
``tests/integration/test_base_cv_api.py`` and ``test_tailored_cv_api.py``.
"""

import re
from datetime import date, datetime, timezone
from typing import Any

import pytest
import sqlalchemy as sa
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.cv_rendering.renderer import RenderedPdf
from app.core.exceptions import PdfRenderFailed
from app.domain.models import (
    ApplicationModel,
    BaseCVModel,
    TailoredCVModel,
)
from app.lib.types import generate_snowflake_id
from app.main import app as main_app
from app.presentation.dependencies import get_cv_pdf_renderer_service
from tests import msg
from tests.base_db_setup import base_data

PDF_MAGIC = b'%PDF-'

# Every ``/BaseFont /ABCDEF+Name`` the PDF declares.
BASE_FONT = re.compile(rb'/BaseFont\s*/([A-Za-z0-9+\-,#]+)')

# The six-letter tag PDF puts in front of a *subset* embedded face, as in
# ``HTVCTQ+SourceSans3-Bold``. Stripping it leaves the face name itself.
SUBSET_TAG = re.compile(r'^[A-Z]{6}\+')

# The only family the ``applika`` theme typesets in, and so the only one the
# API image ships fonts for.
EMBEDDED_FONT_FAMILY = 'SourceSans3'

FULL_SECTIONS: dict[str, Any] = {
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'},
        {'id': 'lnk-2', 'label': 'Site', 'url': 'https://ada.example.com'},
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
            'link': 'https://applika.example.com',
            'link_label': 'applika.example.com',
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


def base_cv_payload(**overrides: Any) -> dict:
    body: dict[str, Any] = {
        'name': 'Backend CV',
        'full_name': 'Ada Example',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+1 202 555 0147',
        'summary': 'Ten years of backend engineering.',
        **FULL_SECTIONS,
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
    }
    body.update(overrides)
    return body


# --- Helpers ---------------------------------------------------------------


async def _create_base_cv(client: AsyncClient, **overrides: Any) -> dict:
    response = await client.post('/base-cvs', json=base_cv_payload(**overrides))
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


async def _setup_copy(client: AsyncClient, **overrides: Any) -> tuple[str, str]:
    """A master CV, an application and the copy made from it."""
    base_cv = await _create_base_cv(client, **overrides)
    application = await _create_application(client)
    await _create_copy(client, application['id'], base_cv['id'])
    return base_cv['id'], application['id']


def _assert_is_pdf(response: Response, filename: str) -> None:
    assert response.status_code == 200, msg(200, response.text)
    assert response.headers['content-type'] == 'application/pdf', msg(
        'application/pdf', response.headers['content-type']
    )
    assert response.content.startswith(PDF_MAGIC), msg(
        PDF_MAGIC, response.content[:16]
    )
    assert response.headers['content-disposition'] == (
        f'attachment; filename="{filename}"'
    ), msg(filename, response.headers.get('content-disposition'))


async def _finalize(db_session: AsyncSession, application_id: str) -> None:
    """Mark the application finalized straight in the database."""
    await db_session.execute(
        sa
        .update(ApplicationModel)
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
        sa
        .update(ApplicationModel)
        .where(ApplicationModel.id == int(application_id))
        .values(cycle_id=cycle_id)
    )
    await db_session.commit()


async def _seed_foreign_base_cv(db_session: AsyncSession, user_id: int) -> int:
    base_cv = BaseCVModel(
        user_id=user_id,
        name="Somebody else's CV",
        full_name='Grace Example',
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
        full_name='Grace Example',
        headline='Rear Admiral',
        location='Arlington, VA',
        email='grace@example.com',
    )
    db_session.add(tailored_cv)
    await db_session.commit()
    return tailored_cv.id


async def _count_copies(db_session: AsyncSession) -> int:
    await db_session.commit()
    result = await db_session.execute(
        sa.select(sa.func.count()).select_from(TailoredCVModel)
    )
    return result.scalar_one()


# --- AC2: a PDF really comes out of the server -----------------------------


async def test_master_cv_downloads_as_a_pdf(async_client: AsyncClient):
    base_cv = await _create_base_cv(async_client)
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    _assert_is_pdf(response, 'backend-cv.pdf')


async def test_copy_downloads_as_a_pdf(async_client: AsyncClient):
    _, application_id = await _setup_copy(async_client)
    response = await async_client.post(f'/applications/{application_id}/cv/pdf')
    _assert_is_pdf(response, 'backend-cv.pdf')


async def test_filename_is_slugged_from_the_cv_label(
    async_client: AsyncClient,
):
    """The label names the file; the person's name never does."""
    base_cv = await _create_base_cv(
        async_client, name='Senior Backend CV (2026)'
    )
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    _assert_is_pdf(response, 'senior-backend-cv-2026.pdf')


async def test_source_sans_3_is_embedded_in_the_pdf(
    async_client: AsyncClient,
):
    """The theme's font must travel inside the file, not be assumed present.

    The exclusivity half is the load-bearing one. The API image ships only the
    four vendored Source Sans 3 faces, and a glyph they do not cover does not
    fail the compile - Typst silently falls back to a built-in face and embeds
    *that*. Two real regressions look identical to "it rendered": turning the
    theme's ``show_icons`` back on embeds FontAwesome, and losing the vendored
    font path embeds LibertinusSerif. Asserting the set holds Source Sans 3
    **and nothing else** is what catches both.
    """
    base_cv = await _create_base_cv(async_client)
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    assert response.status_code == 200, msg(200, response.text)

    fonts = {name.decode() for name in BASE_FONT.findall(response.content)}
    faces = {SUBSET_TAG.sub('', font) for font in fonts}

    assert faces, msg('at least one embedded face', sorted(fonts))
    assert any(face.startswith(EMBEDDED_FONT_FAMILY) for face in faces), msg(
        'an embedded Source Sans 3 face', sorted(faces)
    )
    strangers = {
        face for face in faces if not face.startswith(EMBEDDED_FONT_FAMILY)
    }
    assert not strangers, msg('only Source Sans 3 faces', sorted(strangers))


async def test_the_request_carries_no_theme_and_no_body(
    async_client: AsyncClient,
):
    """A theme parameter is not merely ignored - the schema rejects it."""
    base_cv = await _create_base_cv(async_client)
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    assert response.status_code == 200, msg(200, response.text)

    schema = await async_client.get('/openapi.json')
    route = schema.json()['paths']['/base-cvs/{base_cv_id}/pdf']['post']
    assert 'requestBody' not in route, msg('no request body', route)
    parameter_names = {p['name'] for p in route.get('parameters', [])}
    assert 'theme' not in parameter_names, msg('no theme', parameter_names)


async def test_a_cv_with_only_identity_still_renders(
    async_client: AsyncClient,
):
    """Empty projects and certifications must not print an empty heading."""
    base_cv = await _create_base_cv(
        async_client,
        name='Bare CV',
        summary='',
        links=[],
        skills=[],
        experience=[],
        projects=[],
        education=[],
        certifications=[],
        languages=[],
    )
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    _assert_is_pdf(response, 'bare-cv.pdf')


async def test_contact_values_rendercv_would_refuse_still_render(
    async_client: AsyncClient,
):
    """applika validates neither column; a 500 here would be the user's CV."""
    base_cv = await _create_base_cv(
        async_client,
        name='Odd Contacts CV',
        email='ada@example.test',
        phone='call me maybe',
    )
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    _assert_is_pdf(response, 'odd-contacts-cv.pdf')


async def test_a_hashtag_in_the_summary_still_renders(
    async_client: AsyncClient,
):
    """``#word`` reads as a Typst command and would abort the compile."""
    base_cv = await _create_base_cv(
        async_client,
        name='Hashtag CV',
        summary='Open to work. #opentowork #DevOps',
        skills=[
            {
                'id': 'skl-h',
                'category': '#DevOps',
                'keywords': ['#Python', 'C# and .NET'],
            }
        ],
    )
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    _assert_is_pdf(response, 'hashtag-cv.pdf')


async def test_render_is_a_read_and_writes_no_row(
    async_client: AsyncClient, db_session: AsyncSession
):
    _, application_id = await _setup_copy(async_client)
    before = await _count_copies(db_session)

    response = await async_client.post(f'/applications/{application_id}/cv/pdf')
    assert response.status_code == 200, msg(200, response.text)

    assert await _count_copies(db_session) == before, msg(
        before, 'the copy count changed'
    )


# --- AC1, the download half: finished applications still export ------------


async def test_finalized_applications_copy_still_downloads(
    async_client: AsyncClient, db_session: AsyncSession
):
    _, application_id = await _setup_copy(async_client)
    await _finalize(db_session, application_id)

    response = await async_client.post(f'/applications/{application_id}/cv/pdf')
    _assert_is_pdf(response, 'backend-cv.pdf')


async def test_archived_applications_copy_still_downloads(
    async_client: AsyncClient, db_session: AsyncSession
):
    _, application_id = await _setup_copy(async_client)
    await _archive(db_session, application_id)

    response = await async_client.post(f'/applications/{application_id}/cv/pdf')
    _assert_is_pdf(response, 'backend-cv.pdf')


async def test_finalized_still_refuses_every_write(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Regression: opening the download must not open the write path."""
    base_cv_id, application_id = await _setup_copy(async_client)
    await _finalize(db_session, application_id)

    update = await async_client.put(
        f'/applications/{application_id}/cv',
        json=base_cv_payload(),
    )
    assert update.status_code == 409, msg(409, update.text)

    delete = await async_client.delete(f'/applications/{application_id}/cv')
    assert delete.status_code == 409, msg(409, delete.text)

    second = await _create_application(async_client)
    await _finalize(db_session, second['id'])
    create = await async_client.post(
        f'/applications/{second["id"]}/cv', json={'base_cv_id': base_cv_id}
    )
    assert create.status_code == 409, msg(409, create.text)


async def test_archived_still_refuses_every_write(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Regression: 422 on an archived application, download or no download."""
    base_cv_id, application_id = await _setup_copy(async_client)
    await _archive(db_session, application_id)

    update = await async_client.put(
        f'/applications/{application_id}/cv',
        json=base_cv_payload(),
    )
    assert update.status_code == 422, msg(422, update.text)

    delete = await async_client.delete(f'/applications/{application_id}/cv')
    assert delete.status_code == 422, msg(422, delete.text)

    second = await _create_application(async_client)
    await _archive(db_session, second['id'])
    create = await async_client.post(
        f'/applications/{second["id"]}/cv', json={'base_cv_id': base_cv_id}
    )
    assert create.status_code == 422, msg(422, create.text)


# --- ADR-0004: a foreign row is a miss, admin included ---------------------


async def test_unknown_master_cv_is_404(async_client: AsyncClient):
    response = await async_client.post(
        f'/base-cvs/{generate_snowflake_id()}/pdf'
    )
    assert response.status_code == 404, msg(404, response.text)
    assert 'detail' in response.json(), msg('a detail key', response.text)


async def test_another_users_master_cv_is_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    foreign_id = await _seed_foreign_base_cv(
        db_session, base_data()['admin_user'].id
    )
    response = await async_client.post(f'/base-cvs/{foreign_id}/pdf')
    assert response.status_code == 404, msg(404, response.text)


async def test_admin_gets_no_extra_access_to_a_master_cv(
    admin_client: AsyncClient, db_session: AsyncSession
):
    foreign_id = await _seed_foreign_base_cv(db_session, base_data()['user'].id)
    response = await admin_client.post(f'/base-cvs/{foreign_id}/pdf')
    assert response.status_code == 404, msg(404, response.text)


async def test_unknown_application_is_404(async_client: AsyncClient):
    response = await async_client.post(
        f'/applications/{generate_snowflake_id()}/cv/pdf'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_application_without_a_copy_is_404(async_client: AsyncClient):
    application = await _create_application(async_client)
    response = await async_client.post(
        f'/applications/{application["id"]}/cv/pdf'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_another_users_copy_is_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner_id = base_data()['admin_user'].id
    application_id = await _seed_foreign_application(db_session, owner_id)
    await _seed_foreign_copy(db_session, owner_id, application_id)

    response = await async_client.post(f'/applications/{application_id}/cv/pdf')
    assert response.status_code == 404, msg(404, response.text)


async def test_admin_gets_no_extra_access_to_a_copy(
    admin_client: AsyncClient, db_session: AsyncSession
):
    owner_id = base_data()['user'].id
    application_id = await _seed_foreign_application(db_session, owner_id)
    await _seed_foreign_copy(db_session, owner_id, application_id)

    response = await admin_client.post(f'/applications/{application_id}/cv/pdf')
    assert response.status_code == 404, msg(404, response.text)


# --- A render that fails is a 500 that changed nothing ---------------------


class _BrokenRenderer:
    """Stands in for a compiler that cannot produce a PDF today."""

    async def render(self, cv: Any) -> RenderedPdf:
        raise PdfRenderFailed('Could not render the CV PDF')


@pytest.fixture
def broken_renderer():
    main_app.dependency_overrides[get_cv_pdf_renderer_service] = _BrokenRenderer
    yield
    main_app.dependency_overrides.pop(get_cv_pdf_renderer_service, None)


async def test_render_failure_is_a_500_with_a_detail(
    async_client: AsyncClient, broken_renderer: None
):
    base_cv = await _create_base_cv(async_client)
    response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    assert response.status_code == 500, msg(500, response.text)
    assert 'detail' in response.json(), msg('a detail key', response.text)


async def test_render_failure_changes_nothing(
    async_client: AsyncClient,
    db_session: AsyncSession,
    broken_renderer: None,
):
    _, application_id = await _setup_copy(async_client)
    before = await _count_copies(db_session)

    response = await async_client.post(f'/applications/{application_id}/cv/pdf')
    assert response.status_code == 500, msg(500, response.text)
    assert await _count_copies(db_session) == before, msg(
        before, 'the copy count changed'
    )
