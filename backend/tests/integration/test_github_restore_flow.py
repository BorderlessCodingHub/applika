"""The GitHub restore end to end (ADR-0024), with the fake GitHub OAuth
service: ``POST /auth/github/restore`` then ``GET /auth/github/callback``,
always a 307 to ``ACCOUNT_LINK_REDIRECT_URI?account=github&status=...``.
"""

from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.application.services.github_service import GitHubIdentity
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.tokens import decode_token
from app.domain.models import (
    BorderlessAccountModel,
    CycleModel,
    GithubConnectionModel,
    UserModel,
)
from tests.conftest import FakeGitHubOAuthService, bind_borderless
from tests.sessions_seed import open_session

OLD_ID = 1
NEW_ID = 900
GITHUB_ID = 4242


async def _setup(db_session, async_engine, redis_client, *, old_row=True):
    db_session.add(UserModel(id=NEW_ID, username='new', email='new@x.io'))
    await db_session.commit()
    await bind_borderless(db_session, NEW_ID, borderless_id='bl-new')
    if old_row:
        db_session.add(
            GithubConnectionModel(
                user_id=OLD_ID,
                github_id=GITHUB_ID,
                username='octocat',
                linked_at=datetime.now(UTC),
            )
        )
        await db_session.commit()
    return await open_session(async_engine, redis_client, NEW_ID)


async def _restore(client: AsyncClient, access: str, code='the-code'):
    begin = await client.post(
        '/auth/github/restore', cookies={ACCESS_COOKIE_NAME: access}
    )
    assert begin.status_code == 200, begin.text
    url = begin.json()['authorize_url']
    query = parse_qs(urlparse(url).query)
    assert query['scope'] == ['read:user']
    state = query['state'][0]
    return await client.get(
        '/auth/github/callback',
        params={'code': code, 'state': state},
        cookies={ACCESS_COOKIE_NAME: access},
        follow_redirects=False,
    )


def _status(response) -> str:
    assert response.status_code == 307
    location = urlparse(response.headers['location'])
    assert location._replace(query='').geturl() == (
        envs.ACCOUNT_LINK_REDIRECT_URI
    )
    query = parse_qs(location.query)
    assert query['account'] == ['github']
    return query['status'][0]


async def test_restored_signs_in_as_the_old_account_and_deletes_the_new(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    github_oauth: FakeGitHubOAuthService,
):
    tokens = await _setup(db_session, async_engine, redis_client)

    response = await _restore(real_client, tokens.access_token)

    assert _status(response) == 'restored'
    access = response.cookies.get(ACCESS_COOKIE_NAME)
    assert decode_token(access or '')['sub'] == str(OLD_ID)
    me = await real_client.get('/users/me', cookies={ACCESS_COOKIE_NAME: access})
    assert me.json()['id'] == str(OLD_ID)
    assert me.json()['github_id'] == GITHUB_ID
    assert [b['badge'] for b in me.json()['badges']] == ['borderless_psp']
    db_session.expire_all()
    assert await db_session.get(UserModel, NEW_ID) is None
    binding = await db_session.scalar(select(BorderlessAccountModel))
    assert binding.user_id == OLD_ID
    old_session = await real_client.get(
        '/users/me', cookies={ACCESS_COOKIE_NAME: tokens.access_token}
    )
    assert old_session.status_code == 401
    # The grant was used once and revoked; no GitHub token is stored.
    assert github_oauth.revoked == ['gho_the-code']
    assert 'gho_' not in response.text


async def test_not_found_stores_nothing(
    real_client: AsyncClient, async_engine, db_session, redis_client
):
    tokens = await _setup(db_session, async_engine, redis_client, old_row=False)
    response = await _restore(real_client, tokens.access_token)
    assert _status(response) == 'not_found'
    assert ACCESS_COOKIE_NAME not in response.cookies
    rows = list(await db_session.scalars(select(GithubConnectionModel)))
    assert rows == []


async def test_has_data_refuses(
    real_client: AsyncClient, async_engine, db_session, redis_client
):
    tokens = await _setup(db_session, async_engine, redis_client)
    db_session.add(CycleModel(user_id=NEW_ID, name='mine'))
    await db_session.commit()
    response = await _restore(real_client, tokens.access_token)
    assert _status(response) == 'has_data'
    assert await db_session.get(UserModel, NEW_ID) is not None


async def test_already_bound_refuses(
    real_client: AsyncClient, async_engine, db_session, redis_client
):
    tokens = await _setup(db_session, async_engine, redis_client)
    await bind_borderless(db_session, OLD_ID, borderless_id='bl-old')
    response = await _restore(real_client, tokens.access_token)
    assert _status(response) == 'already_bound'


@pytest.mark.parametrize(
    'case', ['bad-state', 'no-code', 'no-session', 'exchange', 'identity']
)
async def test_every_failure_is_status_error(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    github_oauth: FakeGitHubOAuthService,
    case,
):
    tokens = await _setup(db_session, async_engine, redis_client)
    begin = await real_client.post(
        '/auth/github/restore',
        cookies={ACCESS_COOKIE_NAME: tokens.access_token},
    )
    state = parse_qs(urlparse(begin.json()['authorize_url']).query)['state'][0]
    params = {'code': 'c', 'state': state}
    cookies = {ACCESS_COOKIE_NAME: tokens.access_token}
    if case == 'bad-state':
        params['state'] = 'forged'
    elif case == 'no-code':
        params = {'state': state, 'error': 'access_denied'}
    elif case == 'no-session':
        cookies = {}
    elif case == 'exchange':
        github_oauth.exchange_error = True
    elif case == 'identity':
        github_oauth.identity = None

    response = await real_client.get(
        '/auth/github/callback',
        params=params,
        cookies=cookies,
        follow_redirects=False,
    )

    assert _status(response) == 'error'
    assert await db_session.get(UserModel, NEW_ID) is not None


async def test_a_nonce_is_one_use(
    real_client: AsyncClient, async_engine, db_session, redis_client
):
    tokens = await _setup(db_session, async_engine, redis_client, old_row=False)
    first = await _restore(real_client, tokens.access_token)
    assert _status(first) == 'not_found'
    replay = await real_client.get(
        '/auth/github/callback',
        params=dict(first.request.url.params),
        cookies={ACCESS_COOKIE_NAME: tokens.access_token},
        follow_redirects=False,
    )
    assert _status(replay) == 'error'


async def test_another_users_nonce_is_refused(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    github_oauth: FakeGitHubOAuthService,
):
    tokens = await _setup(db_session, async_engine, redis_client)
    begin = await real_client.post(
        '/auth/github/restore',
        cookies={ACCESS_COOKIE_NAME: tokens.access_token},
    )
    state = parse_qs(urlparse(begin.json()['authorize_url']).query)['state'][0]
    other = await open_session(async_engine, redis_client, 2)
    response = await real_client.get(
        '/auth/github/callback',
        params={'code': 'c', 'state': state},
        cookies={ACCESS_COOKIE_NAME: other.access_token},
        follow_redirects=False,
    )
    assert _status(response) == 'error'
    assert github_oauth.codes == []


async def test_restore_begin_refusals(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    github_oauth: FakeGitHubOAuthService,
):
    assert (await real_client.post('/auth/github/restore')).status_code == 401
    db_session.add(
        GithubConnectionModel(
            user_id=OLD_ID,
            github_id=1,
            username='old',
            linked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    old = await open_session(async_engine, redis_client, OLD_ID)
    cookies = {ACCESS_COOKIE_NAME: old.access_token}
    taken = await real_client.post('/auth/github/restore', cookies=cookies)
    assert taken.status_code == 409
    assert taken.json() == {'detail': 'This account already has its GitHub data'}
    github_oauth.configured = False
    off = await real_client.post('/auth/github/restore', cookies=cookies)
    assert off.status_code == 503
    assert off.json() == {'detail': 'GitHub restore is not configured'}


async def test_identity_is_read_once_from_github_never_from_borderless(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    github_oauth: FakeGitHubOAuthService,
):
    """The old account is found by the identity GitHub answers, nothing
    else (the Borderless profile's GitHub field is never read)."""
    tokens = await _setup(db_session, async_engine, redis_client)
    github_oauth.identity = GitHubIdentity(id=GITHUB_ID + 1, login='octocat')
    response = await _restore(real_client, tokens.access_token)
    assert _status(response) == 'not_found'
