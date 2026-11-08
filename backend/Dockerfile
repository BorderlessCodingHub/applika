# ---- Build stage ----
FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim AS builder

# Copy (not hardlink) out of the uv cache so the venv is self-contained, and
# never download a Python: the venv must link against the runtime image's one.
ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project

# Keep the image small: strip debug symbols from the compiled extensions
# (typst alone drops ~12 MB) and drop any bytecode written during install.
RUN apt-get update && apt-get install -y --no-install-recommends binutils && \
    find /app/.venv -name '*.so*' -type f -exec strip --strip-unneeded {} + && \
    find /app/.venv -name '__pycache__' -type d -prune -exec rm -rf {} +

# ---- Runtime stage ----
FROM python:3.14-slim-trixie

WORKDIR /app

ENV ENVIRONMENT=PROD

# /app itself belongs to appuser: the app creates /app/logs at startup.
RUN useradd -m -u 1001 appuser && chown appuser:appuser /app

# --chown on COPY instead of a later `chown -R`: the recursive chown rewrote
# every file into a new layer and doubled the image size.
COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --chown=appuser:appuser ./migrations /app/migrations
COPY --chown=appuser:appuser ./alembic.ini /app/alembic.ini
COPY --chown=appuser:appuser ./app /app/app

USER appuser

# Use the venv Python directly — no uv needed at runtime
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
