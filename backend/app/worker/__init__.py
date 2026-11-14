"""The background worker (ADR-0016): a delivery layer next to
``app/presentation/``. ``broker.py`` holds the broker and the scheduler,
``tasks.py`` the thin tasks, ``queue.py`` the ``JobQueue`` binding the API
enqueues through."""
