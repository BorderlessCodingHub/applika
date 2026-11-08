# The fake Borderless OpenID Connect provider, for tests only (ADR-0026 §12).
#
# Its own image, never the API's: the end-to-end compose builds it from this
# folder as `applika-e2e-borderless-fake`. backend/Dockerfile copies only
# app/, migrations/ and alembic.ini, so the API image holds no fake code.
#
#   docker build -t applika-e2e-borderless-fake backend/tests/fixtures/borderless
#   docker run --rm -p 127.0.0.1:8181:8081 applika-e2e-borderless-fake \
#     --issuer http://127.0.0.1:8181/api/auth
#
# Arguments after the image name go to fake_oidc.py: --issuer (required),
# --public-url, --access-ttl, --config (default: the baked accounts.json),
# --port (default 8081). Synthetic accounts and client only.

FROM python:3.14-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Only what fake_oidc.py imports to serve HTTP (pyjwt, cryptography and
# cryptography's cffi/pycparser), pinned to backend/uv.lock. httpx is
# imported only by the in-process transport() the backend tests use.
RUN pip install --no-cache-dir \
    pyjwt==2.12.1 \
    cryptography==46.0.7 \
    cffi==2.0.0 \
    pycparser==3.0

WORKDIR /fake
COPY fake_oidc.py accounts.json ./

RUN useradd --no-create-home --uid 1001 fake
USER fake

EXPOSE 8081

HEALTHCHECK --interval=2s --timeout=2s --retries=30 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=2)"]

ENTRYPOINT ["python", "/fake/fake_oidc.py"]
CMD ["--issuer", "http://127.0.0.1:8081/api/auth"]
