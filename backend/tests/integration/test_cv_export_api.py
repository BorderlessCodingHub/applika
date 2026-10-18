"""Integration tests for the four CV export routes added by KODI-017 (T090/T091).

Real pipeline, real Postgres, nothing mocked: RenderCV's Markdown templater
for the two ``.../markdown`` routes, the pure diff function plus the Markdown
document builder for ``.../cv/diff/markdown``, and the Typst compiler for
``.../cv/diff/pdf``.

What these pin, by criterion:

* **AC11** - every CV downloadable as a PDF (a master CV and an application's
  copy) is downloadable as Markdown too, next to the PDF: same ownership,
  same 404s, no finalized/archived guard on the read side.
* **AC10** - the copy's diff against its baseline downloads as Markdown or
  PDF, server-rendered. Baseline resolution (``base_snapshot`` else the
  current master via ``base_cv_id`` else 409) and the label rule (the
  current master's name when ``base_cv_id`` resolves, else "the original
  master CV") are both exercised directly, including the case a snapshot-less
  legacy copy falls back to its master.
* **ADR-0004** - another user's row is a 404 on every one of the four routes,
  admin or not (spot-checked; the exhaustive admin/foreign matrix already
  lives in ``test_cv_pdf_api.py`` for the sibling PDF routes and is not
  repeated four more times here).

Every CV here is invented: "Ada Example" and friends, same as
``test_cv_pdf_api.py``.
"""

from datetime import date, datetime, timezone
from typing import Any

import pytest
import sqlalchemy as sa
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CVExportFailed
from app.domain.models import ApplicationModel, BaseCVModel, TailoredCVModel
from app.lib.types import generate_snowflake_id
from app.main import app as main_app
from app.presentation.dependencies import (
    get_cv_diff_pdf_renderer_service,
    get_cv_markdown_renderer_service,
)
from tests import msg
from tests.base_db_setup import base_data

# ADR-0021: every route here needs the "cvs" beta feature; ``cvs_beta``
# seeds it and puts the ``async_client`` user on its list.
pytestmark = pytest.mark.usefixtures('cvs_beta')

PDF_MAGIC = b'%PDF-'

FULL_SECTIONS: dict[str, Any] = {
    'links': [
        {'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://github.com/ada'},
        {'id': 'lnk-2', 'label': 'Site', 'url': 'https://ada.example.com'},
    ],
    'skills': [
        {
            'id': 'skl-1',
            'category': 'Languages & Frameworks',
            'keywords': ['Python', 'PostgreSQL'],
        }
    ],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'role': 'Staff Engineer',
            'start': '2024-02',
            'bullets': ['Cut p99 by half'],
        }
    ],
    'projects': [],
    'education': [
        {
            'id': 'edu-1',
            'institution': 'Riverside Institute',
            'degree': "Master's degree",
            'start': '2016-09',
            'end': '2018-07',
        }
    ],
    'certifications': [],
    'languages': [{'id': 'lng-1', 'name': 'Portuguese', 'level': 'Native'}],
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
    base_cv = await _create_base_cv(client, **overrides)
    application = await _create_application(client)
    await _create_copy(client, application['id'], base_cv['id'])
    return base_cv['id'], application['id']


def _assert_is_markdown(response: Response, filename: str) -> None:
    assert response.status_code == 200, msg(200, response.text)
    assert response.headers['content-type'] == (
        'text/markdown; charset=utf-8'
    ), msg('text/markdown; charset=utf-8', response.headers['content-type'])
    assert response.headers['content-disposition'] == (
        f'attachment; filename="{filename}"'
    ), msg(filename, response.headers.get('content-disposition'))


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
    await db_session.execute(
        sa
        .update(ApplicationModel)
        .where(ApplicationModel.id == int(application_id))
        .values(finalized_at=datetime(2025, 12, 10, tzinfo=timezone.utc))
    )
    await db_session.commit()


async def _archive(db_session: AsyncSession, application_id: str) -> None:
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


async def _snapshotless_copy_of_master(
    db_session: AsyncSession,
    user_id: int,
    application_id: int,
    base_cv_id: int,
) -> TailoredCVModel:
    """A copy created before R5, still pointing at a live master CV.

    Every field matches ``base_cv_payload()``'s defaults exactly (empty
    sections included, passed in by the caller), so the diff against the
    live master starts at zero changes and the caller can edit the master
    afterwards to produce exactly one.
    """
    tailored_cv = TailoredCVModel(
        user_id=user_id,
        application_id=application_id,
        base_cv_id=base_cv_id,
        base_snapshot=None,
        name='Backend CV',
        full_name='Ada Example',
        headline='Staff Backend Engineer',
        location='Lisbon, PT',
        email='ada@example.com',
        phone='+1 202 555 0147',
        summary='Ten years of backend engineering.',
    )
    db_session.add(tailored_cv)
    await db_session.commit()
    await db_session.refresh(tailored_cv)
    return tailored_cv


async def _copy_with_no_baseline(
    db_session: AsyncSession, user_id: int, application_id: int
) -> TailoredCVModel:
    """No snapshot and no master: the diff routes' 409 case."""
    tailored_cv = TailoredCVModel(
        user_id=user_id,
        application_id=application_id,
        base_cv_id=None,
        base_snapshot=None,
        name='Orphan Copy',
        full_name='Ada Example',
        headline='Staff Backend Engineer',
        location='Lisbon, PT',
        email='ada@example.com',
    )
    db_session.add(tailored_cv)
    await db_session.commit()
    await db_session.refresh(tailored_cv)
    return tailored_cv


# --- AC11: Markdown alongside the PDF, every route the PDF has ------------


async def test_master_cv_downloads_as_markdown(async_client: AsyncClient):
    base_cv = await _create_base_cv(async_client)
    response = await async_client.get(f'/base-cvs/{base_cv["id"]}/markdown')
    _assert_is_markdown(response, 'backend-cv.md')
    assert 'Ada Example' in response.text


async def test_copy_downloads_as_markdown(async_client: AsyncClient):
    _, application_id = await _setup_copy(async_client)
    response = await async_client.get(
        f'/applications/{application_id}/cv/markdown'
    )
    _assert_is_markdown(response, 'backend-cv.md')


async def test_markdown_filename_uses_the_same_slug_as_the_pdf(
    async_client: AsyncClient,
):
    base_cv = await _create_base_cv(
        async_client, name='Senior Backend CV (2026)'
    )
    markdown_response = await async_client.get(
        f'/base-cvs/{base_cv["id"]}/markdown'
    )
    pdf_response = await async_client.post(f'/base-cvs/{base_cv["id"]}/pdf')
    assert markdown_response.headers['content-disposition'] == (
        'attachment; filename="senior-backend-cv-2026.md"'
    )
    assert pdf_response.headers['content-disposition'] == (
        'attachment; filename="senior-backend-cv-2026.pdf"'
    )


async def test_unknown_master_cv_markdown_is_404(async_client: AsyncClient):
    response = await async_client.get(
        f'/base-cvs/{generate_snowflake_id()}/markdown'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_another_users_master_cv_markdown_is_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    foreign = BaseCVModel(
        user_id=base_data()['admin_user'].id,
        name="Somebody else's CV",
        full_name='Grace Example',
        headline='Rear Admiral',
        location='Arlington, VA',
        email='grace@example.com',
    )
    db_session.add(foreign)
    await db_session.commit()

    response = await async_client.get(f'/base-cvs/{foreign.id}/markdown')
    assert response.status_code == 404, msg(404, response.text)


async def test_unknown_application_markdown_is_404(async_client: AsyncClient):
    response = await async_client.get(
        f'/applications/{generate_snowflake_id()}/cv/markdown'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_application_without_a_copy_markdown_is_404(
    async_client: AsyncClient,
):
    application = await _create_application(async_client)
    response = await async_client.get(
        f'/applications/{application["id"]}/cv/markdown'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_another_users_copy_markdown_is_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner_id = base_data()['admin_user'].id
    application_id = await _seed_foreign_application(db_session, owner_id)
    await _seed_foreign_copy(db_session, owner_id, application_id)

    response = await async_client.get(
        f'/applications/{application_id}/cv/markdown'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_finalized_applications_copy_markdown_still_downloads(
    async_client: AsyncClient, db_session: AsyncSession
):
    _, application_id = await _setup_copy(async_client)
    await _finalize(db_session, application_id)
    response = await async_client.get(
        f'/applications/{application_id}/cv/markdown'
    )
    assert response.status_code == 200, msg(200, response.text)


async def test_archived_applications_copy_markdown_still_downloads(
    async_client: AsyncClient, db_session: AsyncSession
):
    _, application_id = await _setup_copy(async_client)
    await _archive(db_session, application_id)
    response = await async_client.get(
        f'/applications/{application_id}/cv/markdown'
    )
    assert response.status_code == 200, msg(200, response.text)


# --- AC10: the diff downloads, Markdown and PDF ----------------------------


async def test_diff_markdown_zero_changes_right_after_copy_creation(
    async_client: AsyncClient,
):
    base_cv, application_id = await _setup_copy(async_client)
    response = await async_client.get(
        f'/applications/{application_id}/cv/diff/markdown'
    )
    _assert_is_markdown(response, 'backend-cv-changes.md')
    assert 'Compared with Backend CV: no changes' in response.text
    assert response.text.rstrip().endswith('No changes.')


async def test_diff_markdown_reflects_an_edit_against_the_snapshot(
    async_client: AsyncClient,
):
    base_cv, application_id = await _setup_copy(async_client)
    put_body = base_cv_payload(headline='Principal Backend Engineer')
    response = await async_client.put(
        f'/applications/{application_id}/cv', json=put_body
    )
    assert response.status_code == 200, msg(200, response.text)

    response = await async_client.get(
        f'/applications/{application_id}/cv/diff/markdown'
    )
    _assert_is_markdown(response, 'backend-cv-changes.md')
    assert 'Compared with Backend CV: 1 change' in response.text
    assert 'Compared with Backend CV: 1 changes' not in response.text
    assert (
        'Changed Headline: Staff Backend Engineer -> Principal Backend Engineer'
    ) in response.text


async def test_diff_pdf_returns_pdf_bytes(async_client: AsyncClient):
    _, application_id = await _setup_copy(async_client)
    response = await async_client.get(
        f'/applications/{application_id}/cv/diff/pdf'
    )
    _assert_is_pdf(response, 'backend-cv-changes.pdf')


async def test_diff_baseline_falls_back_to_the_current_master_cv(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A copy with no snapshot (pre-R5) diffs against the live master CV."""
    base_cv = await _create_base_cv(
        async_client,
        links=[],
        skills=[],
        experience=[],
        projects=[],
        education=[],
        certifications=[],
        languages=[],
    )
    application = await _create_application(async_client)
    await _snapshotless_copy_of_master(
        db_session,
        base_data()['user'].id,
        int(application['id']),
        int(base_cv['id']),
    )

    # Edit the master CV after the copy was made.
    response = await async_client.patch(
        f'/base-cvs/{base_cv["id"]}', json={'headline': 'New Master Title'}
    )
    assert response.status_code == 200, msg(200, response.text)

    response = await async_client.get(
        f'/applications/{application["id"]}/cv/diff/markdown'
    )
    _assert_is_markdown(response, 'backend-cv-changes.md')
    # The copy's own headline (unedited) is "Staff Backend Engineer"; the
    # master's is now "New Master Title" - diffed against the LIVE master.
    assert 'Compared with Backend CV: 1 change' in response.text
    assert 'Compared with Backend CV: 1 changes' not in response.text
    assert (
        'Changed Headline: New Master Title -> Staff Backend Engineer'
    ) in response.text


async def test_diff_label_is_the_original_master_cv_when_it_was_deleted(
    async_client: AsyncClient,
):
    """The snapshot survives the master's deletion; the label changes."""
    base_cv_id, application_id = await _setup_copy(async_client)
    response = await async_client.delete(f'/base-cvs/{base_cv_id}')
    assert response.status_code == 204, msg(204, response.text)

    response = await async_client.get(
        f'/applications/{application_id}/cv/diff/markdown'
    )
    _assert_is_markdown(response, 'backend-cv-changes.md')
    assert ('Compared with the original master CV: no changes') in response.text


async def test_diff_is_409_with_no_snapshot_and_no_master(
    async_client: AsyncClient, db_session: AsyncSession
):
    application = await _create_application(async_client)
    await _copy_with_no_baseline(
        db_session, base_data()['user'].id, int(application['id'])
    )

    response = await async_client.get(
        f'/applications/{application["id"]}/cv/diff/markdown'
    )
    assert response.status_code == 409, msg(409, response.text)
    assert response.json()['detail'] == (
        'This CV copy has no baseline to compare with.'
    )

    response = await async_client.get(
        f'/applications/{application["id"]}/cv/diff/pdf'
    )
    assert response.status_code == 409, msg(409, response.text)


DIFF_ROUTES = ('diff/markdown', 'diff/pdf')


@pytest.mark.parametrize('route', DIFF_ROUTES)
async def test_unknown_application_diff_is_404(
    async_client: AsyncClient, route: str
):
    response = await async_client.get(
        f'/applications/{generate_snowflake_id()}/cv/{route}'
    )
    assert response.status_code == 404, msg(404, response.text)


@pytest.mark.parametrize('route', DIFF_ROUTES)
async def test_application_without_a_copy_diff_is_404(
    async_client: AsyncClient, route: str
):
    application = await _create_application(async_client)
    response = await async_client.get(
        f'/applications/{application["id"]}/cv/{route}'
    )
    assert response.status_code == 404, msg(404, response.text)


@pytest.mark.parametrize('route', DIFF_ROUTES)
async def test_another_users_copy_diff_is_404(
    async_client: AsyncClient, db_session: AsyncSession, route: str
):
    owner_id = base_data()['admin_user'].id
    application_id = await _seed_foreign_application(db_session, owner_id)
    await _seed_foreign_copy(db_session, owner_id, application_id)

    response = await async_client.get(
        f'/applications/{application_id}/cv/{route}'
    )
    assert response.status_code == 404, msg(404, response.text)


async def test_diff_read_side_works_on_finalized_and_archived_applications(
    async_client: AsyncClient, db_session: AsyncSession
):
    _, finalized_id = await _setup_copy(async_client)
    await _finalize(db_session, finalized_id)
    response = await async_client.get(
        f'/applications/{finalized_id}/cv/diff/markdown'
    )
    assert response.status_code == 200, msg(200, response.text)

    _, archived_id = await _setup_copy(async_client)
    await _archive(db_session, archived_id)
    response = await async_client.get(
        f'/applications/{archived_id}/cv/diff/pdf'
    )
    assert response.status_code == 200, msg(200, response.text)


# --- A render that fails is a 500 with a fixed detail, no CV text ---------


class _BrokenMarkdownRenderer:
    async def render(self, cv: Any) -> Any:
        raise CVExportFailed('Could not render the CV Markdown')


class _BrokenDiffPdfRenderer:
    async def render(self, markdown_content: str, slug: str) -> Any:
        raise CVExportFailed('Could not render the CV diff PDF')


@pytest.fixture
def broken_export_renderers():
    main_app.dependency_overrides[get_cv_markdown_renderer_service] = (
        _BrokenMarkdownRenderer
    )
    main_app.dependency_overrides[get_cv_diff_pdf_renderer_service] = (
        _BrokenDiffPdfRenderer
    )
    yield
    main_app.dependency_overrides.pop(get_cv_markdown_renderer_service, None)
    main_app.dependency_overrides.pop(get_cv_diff_pdf_renderer_service, None)


@pytest.mark.parametrize(
    ('route', 'detail'),
    [
        ('cv/markdown', 'Could not render the CV Markdown'),
        ('cv/diff/pdf', 'Could not render the CV diff PDF'),
    ],
)
async def test_export_render_failure_is_a_500_with_a_fixed_detail(
    async_client: AsyncClient,
    broken_export_renderers: None,
    route: str,
    detail: str,
):
    _, application_id = await _setup_copy(async_client)
    response = await async_client.get(f'/applications/{application_id}/{route}')
    assert response.status_code == 500, msg(500, response.text)
    assert response.json() == {'detail': detail}, msg(detail, response.text)
    assert 'Ada Example' not in response.text


async def test_master_cv_markdown_render_failure_is_a_500(
    async_client: AsyncClient, broken_export_renderers: None
):
    base_cv = await _create_base_cv(async_client)
    response = await async_client.get(f'/base-cvs/{base_cv["id"]}/markdown')
    assert response.status_code == 500, msg(500, response.text)
    assert response.json() == {'detail': 'Could not render the CV Markdown'}
