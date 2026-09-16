#!/usr/bin/env bash
#
# scripts/e2e.sh — the single E2E entrypoint (local AND CI).
#
# Stands up the dedicated, ephemeral, isolated E2E stack
# (docker-compose.e2e.yml: the REAL API image + the REAL frontend image, a real
# Postgres migrated by `alembic upgrade head` and a real Redis), seeds a REAL
# session (no browser mocking — GitHub OAuth can't run headless, so we mint a
# genuine cookie with the app's own token code), runs Playwright against that
# real front door, then tears everything down (always, via a trap). CI calls
# this same script so local and CI can't drift.
#
# Usage:
#   scripts/e2e.sh                 # full run: up -> seed -> playwright -> down
#   KEEP_STACK=1 scripts/e2e.sh    # leave the stack up afterwards (debugging)
#   scripts/e2e.sh <pw args>       # forwarded to `playwright test` (e.g. a spec)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.e2e.yml")
# The origin Playwright drives: the built frontend served by nginx.
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8180}"
# The origin the browser's XHRs hit. Same host (127.0.0.1), different port, so
# the seeded cookies — which ignore the port — are sent to it.
API_URL="${E2E_API_URL:-http://127.0.0.1:8100/api}"

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
export E2E_USER_ID E2E_ACCESS_TOKEN E2E_REFRESH_TOKEN
export E2E_ADMIN_USER_ID E2E_ADMIN_ACCESS_TOKEN E2E_ADMIN_REFRESH_TOKEN
export E2E_BASE_URL="$BASE_URL" E2E_API_URL="$API_URL"
echo "[e2e] Seeded user ${E2E_USER_ID} and admin ${E2E_ADMIN_USER_ID}."

echo "[e2e] Running Playwright against the real front door ${BASE_URL} ..."
cd "$ROOT_DIR/frontend"
pnpm exec playwright test "$@"
