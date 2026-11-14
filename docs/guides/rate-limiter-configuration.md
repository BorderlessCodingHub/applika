# Applika API rate limiter: configuration guide

2026-09-27 · LuisMSoares · PRD 0011, ADR 0015

The API limits each signed-in user, or each IP address without a session, to a fixed number of
requests per minute, stored in Redis. You configure it with environment variables on the API
service and a restart; no release is needed.

## Settings

Set these on the API service's environment (swarm stack env in production, `environment:` in
compose locally), then restart the API. Values are read on every request.

| Variable | Default | What it controls |
| --- | --- | --- |
| `RATE_LIMIT_ENABLED` | `true` | Turns the limiter on or off. Off means no counting, no `X-RateLimit-*` headers and no 429. |
| `RATE_LIMIT_DEFAULT` | `120` | Requests allowed per window, per user or IP, on every route outside `/auth/*`. |
| `RATE_LIMIT_AUTH` | `10` | Requests allowed per window, per user or IP, on `/auth/*` (sign-in, session refresh, logout, CLI login). |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Width of the counting window, in seconds. Both limits share it. |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` (uvicorn's default) | Proxies whose `X-Forwarded-For` header uvicorn trusts to find the real client IP. Read by uvicorn, not by Applika code. |

The first four live in `backend/app/config/settings.py`. The limiter itself is
`app/config/rate_limit.py` (middleware) and `app/core/rate_limit.py` (counting). The design is
recorded in `docs/adr/0015-redis-api-rate-limiter.md`.

## How requests are counted

Each request adds one to a counter chosen by bucket, subject and window.

- **Bucket.** A path starting with `/auth/` counts against `RATE_LIMIT_AUTH`; every other path
  against `RATE_LIMIT_DEFAULT`. The two are separate: using up one does not touch the other. A
  `root_path` prefix such as `/api` is stripped first, so `/api/auth/refresh` lands in the auth
  bucket.
- **Subject.** A request with a valid, unexpired `__access` session cookie counts against that
  user. Anything else (no cookie, expired, forged) counts against the client IP. Two signed-in
  users on one IP keep separate counts.
- **Window.** Fixed windows of `RATE_LIMIT_WINDOW_SECONDS`, aligned to the clock. The count resets
  when the window ends, so a client can send up to twice the limit across a window boundary.
- **Not counted.** Browser preflight requests (`OPTIONS`), and every request while
  `RATE_LIMIT_ENABLED` is false.
- **Redis key.** `applika:ratelimit:{bucket}:{subject}:{window index}`, expiring one second after
  its window ends. No cleanup is needed.
- **Redis down.** If Redis errors or takes more than 0.5 s, the request goes through without
  rate-limit headers and the API logs a WARNING `rate_limit_unavailable`. The limiter never blocks
  traffic because of Redis.

## What a client sees

Under the limit, every counted answer carries three headers. Over it, the API answers 429 and the
route never runs, so nothing is written.

| Header or field | Under the limit | Over the limit (429) |
| --- | --- | --- |
| `X-RateLimit-Limit` | The bucket's limit | The bucket's limit |
| `X-RateLimit-Remaining` | Requests left in this window | `0` |
| `X-RateLimit-Reset` | Seconds until the window ends | Seconds until the window ends |
| `Retry-After` | not sent | Seconds until the window ends |
| Body | The normal answer | `{"detail": "Too many requests. Try again in <n> seconds."}` |

CORS exposes all four headers, so the web app can read them from another origin.

- **Web app.** A 429 on session refresh or `/users/me` keeps the user signed in and retries after
  `Retry-After`. Other refused requests show the server's message in the usual error toast.
- **applika-cli 1.0.1.** A 429 on the automatic session refresh keeps the stored session; the
  command prints the message and exits 1. Run it again after the wait.
- **applika-cli 0.1.4, 0.2.0, 1.0.0.** Other commands print the message and exit 1. A 429 on the
  session refresh deletes the stored session, so the user must run `applika login` again.

## Production behind Traefik

Set `FORWARDED_ALLOW_IPS` to Traefik's overlay subnet before the `/auth/*` limit drops to 10.
Without it, uvicorn sees Traefik's address on every request, so all signed-out visitors share one
IP count and 10 sign-ins per minute would lock everyone out.

The API image runs uvicorn with its default proxy-header handling, so no Dockerfile change is
needed. uvicorn only trusts `X-Forwarded-For` from the addresses in `FORWARDED_ALLOW_IPS`, and the
limiter never reads the raw header, so a visitor cannot fake their IP.

1. Deploy the release with `RATE_LIMIT_AUTH=600` set on the API service.
2. Find the network Traefik uses to reach the API, then read its subnet:

   ```bash
   docker network inspect <traefik-network> --format '{{(index .IPAM.Config 0).Subnet}}'
   ```

3. Set `FORWARDED_ALLOW_IPS=<that subnet>` on the API service and run `docker service update`.
4. Watch the API request log. `client_ip` should show real visitor addresses that vary, not `10.x`
   overlay addresses.
5. If it still shows overlay addresses, Traefik's own ports go through the swarm ingress mesh.
   Publish Traefik's ports with `mode: host` and keep `RATE_LIMIT_AUTH` raised until step 4
   passes.
6. Remove `RATE_LIMIT_AUTH=600` so the default of 10 applies, and restart.

To switch the limiter off in an emergency, set `RATE_LIMIT_ENABLED=false` and restart. To roll
back the release, point the stack at the previous image; the Redis keys expire within about a
minute.

## Local, test and E2E stacks

The limiter stays switched on everywhere except the backend test suite, with limits high enough
that normal work never hits them.

| Where | Setting | Effect |
| --- | --- | --- |
| `docker-compose.yml` (dev) | `RATE_LIMIT_DEFAULT: "100000"`, `RATE_LIMIT_AUTH: "10000"` | On, never reached in a dev session |
| `docker-compose.e2e.yml` | Same values | On while Playwright runs the full suite |
| Backend tests (`tests/conftest.py`) | `RATE_LIMIT_ENABLED = False` for the session | Off; the limiter tests turn it on with `monkeypatch` |
| Seed script (`scripts/seed_mock_data.py`) | none | Waits `Retry-After` and retries once on a 429 |

To try the limiter by hand, lower the limits in the dev compose file (for example
`RATE_LIMIT_DEFAULT: "10"`, `RATE_LIMIT_AUTH: "3"`) and restart the API container. Below about 10,
a single page load of the web app (around 8 requests) uses up the default limit on its own.

## Tuning and troubleshooting

The `/auth/*` limit of 10 is the tight one: each full page load of the web app sends two
`GET /auth/refresh` calls, so about 5 reloads a minute from one address reach it.

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Many users get 429 on sign-in at once | `FORWARDED_ALLOW_IPS` unset or wrong, so everyone shares Traefik's IP | Check `client_ip` in the request log; set the subnet (Production steps 2-4) |
| Users behind one office or NAT hit 429 on sign-in | They share one IP count on `/auth/*` before signing in | Raise `RATE_LIMIT_AUTH` |
| Reloading pages quickly triggers 429 | Two refresh calls per page load use 2 of the 10 | Raise `RATE_LIMIT_AUTH`, or remove the duplicate refresh call (open follow-up) |
| Applications page says "Found N applications" with no rows | `/supports` got a 429 and the list renders nothing until the next refetch | Raise `RATE_LIMIT_DEFAULT`; the blank state is an open follow-up |
| No `X-RateLimit-*` headers on any answer | Limiter off, or Redis unreachable | Check `RATE_LIMIT_ENABLED`; search the log for `rate_limit_unavailable` |
| CLI 1.0.0 or older users asked to log in again | A 429 on their automatic session refresh | Ask them to upgrade to applika-cli 1.0.1 |

To check the headers from a shell, run
`curl -si https://<api host>/users/me -b '__access=<token>' | grep -i ratelimit`, then repeat it to
watch `X-RateLimit-Remaining` fall.
