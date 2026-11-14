"""Operational CLIs shipped inside the API image.

Unlike ``backend/scripts/`` (developer-only, not copied into the Docker
image), everything here lives under ``app/`` so it is present at runtime
and can be run with ``python -m app.scripts.<name>`` inside a container.
"""
