"""The beta-feature access rule (KODI-052, ADR-0018, T022).

``access_via`` is the rule as a pure function; the repository runs the same
predicate in SQL (proved against Postgres in
``tests/integration/test_feature_gating.py``). ``require_feature`` is driven
here against a fake repository that keeps features in a dict, so an unknown
key and the 404 body are checked without a database.
"""

from datetime import UTC, datetime
from typing import cast

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.dto.feature import FeatureAccessDTO
from app.application.dto.user import UserDTO
from app.application.use_cases.admin.features.common import to_admin_dto
from app.core.features import (
    AccessVia,
    FeatureKey,
    FeatureStage,
    access_via,
)
from app.domain.repositories.feature_repository import (
    FeatureRepository,
    FeatureRow,
)
from app.presentation.dependencies import (
    get_current_user,
    get_feature_repository,
    require_feature,
    user_has_feature,
)
from app.presentation.handlers import register_handlers

GENERAL = FeatureStage.GENERAL
BETA = FeatureStage.BETA

# (stage, listed, is_admin, opted_out) -> why the user has it, or None.
# Every one of the 16 combinations, written out rather than derived.
TRUTH_TABLE = [
    # general: everyone, whatever the list, the role or an opt-out says
    (GENERAL, False, False, False, AccessVia.GENERAL),
    (GENERAL, False, False, True, AccessVia.GENERAL),
    (GENERAL, False, True, False, AccessVia.GENERAL),
    (GENERAL, False, True, True, AccessVia.GENERAL),
    (GENERAL, True, False, False, AccessVia.GENERAL),
    (GENERAL, True, False, True, AccessVia.GENERAL),
    (GENERAL, True, True, False, AccessVia.GENERAL),
    (GENERAL, True, True, True, AccessVia.GENERAL),
    # beta, not listed: an admin without an opt-out only
    (BETA, False, False, False, None),
    (BETA, False, False, True, None),  # ex-admin's old opt-out: nothing
    (BETA, False, True, False, AccessVia.ADMIN),
    (BETA, False, True, True, None),  # opted-out admin
    # beta, listed: the list wins, an opt-out never removes it (R-017)
    (BETA, True, False, False, AccessVia.LIST),
    (BETA, True, False, True, AccessVia.LIST),  # ex-admin, listed
    (BETA, True, True, False, AccessVia.LIST),
    (BETA, True, True, True, AccessVia.LIST),
]


@pytest.mark.parametrize(
    ('stage', 'listed', 'is_admin', 'opted_out', 'expected'), TRUTH_TABLE
)
def test_access_via_truth_table(stage, listed, is_admin, opted_out, expected):
    assert access_via(stage, listed, is_admin, opted_out) == expected


def test_access_via_takes_the_stored_string_stage():
    """The repository hands the column's string, not the enum."""
    assert access_via('general', False, False, False) == AccessVia.GENERAL
    assert access_via('beta', False, False, False) is None


def test_general_beats_an_opt_out_and_beta_brings_it_back():
    """R-016: the same stored opt-out counts in beta, not in general."""
    assert access_via(GENERAL, False, True, True) == AccessVia.GENERAL
    assert access_via(BETA, False, True, True) is None


# ---------------------------------------------------------------------------
# The fake repository: the rule over a dict, for the dependency
# ---------------------------------------------------------------------------


class FakeFeatureRepository:
    def __init__(
        self,
        stages: dict[str, FeatureStage],
        listed: set[tuple[str, int]] | None = None,
        opted_out: set[tuple[str, int]] | None = None,
    ):
        self.stages = stages
        self.listed = listed or set()
        self.opted_out = opted_out or set()
        self.calls = 0

    async def has_feature(self, key: str, user_id: int, is_admin: bool):
        self.calls += 1
        stage = self.stages.get(key)
        if stage is None:
            return False
        return (
            access_via(
                stage,
                (key, user_id) in self.listed,
                is_admin,
                (key, user_id) in self.opted_out,
            )
            is not None
        )


def as_repo(fake: FakeFeatureRepository) -> FeatureRepository:
    return cast(FeatureRepository, fake)


def _user(user_id: int = 1, is_admin: bool = False) -> UserDTO:
    return UserDTO(
        id=user_id,
        username=f'user{user_id}',
        email=f'user{user_id}@user.com',
        is_admin=is_admin,
        created_at=datetime.now(UTC),
    )


@pytest.mark.parametrize('is_admin', [False, True])
async def test_unknown_key_is_hidden_from_everyone_admins_too(is_admin):
    """R-003: no row for the key means no feature, even for an admin."""
    repo = FakeFeatureRepository(stages={})
    has = await user_has_feature(
        FeatureKey.JOBS, _user(is_admin=is_admin), as_repo(repo)
    )
    assert has is False


async def test_user_has_feature_reads_the_repository_every_call():
    """R-012: no cache - two checks are two reads, and a change between them
    is seen by the second."""
    repo = FakeFeatureRepository(stages={'jobs': BETA})
    user = _user()
    assert not await user_has_feature(FeatureKey.JOBS, user, as_repo(repo))
    repo.listed = {('jobs', user.id)}
    assert await user_has_feature(FeatureKey.JOBS, user, as_repo(repo))
    assert repo.calls == 2


def _gated_app(repo: FakeFeatureRepository, user: UserDTO) -> FastAPI:
    app = FastAPI()
    register_handlers(app)

    @app.get('/gated', dependencies=[require_feature(FeatureKey.JOBS)])
    async def gated():
        return {'ok': True}

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_feature_repository] = lambda: repo
    return app


async def _get(app: FastAPI, path: str):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url='http://test'
    ) as client:
        return await client.get(path)


async def test_require_feature_without_it_is_the_unknown_route_404():
    app = _gated_app(FakeFeatureRepository(stages={'jobs': BETA}), _user())

    gated = await _get(app, '/gated')
    unknown = await _get(app, '/no-such-route')

    assert gated.status_code == 404
    assert gated.json() == {'detail': 'Not Found'}
    assert gated.content == unknown.content


async def test_require_feature_with_it_runs_the_route():
    repo = FakeFeatureRepository(stages={'jobs': BETA}, listed={('jobs', 1)})
    response = await _get(_gated_app(repo, _user()), '/gated')
    assert response.status_code == 200
    assert response.json() == {'ok': True}


async def test_require_feature_on_an_unknown_key_is_404_for_an_admin():
    app = _gated_app(FakeFeatureRepository(stages={}), _user(is_admin=True))
    response = await _get(app, '/gated')
    assert response.status_code == 404
    assert response.json() == {'detail': 'Not Found'}


# ---------------------------------------------------------------------------
# The admin row's ``me``: has / via / opted_out (R-014, R-017)
# ---------------------------------------------------------------------------


def _row(stage: str, listed: bool, opted_out: bool) -> FeatureRow:
    now = datetime.now(UTC)
    return FeatureRow(
        id=1,
        key='jobs',
        name='Job board',
        description=None,
        stage=stage,
        released_at=None,
        updated_at=now,
        beta_user_count=0,
        listed=listed,
        opted_out=opted_out,
    )


@pytest.mark.parametrize(
    ('stage', 'listed', 'opted_out', 'me'),
    [
        ('beta', False, False, FeatureAccessDTO(has=True, via=AccessVia.ADMIN, opted_out=False)),
        ('beta', False, True, FeatureAccessDTO(has=False, via=None, opted_out=True)),
        ('beta', True, True, FeatureAccessDTO(has=True, via=AccessVia.LIST, opted_out=True)),
        ('general', False, True, FeatureAccessDTO(has=True, via=AccessVia.GENERAL, opted_out=True)),
    ],
)  # fmt: skip
def test_admin_row_me_says_whether_and_why(stage, listed, opted_out, me):
    assert to_admin_dto(_row(stage, listed, opted_out)).me == me
