# applika: shortcuts for the quality gates, the local Docker stack and the
# fake Borderless sign-in. Run from the repository root.
#
#   make help             list the targets
#   make leaks            gitleaks: no secret in any commit or pending change
#   make full-gate        leaks, then api-gate, front-gate, cli-gate and e2e-gate in a row
#   make up-build         build and start the local stack (docker-compose.yml)
#   make run-fake-auth    start the fake Borderless for hand tests on that stack

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose

# gitleaks, configured by .gitleaks.toml, with the old findings in .gitleaksignore.
# A gitleaks on the PATH is used when there is one; otherwise the pinned image runs
# in Docker, so nothing has to be installed.
GITLEAKS_VERSION ?= 8.30.1
GITLEAKS ?= $(if $(shell command -v gitleaks 2>/dev/null),gitleaks,docker run --rm --user "$$(id -u):$$(id -g)" -v "$(CURDIR):/repo" -w /repo ghcr.io/gitleaks/gitleaks:v$(GITLEAKS_VERSION))
GITLEAKS_FLAGS := --no-banner --redact --verbose --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore

# The fake Borderless OpenID Connect provider (ADR-0026 §12), run on its own
# test-only image with plain `docker run`, never as part of a compose file.
# It joins the local stack's network so the api container reaches it by
# container name, and publishes its port on 127.0.0.1 for the browser.
FAKE_AUTH_DIR        := backend/tests/fixtures/borderless
FAKE_AUTH_IMAGE      := applika-fake-auth
FAKE_AUTH_CONTAINER  := applika-fake-auth
FAKE_AUTH_NETWORK    := applika_default
FAKE_AUTH_PORT       ?= 8081
# What the API calls (discovery, token, JWKS, revoke) and the id_token `iss`.
# For an API run on the host instead of in Docker, override it:
#   make run-fake-auth FAKE_AUTH_ISSUER=http://127.0.0.1:8081/api/auth
FAKE_AUTH_ISSUER     ?= http://$(FAKE_AUTH_CONTAINER):8081/api/auth
# Where the browser opens the fake's sign-in page.
FAKE_AUTH_PUBLIC_URL ?= http://127.0.0.1:$(FAKE_AUTH_PORT)

.PHONY: help leaks front-gate api-gate cli-gate e2e-gate full-gate \
        up build up-build stop run-fake-auth stop-fake-auth

help: ## List the targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*## "} {printf "  make %-16s %s\n", $$1, $$2}'

# ---- Quality gates: check only, nothing is rewritten -------------------------

# Every commit in the history, then the staged and the unstaged changes. New
# files are scanned once they are staged. A finding prints redacted and fails.
leaks: ## Secrets: gitleaks on every commit and on staged and unstaged changes
	$(GITLEAKS) git $(GITLEAKS_FLAGS) .
	$(GITLEAKS) git $(GITLEAKS_FLAGS) --pre-commit --staged .
	$(GITLEAKS) git $(GITLEAKS_FLAGS) --pre-commit .

front-gate: ## Frontend: eslint, prettier, tsc, vitest (unit + integration)
	cd frontend && pnpm lint
	cd frontend && pnpm format:check
	cd frontend && pnpm typecheck
	cd frontend && pnpm test

api-gate: ## Backend: ruff format check, ruff check, ty, pytest (unit + integration, coverage >= 90%)
	cd backend && uv run ruff format --check ./app
	cd backend && uv run ruff check ./app
	cd backend && uv run ty check
	cd backend && uv run pytest . --cov=app --cov-fail-under=90

cli-gate: ## CLI: ruff format check, ruff check, pytest
	cd cli && uv run ruff format --check .
	cd cli && uv run ruff check .
	cd cli && uv run pytest tests -q

e2e-gate: ## E2E: Playwright on the real stack (docker-compose.e2e.yml, torn down after)
	frontend/scripts/e2e.sh

full-gate: ## Every gate in one command: leaks first, then api, front, cli and e2e
	$(MAKE) leaks
	$(MAKE) api-gate
	$(MAKE) front-gate
	$(MAKE) cli-gate
	$(MAKE) e2e-gate

# ---- Local stack (docker-compose.yml), detached ------------------------------

up: ## Start the local stack, detached (web :8080, api :8000)
	$(COMPOSE) up -d --wait

build: ## Build the local stack's images
	$(COMPOSE) build

up-build: ## Build, then start the local stack, detached
	$(COMPOSE) up -d --build --wait

stop: ## Stop the local stack (keeps containers, data and the network)
	$(COMPOSE) stop

# ---- Fake Borderless for hand tests ------------------------------------------
# Stop it (make stop-fake-auth) before `docker compose down`: a container still
# attached to applika_default keeps compose from removing the network.

run-fake-auth: ## Start the fake Borderless in one detached container and print the envs to use it
	docker build -t $(FAKE_AUTH_IMAGE) $(FAKE_AUTH_DIR)
	@docker rm -f $(FAKE_AUTH_CONTAINER) >/dev/null 2>&1 || true
	@# The stack's network, created with compose's labels when the stack has
	@# never run, so a later `make up` adopts it instead of refusing it.
	@docker network inspect $(FAKE_AUTH_NETWORK) >/dev/null 2>&1 \
		|| docker network create \
			--label com.docker.compose.project=applika \
			--label com.docker.compose.network=default \
			$(FAKE_AUTH_NETWORK) >/dev/null
	docker run -d --name $(FAKE_AUTH_CONTAINER) \
		--network $(FAKE_AUTH_NETWORK) \
		-p 127.0.0.1:$(FAKE_AUTH_PORT):8081 \
		$(FAKE_AUTH_IMAGE) \
		--issuer $(FAKE_AUTH_ISSUER) \
		--public-url $(FAKE_AUTH_PUBLIC_URL)
	@for i in $$(seq 1 30); do \
		status=$$(docker inspect -f '{{.State.Health.Status}}' $(FAKE_AUTH_CONTAINER) 2>/dev/null); \
		[ "$$status" = healthy ] && break; \
		if [ "$$i" = 30 ]; then \
			echo "The fake Borderless did not become healthy. Its logs:" >&2; \
			docker logs $(FAKE_AUTH_CONTAINER) >&2; exit 1; \
		fi; \
		sleep 1; \
	done
	@key=$$(python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())'); \
	echo ""; \
	echo "Fake Borderless is running, detached, as container $(FAKE_AUTH_CONTAINER)."; \
	echo "  health:   $(FAKE_AUTH_PUBLIC_URL)/health"; \
	echo "  issuer:   $(FAKE_AUTH_ISSUER)"; \
	echo "  controls: $(FAKE_AUTH_PUBLIC_URL)/__fake/log, POST /__fake/reset, POST /__fake/accounts/<sub>"; \
	echo ""; \
	echo "To sign in through it, set these in .env at the repository root (docker compose reads it),"; \
	echo "then run 'make up' so api, worker and scheduler restart with them:"; \
	echo ""; \
	echo "  BORDERLESS_ISSUER=$(FAKE_AUTH_ISSUER)"; \
	echo "  BORDERLESS_CLIENT_ID=applika-fake-client"; \
	echo "  BORDERLESS_CLIENT_SECRET=applika-fake-client-secret-not-real"; \
	echo "  BORDERLESS_REDIRECT_URI=http://127.0.0.1:8000/api/auth/borderless/callback"; \
	echo "  BORDERLESS_TOKEN_ENCRYPTION_KEY=$$key"; \
	echo "  WEB_SIGNIN_URI=http://127.0.0.1:8080/login"; \
	echo ""; \
	echo "  The key above is freshly generated; any Fernet key works. Keep it once set:"; \
	echo "  changing it makes stored Borderless refresh tokens unreadable (users sign in again)."; \
	echo "  The client id and secret are the fake's synthetic client, never the real one."; \
	echo ""; \
	echo "API on the host (uv run task run) instead of in Docker? Restart the fake with"; \
	echo "  make run-fake-auth FAKE_AUTH_ISSUER=http://127.0.0.1:$(FAKE_AUTH_PORT)/api/auth"; \
	echo "and put the same variables in the API's environment, with that issuer."; \
	echo ""; \
	echo "Sign in on the fake's page with an account from $(FAKE_AUTH_DIR)/accounts.json:"; \
	python3 -c 'import json; d = json.load(open("$(FAKE_AUTH_DIR)/accounts.json")); [print("  %-32s %-26s %s%s" % (a["email"], a["password"], a["membership"], "" if a.get("email_verified", True) else ", email unverified")) for a in d["accounts"]]'; \
	echo ""; \
	echo "Stop it with: make stop-fake-auth"

stop-fake-auth: ## Stop and remove the fake Borderless container
	@docker rm -f $(FAKE_AUTH_CONTAINER) >/dev/null 2>&1 \
		&& echo "Fake Borderless stopped and removed." \
		|| echo "No $(FAKE_AUTH_CONTAINER) container to stop."
	@echo "If .env still points BORDERLESS_* at the fake, sign-in fails until you change it and run 'make up'."
