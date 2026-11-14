# ADR-0015: API rate limiter in Redis, per user with an IP fallback

**Status:** Accepted by LuisMSoares on 2026-09-26 · Amended by ADR-0019 on 2026-10-15 · Amended by ADR-0025 on 2026-10-31 (the 429 carries `code` GEN-1004 and `params.seconds`) · **Date:** 2026-09-26 · **Deciders:** LuisMSoares

## Context

The owner, while planning PRD 0011: "drop pagination change for agenda and applications, instead,
let's implement a rate limiter to the api using redis, currently we dont have any." Applika has no
limiter today. Redis already backs refresh tokens, the GitHub token cache and the OAuth/link nonces
(`backend/app/config/redis.py`, ADR-0002). The limiter touches every route, including
the routes that installed `applika-cli` versions call (ADR-0009). It also touches the deploy, because
the client address has to survive the Docker Swarm hop (ADR-0010). Selected: "Per user, per IP fallback
(Recommended)" and "Config defaults + 429 (Recommended)".

## Decision

- One pure ASGI middleware counts every HTTP request in Redis. It is installed inside the CORS
  middleware, so a 429 carries the CORS headers and a browser preflight (`OPTIONS`) is answered
  before it is counted. No new dependency: `redis.asyncio` is already in the stack.
- Subject: a request whose `__access` cookie holds a valid, unexpired access token is counted
  against that token's subject (the user). Any other request is counted against the client IP.
- The client IP is the connection address as uvicorn resolves it. uvicorn honours
  `X-Forwarded-For` only from the proxies listed in `FORWARDED_ALLOW_IPS`. The limiter never reads
  the raw header, because anyone can forge it.
- The trusted proxy in production is Traefik on the VPS swarm. The owner: "this app runs in a vps with
  traefik". `FORWARDED_ALLOW_IPS` is the subnet of the overlay network Traefik uses to reach the
  API, and the owner sets it in the stack env at deploy. The subnet comes from
  `docker network inspect <traefik-network> --format '{{(index .IPAM.Config 0).Subnet}}'`. Until it
  is set, the stack runs `RATE_LIMIT_AUTH` raised (e.g. 600).
- Two buckets, counted separately: `/auth/*` uses `RATE_LIMIT_AUTH` (default 10), and every other
  route uses `RATE_LIMIT_DEFAULT` (default 120). Both count within one fixed window of
  `RATE_LIMIT_WINDOW_SECONDS` (default 60). `RATE_LIMIT_ENABLED` (default true) switches the limiter
  on or off. All four are environment settings, so changing them takes a restart, not a release.
- Keys: `applika:ratelimit:{bucket}:{subject}:{window}`. Each request runs `INCR` and `EXPIRE` in
  one pipeline. A key expires one second after its window ends.
- Over the limit: `429`, `{"detail": "Too many requests. Try again in <n> seconds."}`,
  `Retry-After: <n>`, and `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
  The route handler does not run. Every counted response carries the three `X-RateLimit-*` headers.
  CORS exposes them and `Retry-After`.
- Redis unreachable or failing: the request passes (fail open), no `X-RateLimit-*` header is set,
  and a WARNING is logged.
- No route, request field or response field changes. `backend/CHANGELOG.md` and
  `cli/CHANGELOG.md` both record 429 as a new possible response on every route
  (`.claude/rules/changelogs.md`).

## Consequences

- A signed-in user's web tabs, devices and CLI share one quota. Two users behind one IP address do
  not share a quota while they are signed in.
- Requests without a session share their IP's quota. Without `FORWARDED_ALLOW_IPS`, uvicorn sees
  Traefik's overlay address for every request, and all anonymous traffic lands in one bucket,
  including sign-in and session refresh. Deploy order (plan 0011, `## Release`):
  1. Raise `RATE_LIMIT_AUTH`.
  2. Set `FORWARDED_ALLOW_IPS` to the Traefik overlay subnet.
  3. Check that the request log `client_ip` shows real, varying addresses.
  4. Drop the raise.
- If Traefik's own ports are published through the swarm ingress mesh instead of `mode: host`,
  Traefik itself sees ingress addresses and forwards them. The check in step 3 catches this. The fix
  is to publish Traefik's ports in `mode: host`, and until then `RATE_LIMIT_AUTH` stays raised.
- The web app must treat a 429 on `GET /auth/refresh` as temporary. Today any refresh error signs
  the user out (`frontend/src/contexts/auth-context.tsx`).
- Installed CLIs show the 429 `detail` through their normal error path. They do not retry.
- Amended 2026-09-27 by the owner: "Fix in a new CLI version". Installed `applika-cli` 0.1.4, 0.2.0
  and 1.0.0 clear the stored session when `GET /auth/refresh` answers 429, so their users log in
  again. A new CLI version (1.0.1, plan 0011 S4) treats a 429 on refresh as temporary: it keeps the
  session and fails with the server's message, with no wait and no retry. Old versions keep their
  behaviour (`.claude/rules/cli-compatibility.md` 4).
- Test suites switch the limiter off by default. The dev and e2e compose stacks raise the limits.
  The seed script waits out a 429.
- A fixed window lets a client send up to twice the limit across a window boundary. This is accepted.
- As built, 2026-09-27 (plan 0011 K5). The Decision above holds as written. Three build
  details:
  - The request log `client_ip` (`backend/app/config/middleware.py`) is now the address
    uvicorn resolved (`request.client.host`). It no longer reads the raw `X-Forwarded-For`, so a
    forged header does not change it. It is the same address the limiter counts. The check in
    deploy step 3 reads this value.
  - The limiter's Redis call (`INCR` + `EXPIREAT` in one pipeline, `backend/app/core/rate_limit.py`)
    is bounded by a 0.5 s timeout, a module constant and not a setting. A timeout fails open with
    the same WARNING (`rate_limit_unavailable`) as an unreachable Redis.
  - The owner's CLI ruling is the 2026-09-27 amendment above. `applika-cli` 1.0.1 was built as
    amended: a 429 on the session refresh keeps `session.json` and fails with the
    server's message. `whoami`, `applications list` and the deprecated `steps` commands show that
    message as the last line of Typer's exception output, with exit code 1. That is how 1.0.0
    already shows any API error in those commands (plan 0011 tasks, Plan corrections 15).
- Amended 2026-10-31 by ADR-0025 (PRD 0019). The 429 body adds `"code": "GEN-1004"` and `"params": {"seconds": <n>}`
  next to the unchanged `detail`: `{"detail": "Too many requests. Try again in <n> seconds.", "code": "GEN-1004",
  "params": {"seconds": <n>}}`. The status, `Retry-After` and the `X-RateLimit-*` headers do not change. Installed
  CLIs read `detail` as before.

## Non-goals

- Per-route limits beyond the two buckets, per-plan quotas, and admin exemptions.
- Network-edge or DDoS protection.
- Retry logic in `applika-cli`.

## Open questions

- None. The proxy question was closed on 2026-09-26: it is Traefik, and its overlay subnet goes into `FORWARDED_ALLOW_IPS` at deploy.
