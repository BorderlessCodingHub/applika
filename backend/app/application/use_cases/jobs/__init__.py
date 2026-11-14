"""The job board use cases (PRD 0012). ``ingest_jobs`` and
``recompute_fit`` are what the background worker runs
(ADR-0016): they write jobs, sources and fit scores only. ``list_jobs``,
``get_job``, ``dismiss_job`` and ``restore_job`` serve the
signed-in user's own view of the list."""
