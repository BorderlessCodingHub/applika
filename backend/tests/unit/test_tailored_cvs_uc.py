"""Unit tests for the application CV copy use cases and the tailoring port.

Two things are pinned here that the integration suite cannot pin as sharply.

* The clone binding really does copy **every** field of the master CV, identity
  and contact included, and it sets no AI provenance. ``test_clone_copies_...``
  compares field name sets rather than a hand-written list, so a field added to
  the stored shape later cannot quietly stop being copied.
* The read-only refusal is exactly the step refusal: archived first as a
  business-rule violation, finalized second as a conflict, on create, update
  **and** delete - and on neither of them for a read.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import (
    TailoredCVContent,
    TailoredCVCreateDTO,
    TailoredCVUpdateDTO,
    TailoringRequest,
)
from app.application.services.clone_tailoring import CloneTailoringService
from app.application.use_cases.tailored_cvs.create import (
    CreateTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.delete import (
    DeleteTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.get import GetTailoredCVUseCase
from app.application.use_cases.tailored_cvs.update import (
    UpdateTailoredCVUseCase,
)
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    ResourceConflict,
    ResourceNotFound,
)
from tests import msg
from tests.unit.conftest import make_application

SECTIONS: dict[str, Any] = {
    'links': [{'id': 'lnk-1', 'label': 'GitHub', 'url': 'https://gh/ada'}],
    'skills': [
        {
            'id': 'skl-1',
            'category': 'Languages',
            'keywords': ['Python', 'PostgreSQL'],
        }
    ],
    'experience': [
        {
            'id': 'exp-1',
            'company': 'Acme',
            'company_description': 'Anvils, mostly',
            'role': 'Staff Engineer',
            'period': '2020 - 2026',
            'location': 'Lisbon, PT',
            'bullets': ['Cut p99 by half'],
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
    'languages': [{'id': 'lng-1', 'name': 'English', 'level': 'C2'}],
}


class _RecordingTailoringService:
    """A fake binding: records its request, returns the clone's output."""

    def __init__(self):
        self.request: TailoringRequest | None = None

    async def tailor(self, request: TailoringRequest):
        self.request = request
        return await CloneTailoringService().tailor(request)


def make_base_cv(**overrides) -> BaseCVDTO:
    """A fully populated master CV read model."""
    defaults: dict[str, Any] = {
        'id': 10,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'user_id': 1,
        'name': 'Backend CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+351 900 000 000',
        'summary': 'Ten years of backend engineering.',
        **SECTIONS,
    }
    defaults.update(overrides)
    return BaseCVDTO(**defaults)


def make_tailored_cv(**overrides):
    """SimpleNamespace mimicking TailoredCVModel for model_validate."""
    defaults: dict[str, Any] = {
        'id': 20,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'user_id': 1,
        'application_id': 1,
        'base_cv_id': 10,
        'was_ai_generated': False,
        'adjustments': [],
        'name': 'Backend CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': '+351 900 000 000',
        'summary': 'Ten years of backend engineering.',
        **SECTIONS,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def update_dto(**overrides) -> TailoredCVUpdateDTO:
    defaults: dict[str, Any] = {
        'name': 'Edited CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Principal Engineer',
        'location': 'Porto, PT',
        'email': 'ada@new.example.com',
        'phone': None,
        'summary': 'Rewritten for this job.',
        **SECTIONS,
    }
    defaults.update(overrides)
    return TailoredCVUpdateDTO(**defaults)


def make_create_use_case(
    application=None,
    base_cv=None,
    existing=None,
    tailoring_service=None,
):
    """Wire ``CreateTailoredCVUseCase`` over mocked repositories."""
    tailored_cv_repo = AsyncMock()
    base_cv_repo = AsyncMock()
    application_repo = AsyncMock()

    application_repo.get_by_id_and_user_id.return_value = application
    base_cv_repo.get_by_id_and_user_id.return_value = base_cv
    tailored_cv_repo.get_by_application_id_and_user_id.return_value = existing
    tailored_cv_repo.create.return_value = make_tailored_cv()

    use_case = CreateTailoredCVUseCase(
        tailored_cv_repo,
        base_cv_repo,
        application_repo,
        tailoring_service or CloneTailoringService(),
    )
    return use_case, tailored_cv_repo


def create_dto(**overrides) -> TailoredCVCreateDTO:
    defaults: dict[str, Any] = {
        'user_id': 1,
        'application_id': 1,
        'base_cv_id': 10,
    }
    defaults.update(overrides)
    return TailoredCVCreateDTO(**defaults)


# --- AC11 / AC3: the tailoring port clones verbatim ------------------------


async def test_clone_copies_every_content_field():
    """AC3/AC11: no field of the stored shape escapes the copy.

    The assertion walks ``TailoredCVContent``'s own field names instead of a
    hand-written list, so adding a field to the CV shape without teaching
    ``CloneTailoringService`` to copy it fails right here.
    """
    base_cv = make_base_cv()

    result = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv, job_description='We need Python.')
    )

    content_fields = set(TailoredCVContent.model_fields)
    assert content_fields <= set(BaseCVDTO.model_fields), (
        'every stored CV field must exist on the master CV'
    )
    for field in content_fields:
        assert getattr(result.content, field) == getattr(base_cv, field), (
            f'{field} was not copied verbatim'
        )


async def test_clone_copies_identity_and_contact():
    """AC3: identity and contact are part of the snapshot, not merged later."""
    base_cv = make_base_cv()

    result = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv)
    )

    assert result.content.full_name == 'Ada Lovelace'
    assert result.content.headline == 'Staff Backend Engineer'
    assert result.content.location == 'Lisbon, PT'
    assert result.content.email == 'ada@example.com'
    assert result.content.phone == '+351 900 000 000'


async def test_clone_sets_no_ai_provenance():
    """AC11: nothing is generated, so provenance stays empty and false."""
    result = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=make_base_cv())
    )

    assert result.adjustments == [], msg([], result.adjustments)
    assert result.was_ai_generated is False, msg(False, result.was_ai_generated)


async def test_clone_ignores_the_job_description():
    """Today's binding is a copy: the posting cannot change the output."""
    base_cv = make_base_cv()

    without = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv)
    )
    with_posting = await CloneTailoringService().tailor(
        TailoringRequest(base_cv=base_cv, job_description='Rust, 10 years')
    )

    assert without.content == with_posting.content


# --- Create ----------------------------------------------------------------


async def test_create_uses_the_master_cv_label_verbatim():
    """AC3: the copy is labelled with the master CV's label, unchanged."""
    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(), base_cv=make_base_cv(name='Backend CV')
    )

    await use_case.execute(create_dto())

    result = tailored_cv_repo.create.call_args.kwargs['result']
    assert result.content.name == 'Backend CV', msg(
        'Backend CV', result.content.name
    )


async def test_create_passes_the_job_description_to_the_port():
    """The posting is the one application field a binding may read."""
    use_case, _ = make_create_use_case(
        application=make_application(job_description='We need Python.'),
        base_cv=make_base_cv(),
        tailoring_service=(service := _RecordingTailoringService()),
    )

    await use_case.execute(create_dto())

    assert service.request is not None
    assert service.request.job_description == 'We need Python.'


async def test_create_application_not_owned_is_not_found():
    """SECURITY: another user's application is indistinguishable from a miss."""
    use_case, _ = make_create_use_case(application=None)

    with pytest.raises(ResourceNotFound, match='Application not found'):
        await use_case.execute(create_dto())


async def test_create_base_cv_not_owned_is_not_found():
    """SECURITY: the source master CV is authorized on its own."""
    use_case, _ = make_create_use_case(
        application=make_application(), base_cv=None
    )

    with pytest.raises(ResourceNotFound, match='Base CV not found'):
        await use_case.execute(create_dto())


async def test_create_second_copy_is_a_conflict():
    """AC5: at most one CV copy per application."""
    use_case, _ = make_create_use_case(
        application=make_application(),
        base_cv=make_base_cv(),
        existing=make_tailored_cv(),
    )

    with pytest.raises(ResourceConflict, match='already has a CV copy'):
        await use_case.execute(create_dto())


async def test_create_on_a_finalized_application_is_a_conflict():
    """AC10: same exception and message a step refusal uses."""
    use_case, _ = make_create_use_case(
        application=make_application(feedback_id=1), base_cv=make_base_cv()
    )

    with pytest.raises(ApplicationFinalized, match='already been finalized'):
        await use_case.execute(create_dto())


async def test_create_on_an_archived_application_is_a_rule_violation():
    """AC10: same exception and message a step refusal uses."""
    use_case, _ = make_create_use_case(
        application=make_application(cycle_id=42), base_cv=make_base_cv()
    )

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await use_case.execute(create_dto())


async def test_archived_is_refused_before_finalized():
    """The guard order is the step guard order, not an approximation."""
    use_case, _ = make_create_use_case(
        application=make_application(cycle_id=42, feedback_id=1),
        base_cv=make_base_cv(),
    )

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await use_case.execute(create_dto())


async def test_create_never_writes_to_the_master_cv():
    """AC4: the master CV is read-only in this flow."""
    use_case, _ = make_create_use_case(
        application=make_application(), base_cv=make_base_cv()
    )

    await use_case.execute(create_dto())

    base_cv_repo = use_case.base_cv_repo
    base_cv_repo.update.assert_not_called()
    base_cv_repo.create.assert_not_called()
    base_cv_repo.delete.assert_not_called()


# --- Get: no editability guard ---------------------------------------------


def make_read_write_use_cases(application, tailored_cv=make_tailored_cv()):
    tailored_cv_repo = AsyncMock()
    application_repo = AsyncMock()
    application_repo.get_by_id_and_user_id.return_value = application
    tailored_cv_repo.get_by_application_id_and_user_id.return_value = (
        tailored_cv
    )
    tailored_cv_repo.update.return_value = tailored_cv
    return (
        GetTailoredCVUseCase(tailored_cv_repo, application_repo),
        UpdateTailoredCVUseCase(tailored_cv_repo, application_repo),
        DeleteTailoredCVUseCase(tailored_cv_repo, application_repo),
        tailored_cv_repo,
    )


@pytest.mark.parametrize(
    'application',
    [
        make_application(feedback_id=1),
        make_application(cycle_id=42),
        make_application(cycle_id=42, feedback_id=1),
    ],
    ids=['finalized', 'archived', 'both'],
)
async def test_get_is_allowed_on_a_read_only_application(application):
    """AC10: viewing the copy always works; only writing is refused."""
    get_uc, _, _, _ = make_read_write_use_cases(application)

    result = await get_uc.execute(1, 1)

    assert result.application_id == 1


async def test_get_application_not_owned_is_not_found():
    """SECURITY: the read is authorized against the application's owner."""
    get_uc, _, _, _ = make_read_write_use_cases(None)

    with pytest.raises(ResourceNotFound, match='Application not found'):
        await get_uc.execute(1, 1)


async def test_get_without_a_copy_is_not_found():
    get_uc, _, _, _ = make_read_write_use_cases(make_application(), None)

    with pytest.raises(ResourceNotFound, match='CV copy not found'):
        await get_uc.execute(1, 1)


# --- Update / delete: the same guard ---------------------------------------


async def test_update_replaces_every_field():
    """AC6: the update goes to the repository as a whole-document replace."""
    _, update_uc, _, tailored_cv_repo = make_read_write_use_cases(
        make_application()
    )
    data = update_dto()

    await update_uc.execute(1, 1, data)

    tailored_cv_repo.update.assert_called_once()
    assert tailored_cv_repo.update.call_args.args[1] is data


async def test_update_on_a_finalized_application_is_a_conflict():
    _, update_uc, _, _ = make_read_write_use_cases(
        make_application(feedback_id=1)
    )

    with pytest.raises(ApplicationFinalized, match='already been finalized'):
        await update_uc.execute(1, 1, update_dto())


async def test_update_on_an_archived_application_is_a_rule_violation():
    _, update_uc, _, _ = make_read_write_use_cases(
        make_application(cycle_id=42)
    )

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await update_uc.execute(1, 1, update_dto())


async def test_update_application_not_owned_is_not_found():
    """SECURITY."""
    _, update_uc, _, _ = make_read_write_use_cases(None)

    with pytest.raises(ResourceNotFound, match='Application not found'):
        await update_uc.execute(1, 1, update_dto())


async def test_delete_removes_the_copy():
    """AC7: the copy goes, nothing else does."""
    _, _, delete_uc, tailored_cv_repo = make_read_write_use_cases(
        make_application()
    )

    await delete_uc.execute(1, 1)

    tailored_cv_repo.delete.assert_called_once()


async def test_delete_on_a_finalized_application_is_a_conflict():
    _, _, delete_uc, _ = make_read_write_use_cases(
        make_application(feedback_id=1)
    )

    with pytest.raises(ApplicationFinalized, match='already been finalized'):
        await delete_uc.execute(1, 1)


async def test_delete_on_an_archived_application_is_a_rule_violation():
    _, _, delete_uc, _ = make_read_write_use_cases(
        make_application(cycle_id=42)
    )

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await delete_uc.execute(1, 1)


async def test_delete_application_not_owned_is_not_found():
    """SECURITY."""
    _, _, delete_uc, _ = make_read_write_use_cases(None)

    with pytest.raises(ResourceNotFound, match='Application not found'):
        await delete_uc.execute(1, 1)


async def test_delete_without_a_copy_is_not_found():
    _, _, delete_uc, _ = make_read_write_use_cases(make_application(), None)

    with pytest.raises(ResourceNotFound, match='CV copy not found'):
        await delete_uc.execute(1, 1)
