# Applika.dev

Applika.dev is a full-stack application designed to manage applications and user statistics. It consists of a backend (Python/FastAPI) and a frontend (Next.js/React), organized in separate folders for modular development.

## Project Structure

```
root/
├── backend/      # Python FastAPI backend
├── cli/          # Python CLI package for the applika command
├── frontend/     # Next.js React frontend
├── legacy/       # Legacy code
├── CONTRIBUTORS.md
└── README.md
```

## Prerequisites

- Docker & Docker Compose (recommended for local development)
- Python 3.9+ (for backend, if running without Docker)
- Node.js 20+ and pnpm (for frontend, if running without Docker)
- [uv](https://docs.astral.sh/uv/) (for backend and CLI Python environments)

## CLI

Install the published CLI from PyPI. The package page has the current install
and usage docs:

- [applika-cli on PyPI](https://pypi.org/project/applika-cli/)

```bash
uv tool install applika-cli
# or
pipx install applika-cli
```

This installs the global `applika` command:

```bash
applika --help
applika --version
applika version
```

For local CLI development from this repository:

```bash
cd cli
uv sync
uv run applika --help
```

If you want the global `applika` command to point at your local checkout while
you develop, install it in editable mode:

```bash
cd cli
uv tool install --force --editable .
```

Useful commands:

```bash
cd cli
make test    # Run CLI tests
make format  # Format CLI code
make lint    # Lint CLI code
```

CLI commands:

```bash
applika login
applika logout
applika applications list
applika applications new \
  --company "Acme" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-08
applika applications edit 123 --role "Senior Backend Engineer"
applika applications -n \
  --company "Acme" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-08
applika applications steps list 123
applika applications steps add 123 \
  --step "Initial Screen" \
  --date 2026-05-11
applika applications finalize 123 \
  --step "Offer" \
  --feedback "Accepted" \
  --date 2026-05-18 \
  --salary-offer 180000
```

## Quick Start (Docker Compose)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ProgramadoresSemPatria/application_panel.git application-panel
   cd application-panel
   ```

2. **Start backend service:**

   ```bash
   cd backend
   docker compose up --build
   ```
   Backend API: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs) (Swagger UI)

3. **Start backend service:**

   ```bash
   cd frontend
   docker compose up --build
   ```
   Frontend: [http://127.0.0.1:3000](http://127.0.0.1:3000)
