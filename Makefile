# applika: shortcuts for the quality gates and the local Docker stack. Run from
# the repository root.
#
#   make help             list the targets
#   make leaks            gitleaks: no secret in any commit or pending change
#   make full-gate        leaks, then api-gate, front-gate and e2e-gate in a row
#   make up-build         build and start the local stack (docker-compose.yml)

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose

# gitleaks, configured by .gitleaks.toml, with the old findings in .gitleaksignore.
# A gitleaks on the PATH is used when there is one; otherwise the pinned image runs
# in Docker, so nothing has to be installed. The image mounts the checkout at its
# own path, plus the git common dir read-only: inside a git worktree the history
# lives there, outside the checkout, and the worktree's .git file names it by its
# absolute path. In a plain checkout the common dir is $(CURDIR)/.git.
GITLEAKS_VERSION ?= 8.30.1
GIT_COMMON_DIR := $(shell git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
GITLEAKS ?= $(if $(shell command -v gitleaks 2>/dev/null),gitleaks,docker run --rm --user "$$(id -u):$$(id -g)" -v "$(CURDIR):$(CURDIR)" $(if $(GIT_COMMON_DIR),-v "$(GIT_COMMON_DIR):$(GIT_COMMON_DIR):ro") -w "$(CURDIR)" ghcr.io/gitleaks/gitleaks:v$(GITLEAKS_VERSION))
GITLEAKS_FLAGS := --no-banner --redact --verbose --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore

.PHONY: help leaks front-gate api-gate e2e-gate full-gate \
        up build up-build stop

help: ## List the targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*## "} {printf "  make %-16s %s\n", $$1, $$2}'

# ---- Quality gates: check only, nothing is rewritten -------------------------

# Every commit in the history, then the staged and the unstaged changes. New
# files are scanned once they are staged. A finding prints redacted and fails.
# The history scan also fails when gitleaks reports 0 commits scanned, or no
# count: git was not readable there, so no commit was checked.
leaks: ## Secrets: gitleaks on every commit and on staged and unstaged changes
	@echo '$(GITLEAKS) git $(GITLEAKS_FLAGS) .'
	@$(GITLEAKS) git $(GITLEAKS_FLAGS) . 2>&1 | awk '{ print; fflush() } \
		{ gsub(/\033\[[0-9;]*m/, "") } \
		match($$0, /[0-9]+ commits? scanned/) { n = substr($$0, RSTART, RLENGTH) + 0; seen = 1 } \
		END { exit (seen && n > 0) ? 0 : 3 }'; \
	st=("$${PIPESTATUS[@]}"); \
	if [ "$${st[0]}" -ne 0 ]; then exit "$${st[0]}"; fi; \
	if [ "$${st[1]}" -ne 0 ]; then \
		echo "leaks: gitleaks scanned 0 commits, so no commit was checked." >&2; \
		echo "leaks: is the git history readable here (in a worktree, the git common dir)?" >&2; \
		exit 1; \
	fi
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

e2e-gate: ## E2E: Playwright on the real stack (docker-compose.e2e.yml, torn down after)
	frontend/scripts/e2e.sh

full-gate: ## Every gate in one command: leaks first, then api, front and e2e
	$(MAKE) leaks
	$(MAKE) api-gate
	$(MAKE) front-gate
	$(MAKE) e2e-gate

# ---- Local stack (docker-compose.yml), detached ------------------------------

up: ## Start the local stack, detached (web :8080, api :8000, fake Borderless :8081)
	$(COMPOSE) up -d --wait

build: ## Build the local stack's images
	$(COMPOSE) build

up-build: ## Build, then start the local stack, detached
	$(COMPOSE) up -d --build --wait

stop: ## Stop the local stack (keeps containers, data and the network)
	$(COMPOSE) stop
