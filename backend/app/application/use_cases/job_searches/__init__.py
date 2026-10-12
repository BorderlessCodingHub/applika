"""Saved job searches (KODI-047, PRD 0012 R-030, R-032): a user names the
job list's current search, filters and sort, lists them, applies, renames
and deletes them - at most ten, names unique per user ignoring case. A
saved search never notifies anyone: there is no notification field, route
or side effect."""

MAX_SAVED_SEARCHES = 10
LIMIT_REACHED = f'Saved search limit reached (max {MAX_SAVED_SEARCHES})'
SEARCH_NOT_FOUND = 'Saved search not found'
