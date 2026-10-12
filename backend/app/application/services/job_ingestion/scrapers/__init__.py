"""One scraper per job board, keyed by the source code (``job_sources.code``).

Every scraper returns :class:`~.base.ScrapedPosting` records with plain-text
descriptions and raises :class:`~.base.SourceBlocked` or
:class:`~.base.SourceFailed`, never a transport exception."""
