# Application Panel

Application Panel is a full-stack application designed to manage applications and user statistics. It consists of a backend (Python/FastAPI) and a frontend (Next.js/React), organized in separate folders for modular development.

## Project Structure

```
root/
├── backend/      # Python FastAPI backend
├── frontend/     # Next.js React frontend
├── legacy/       # Legacy code
├── CONTRIBUTORS.md
└── README.md
```

## Prerequisites

- Docker & Docker Compose (recommended for local development)
- Python 3.10+ (for backend, if running without Docker)
- Node.js 18+ and pnpm (for frontend, if running without Docker)

## Quick Start (Docker Compose)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/ProgramadoresSemPatria/application_panel.git application-panel
   cd application-panel
   ```

2. **Start backend service:**

   ```bash
   cd backend
   docker-compose up --build
   ```
   Backend API: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs) (Swagger UI)

3. **Start backend service:**

   ```bash
   cd frontend
   docker-compose up --build
   ```
   Frontend: [http://127.0.0.1:3000](http://127.0.0.1:3000)
