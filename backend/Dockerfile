FROM python:3.11-slim

# Create a non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Set the working directory
WORKDIR /app

#  - migrations
COPY ./migrations /app/migrations
COPY ./alembic.ini /app/alembic.ini
#  - app
COPY ./app /app/app
COPY ./poetry.lock /app/poetry.lock
COPY ./pyproject.toml /app/pyproject.toml

# Set environment variables
ENV ENVIRONMENT=PROD

# Install Poetry and dependencies
RUN pip install --upgrade pip \
    && pip install poetry \
    && poetry config virtualenvs.create false \
    && poetry install --without dev

# Expose the application port
EXPOSE 8000

# Switch to the non-root user
USER appuser

# Set the entrypoint
CMD [ "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" ]
