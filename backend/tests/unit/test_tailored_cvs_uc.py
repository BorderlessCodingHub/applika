"""Unit tests for the application CV copy use cases and the tailoring port.

Two things are pinned here that the integration suite cannot pin as sharply.

* The clone binding really does copy **every** field of the master CV, identity
  and contact included, and it sets no AI provenance. ``test_clone_copies_...``
  compares field name sets rather than a hand-written list, so a field added to
  the stored shape later cannot quietly stop being copied.
* The read-only refusal is exactly the step refusal: archived first as a
  business-rule violation, closed (``finalized_at`` set) second as a conflict, on create, update
  **and** delete - and on neither of them for a read.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.tailored_cv import (
    CVFitDTO,
    TailoredCVContent,
    TailoredCVCreateDTO,
    TailoredCVUpdateDTO,
    TailoringRequest,
)
from app.application.services.clone_tailoring import CloneTailoringService
from app.application.services.keyword_tailoring import KeywordTailoringService
from app.application.services.tailoring import TailoringService
from app.application.use_cases.tailored_cvs.create import (
    CreateTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.delete import (
    DeleteTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.fit import (
    GetTailoredCVFitUseCase,
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
from app.presentation.dependencies import (
    get_tailoring_resolver,
    resolve_tailoring,
)
from tests import msg
from tests.unit.conftest import make_application

# Closed = finalized_at set (PRD 0008): the guard no longer reads feedback_id.
CLOSED_AT = datetime(2026, 1, 2, tzinfo=timezone.utc)

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
            'start': '2020-02',
            'end': '2026-01',
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
            'start': '2016-09',
            'end': '2018-07',
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
        'base_snapshot': None,
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


class _RecordingResolver:
    """A resolver that records every mode it is asked for."""

    def __init__(self, service: TailoringService | None = None):
        self.service = service
        self.modes: list[str] = []

    def __call__(self, mode) -> TailoringService:
        self.modes.append(mode)
        return self.service or resolve_tailoring(mode)


def make_create_use_case(
    application=None,
    base_cv=None,
    existing=None,
    tailoring_service: TailoringService | None = None,
    resolver: _RecordingResolver | None = None,
):
    """Wire ``CreateTailoredCVUseCase`` over mocked repositories.

    ``tailoring_service`` forces one binding whatever the mode; otherwise the
    production resolver picks it.
    """
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
        resolver or _RecordingResolver(tailoring_service),
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
        application=make_application(finalized_at=CLOSED_AT),
        base_cv=make_base_cv(),
    )

    with pytest.raises(
        ApplicationFinalized, match='Reopen the application to edit it'
    ):
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
        application=make_application(cycle_id=42, finalized_at=CLOSED_AT),
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


# --- tailoring: the resolver (ADR-0017, R-026/R-027) ------------------------


def test_the_resolver_dependency_is_the_production_resolver():
    assert get_tailoring_resolver() is resolve_tailoring


def test_the_resolver_maps_each_mode_to_its_binding():
    assert isinstance(resolve_tailoring('copy'), CloneTailoringService)
    assert isinstance(resolve_tailoring('keywords'), KeywordTailoringService)


def test_create_defaults_to_the_verbatim_copy():
    """R-027: a body without ``tailoring`` - an installed CLI - is a copy."""
    assert create_dto().tailoring == 'copy'


async def test_create_without_tailoring_resolves_the_clone():
    resolver = _RecordingResolver()
    base_cv = make_base_cv()
    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(job_description='Python and Go.'),
        base_cv=base_cv,
        resolver=resolver,
    )

    await use_case.execute(create_dto())

    assert resolver.modes == ['copy'], msg(['copy'], resolver.modes)
    result = tailored_cv_repo.create.call_args.kwargs['result']
    assert result.adjustments == []
    assert result.content.skills == base_cv.skills


@pytest.mark.parametrize('job_description', [None, '', '   \n\t'])
async def test_keywords_without_a_job_description_is_refused(job_description):
    """A refusal writes nothing and reads no master CV."""
    resolver = _RecordingResolver()
    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(job_description=job_description),
        base_cv=make_base_cv(),
        resolver=resolver,
    )

    with pytest.raises(
        BusinessRuleViolation,
        match='^Add a job description to tailor by keywords$',
    ):
        await use_case.execute(create_dto(tailoring='keywords'))

    tailored_cv_repo.create.assert_not_called()
    use_case.base_cv_repo.get_by_id_and_user_id.assert_not_called()
    assert resolver.modes == []


async def test_keywords_refusal_comes_after_the_editability_guard():
    use_case, _ = make_create_use_case(
        application=make_application(finalized_at=CLOSED_AT),
        base_cv=make_base_cv(),
    )

    with pytest.raises(ApplicationFinalized):
        await use_case.execute(create_dto(tailoring='keywords'))


async def test_keywords_refusal_comes_before_the_base_cv_lookup():
    """Order: 404 app -> editable -> blank JD 422 -> 404 base CV -> 409."""
    use_case, _ = make_create_use_case(
        application=make_application(job_description=''),
        base_cv=None,
        existing=make_tailored_cv(),
    )

    with pytest.raises(BusinessRuleViolation, match='job description'):
        await use_case.execute(create_dto(tailoring='keywords'))


async def test_copy_never_needs_a_job_description():
    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(job_description=None),
        base_cv=make_base_cv(),
    )

    await use_case.execute(create_dto(tailoring='copy'))

    tailored_cv_repo.create.assert_called_once()


async def test_keywords_with_a_job_description_runs_the_keyword_binding():
    resolver = _RecordingResolver()
    base_cv = make_base_cv(
        skills=[
            {'id': 's1', 'category': 'Web', 'keywords': ['React']},
            {'id': 's2', 'category': 'Data', 'keywords': ['SQL', 'Python']},
        ]
    )
    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(job_description='Python and SQL.'),
        base_cv=base_cv,
        resolver=resolver,
    )

    await use_case.execute(create_dto(tailoring='keywords'))

    assert resolver.modes == ['keywords']
    result = tailored_cv_repo.create.call_args.kwargs['result']
    snapshot = tailored_cv_repo.create.call_args.kwargs['base_snapshot']
    assert result.was_ai_generated is False
    assert [c.id for c in result.content.skills] == ['s2', 's1']
    assert [a.section for a in result.adjustments] == ['skills']
    # The diff baseline is the untouched master, not the reordered copy.
    assert [c.id for c in snapshot.skills] == ['s1', 's2']


async def test_create_logs_the_tailoring_mode(monkeypatch):
    from app.application.use_cases.tailored_cvs import create as create_module

    calls: list[dict] = []
    monkeypatch.setattr(
        create_module.logger,
        'info',
        lambda *args, **kwargs: calls.append(kwargs),
    )
    use_case, _ = make_create_use_case(
        application=make_application(job_description='Python.'),
        base_cv=make_base_cv(),
    )

    await use_case.execute(create_dto(tailoring='keywords'))

    assert calls[0]['extra']['extra_data']['tailoring'] == 'keywords'


# --- base_snapshot (R5, KODI-017 part 2) ------------------------------------


async def test_create_passes_the_master_cv_as_the_snapshot():
    """The snapshot is the master CV's content field for field, not the
    tailoring result - the two happen to be equal for the clone binding, but
    the snapshot must come from ``base_cv``, not from ``result.content``."""
    base_cv = make_base_cv(headline='Staff Backend Engineer')
    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(), base_cv=base_cv
    )

    await use_case.execute(create_dto())

    snapshot = tailored_cv_repo.create.call_args.kwargs['base_snapshot']
    assert snapshot is not None
    assert snapshot.headline == 'Staff Backend Engineer'
    for field in TailoredCVContent.model_fields:
        assert getattr(snapshot, field) == getattr(base_cv, field), field


async def test_create_snapshot_is_the_master_even_when_the_binding_diverges():
    """A binding whose ``content`` diverges from the master must not leak
    into the baseline: the snapshot always compares against the real master,
    exactly what makes it useful once a real tailoring model exists.

    Mutates a **nested** item in place (``experience[0].role``), not just a
    top-level scalar: pydantic v2 does not deep-copy nested model instances
    on ``model_validate``, so a snapshot built by validating straight from
    the master's DTO would still share those item objects with whatever the
    binding hands back in ``result.content``, and this in-place mutation
    would move the snapshot too if the use case did not force a real copy.
    """
    base_cv = make_base_cv(headline='Staff Backend Engineer')

    class _MutatingTailoringService:
        async def tailor(self, request: TailoringRequest):
            result = await CloneTailoringService().tailor(request)
            result.content.headline = 'Tailored Headline'
            result.content.experience[0].role = 'Tailored Role'
            return result

    use_case, tailored_cv_repo = make_create_use_case(
        application=make_application(),
        base_cv=base_cv,
        tailoring_service=_MutatingTailoringService(),
    )

    await use_case.execute(create_dto())

    snapshot = tailored_cv_repo.create.call_args.kwargs['base_snapshot']
    result = tailored_cv_repo.create.call_args.kwargs['result']
    assert snapshot.headline == 'Staff Backend Engineer', msg(
        'Staff Backend Engineer', snapshot.headline
    )
    assert snapshot.experience[0].role == 'Staff Engineer', msg(
        'Staff Engineer', snapshot.experience[0].role
    )
    assert result.content.headline == 'Tailored Headline'
    assert result.content.experience[0].role == 'Tailored Role'


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
        make_application(finalized_at=CLOSED_AT),
        make_application(cycle_id=42),
        make_application(cycle_id=42, finalized_at=CLOSED_AT),
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
        make_application(finalized_at=CLOSED_AT)
    )

    with pytest.raises(
        ApplicationFinalized, match='Reopen the application to edit it'
    ):
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
        make_application(finalized_at=CLOSED_AT)
    )

    with pytest.raises(
        ApplicationFinalized, match='Reopen the application to edit it'
    ):
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


# --- Fit (ADR-0017, R-028) --------------------------------------------------


def make_fit_use_case(application, tailored_cv=make_tailored_cv()):
    tailored_cv_repo = AsyncMock()
    application_repo = AsyncMock()
    application_repo.get_by_id_and_user_id.return_value = application
    tailored_cv_repo.get_by_application_id_and_user_id.return_value = (
        tailored_cv
    )
    return GetTailoredCVFitUseCase(tailored_cv_repo, application_repo)


async def test_fit_scores_the_copy_against_the_job_description():
    use_case = make_fit_use_case(
        make_application(job_description='Python and Haskell.')
    )

    fit = await use_case.execute(1, 1)

    assert fit == CVFitDTO(
        score=50, matched_keywords=['python'], missing_keywords=['haskell']
    ), fit


@pytest.mark.parametrize('job_description', [None, '', '  \n'])
async def test_fit_without_a_job_description_is_no_fit(job_description):
    use_case = make_fit_use_case(
        make_application(job_description=job_description)
    )

    fit = await use_case.execute(1, 1)

    assert fit == CVFitDTO(score=None, matched_keywords=[], missing_keywords=[])


@pytest.mark.parametrize(
    'application',
    [
        make_application(finalized_at=CLOSED_AT, job_description='Python'),
        make_application(cycle_id=42, job_description='Python'),
    ],
    ids=['finalized', 'archived'],
)
async def test_fit_is_allowed_on_a_read_only_application(application):
    fit = await make_fit_use_case(application).execute(1, 1)

    assert fit.score == 100


async def test_fit_application_not_owned_is_not_found():
    with pytest.raises(ResourceNotFound, match='Application not found'):
        await make_fit_use_case(None).execute(1, 1)


async def test_fit_without_a_copy_is_not_found():
    use_case = make_fit_use_case(make_application(), None)

    with pytest.raises(ResourceNotFound, match='CV copy not found'):
        await use_case.execute(1, 1)


async def test_fit_reads_drafts_too():
    use_case = make_fit_use_case(make_application(job_description='Python'))

    await use_case.execute(1, 1)

    use_case.application_repo.get_by_id_and_user_id.assert_awaited_once_with(
        1, 1, include_drafts=True
    )
