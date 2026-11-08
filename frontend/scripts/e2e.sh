#!/usr/bin/env bash
#
# frontend/scripts/e2e.sh — the single E2E entrypoint (local AND CI).
#
# Stands up the dedicated, ephemeral, isolated E2E stack
# (docker-compose.e2e.yml: the REAL API image + the REAL frontend image, a real
# Postgres migrated by `alembic upgrade head`, a real Redis and the fake
# Borderless OpenID provider), resets the fake, seeds a REAL session (no
# browser mocking — the seed binds each user to its fake Borderless account and
# mints a genuine cookie with the app's own token code), runs Playwright
# against that real front door, then tears everything down (always, via a
# trap). CI calls this same script so local and CI can't drift.
#
# Usage (from the repo root; from frontend/ run ./scripts/e2e.sh instead):
#   frontend/scripts/e2e.sh                 # full run: up -> seed -> playwright -> down
#   KEEP_STACK=1 frontend/scripts/e2e.sh    # leave the stack up afterwards (debugging)
#   frontend/scripts/e2e.sh <pw args>       # forwarded to `playwright test` (e.g. a spec)
#
# When Playwright fails, the API and fake Borderless logs are saved to
# frontend/test-results/e2e-stack.log before teardown.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.e2e.yml")
# The origin Playwright drives: the built frontend served by nginx.
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8180}"
# The origin the browser's XHRs hit. Same host (127.0.0.1), different port, so
# the seeded cookies — which ignore the port — are sent to it.
API_URL="${E2E_API_URL:-http://127.0.0.1:8100/api}"
# The fake Borderless (ADR-0026) on its published port: the browser's sign-in
# page, and the `/__fake/*` controls the specs drive.
BORDERLESS_URL="${E2E_BORDERLESS_URL:-http://127.0.0.1:8181}"

teardown() {
  if [[ "${KEEP_STACK:-0}" == "1" ]]; then
    echo "[e2e] KEEP_STACK=1 — leaving the stack running."
    return
  fi
  echo "[e2e] Tearing down the E2E stack (and volumes)..."
  "${COMPOSE[@]}" down -v --remove-orphans || true
}
trap teardown EXIT

echo "[e2e] Removing any previous stack (clean slate)..."
"${COMPOSE[@]}" down -v --remove-orphans || true

echo "[e2e] Building + starting the real app stack (migrates on start)..."
"${COMPOSE[@]}" up -d --build --wait

# applika has no /health route. openapi.json is served in every non-PROD
# environment, so it doubles as the readiness probe.
echo "[e2e] Waiting for the API at ${API_URL}/openapi.json ..."
for i in $(seq 1 60); do
  if curl -fsS "${API_URL}/openapi.json" >/dev/null 2>&1; then
    echo "[e2e] API is up and migrated."
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "[e2e] API did not become ready in time." >&2
    "${COMPOSE[@]}" logs api >&2 || true
    exit 1
  fi
  sleep 2
done

# The API reaches Borderless only through the fake (ADR-0026).
echo "[e2e] Waiting for the fake Borderless at ${BORDERLESS_URL}/health ..."
for i in $(seq 1 30); do
  if curl -fsS "${BORDERLESS_URL}/health" >/dev/null 2>&1; then
    echo "[e2e] Fake Borderless is up."
    break
  fi
  if [[ "$i" == "30" ]]; then
    echo "[e2e] Fake Borderless did not become ready in time." >&2
    "${COMPOSE[@]}" logs borderless-fake >&2 || true
    exit 1
  fi
  sleep 1
done

# BEFORE the seed: the seed binds each seeded user to its account's
# `seedRefreshToken`, and the first membership check spends it (rotation). A
# reset re-arms every seed token, so a second seed on a kept stack never
# writes a token the fake already rotated out (Plan corrections 10).
echo "[e2e] Resetting the fake Borderless ..."
curl -fsS -X POST "${BORDERLESS_URL}/__fake/reset" >/dev/null

echo "[e2e] Seeding real sessions (real user rows + real signed cookies)..."
SEED_JSON="$("${COMPOSE[@]}" exec -T api python -m app.scripts.seed_e2e)"
# Parse with node (always present alongside pnpm) — no jq dependency.
pick() { printf '%s' "$SEED_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).$1))"; }
E2E_USER_ID="$(pick user_id)"
E2E_ACCESS_TOKEN="$(pick access_token)"
E2E_REFRESH_TOKEN="$(pick refresh_token)"
E2E_ADMIN_USER_ID="$(pick admin_user_id)"
E2E_ADMIN_ACCESS_TOKEN="$(pick admin_access_token)"
E2E_ADMIN_REFRESH_TOKEN="$(pick admin_refresh_token)"
E2E_DISCORD_USER_ID="$(pick discord_user_id)"
E2E_DISCORD_ACCESS_TOKEN="$(pick discord_access_token)"
E2E_DISCORD_REFRESH_TOKEN="$(pick discord_refresh_token)"
# KODI-057: e2e-user's seeded CLI session (cli_device, "e2e-cli"). The CLI
# sends the access token as `Authorization: Bearer`.
E2E_CLI_ACCESS_TOKEN="$(pick cli_access_token)"
E2E_CLI_REFRESH_TOKEN="$(pick cli_refresh_token)"
export E2E_USER_ID E2E_ACCESS_TOKEN E2E_REFRESH_TOKEN
export E2E_ADMIN_USER_ID E2E_ADMIN_ACCESS_TOKEN E2E_ADMIN_REFRESH_TOKEN
export E2E_DISCORD_USER_ID E2E_DISCORD_ACCESS_TOKEN E2E_DISCORD_REFRESH_TOKEN
export E2E_CLI_ACCESS_TOKEN E2E_CLI_REFRESH_TOKEN
export E2E_BASE_URL="$BASE_URL" E2E_API_URL="$API_URL"
export E2E_BORDERLESS_URL="$BORDERLESS_URL"
echo "[e2e] Seeded user ${E2E_USER_ID}, admin ${E2E_ADMIN_USER_ID} and discord-linked user ${E2E_DISCORD_USER_ID}."

echo "[e2e] Running Playwright against the real front door ${BASE_URL} ..."
cd "$ROOT_DIR/frontend"
status=0
pnpm exec playwright test "$@" || status=$?

# A failed run keeps the API's and the fake Borderless's logs before the trap
# tears the stack down: frontend/test-results/ is the folder CI uploads on
# failure.
if [[ "$status" != "0" ]]; then
  LOG_FILE="$ROOT_DIR/frontend/test-results/e2e-stack.log"
  mkdir -p "$(dirname "$LOG_FILE")"
  "${COMPOSE[@]}" logs --no-color --timestamps api borderless-fake >"$LOG_FILE" 2>&1 || true
  echo "[e2e] Playwright failed (exit ${status}). API and fake Borderless logs: ${LOG_FILE}. Last API lines:" >&2
  "${COMPOSE[@]}" logs --no-color --tail 50 api >&2 || true
fi
exit "$status"
