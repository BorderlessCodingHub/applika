# ---- Build stage ----
FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim AS builder

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev

# ---- Runtime stage ----
FROM python:3.14-slim-trixie

WORKDIR /app

ENV ENVIRONMENT=PROD

# Copy the virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code and migrations
COPY ./migrations /app/migrations
COPY ./alembic.ini /app/alembic.ini
COPY ./app /app/app

# Create non-root user and set ownership
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Use the venv Python directly — no uv needed at runtime
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
