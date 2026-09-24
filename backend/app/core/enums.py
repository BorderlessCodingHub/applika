from enum import StrEnum


class Currency(StrEnum):
    """The 20 salary currencies: applika's 9 plus mynextjob's 11 (R-031).

    Owner decision (c), 2026-09-17: "(c) is combine from both projects".
    Revision ``afd4074c70c2`` added the 11 labels to the ``currency`` PG type;
    the order matches that revision (the 9 known, then the 11 added).
    """

    USD = 'USD'
    BRL = 'BRL'
    EUR = 'EUR'
    GBP = 'GBP'
    CAD = 'CAD'
    AUD = 'AUD'
    JPY = 'JPY'
    CHF = 'CHF'
    INR = 'INR'
    CNY = 'CNY'
    SEK = 'SEK'
    NOK = 'NOK'
    DKK = 'DKK'
    PLN = 'PLN'
    SGD = 'SGD'
    HKD = 'HKD'
    NZD = 'NZD'
    MXN = 'MXN'
    ZAR = 'ZAR'
    AED = 'AED'


LEGACY_ANNUAL = 'annual'
"""The salary period ``applika-cli`` 0.1.4 sends. Accepted forever (R-031)."""


class SalaryPeriod(StrEnum):
    """Salary period. ``annual`` was renamed ``annually`` (R-031).

    Owner decision (c): "rename to annually". The API only ever *returns*
    ``annually``; it keeps *accepting* ``annual`` because installed
    ``applika-cli`` 0.1.4 sends it. ``_missing_`` is the single place that
    translation lives: Pydantic and ``SalaryPeriod('annual')`` both go through
    it, so every request model that takes a ``SalaryPeriod`` accepts the old
    value without advertising it in OpenAPI. The database side (a legacy
    ``ANNUAL`` label read back as ``ANNUALLY``) is ``SalaryPeriodType`` in
    ``app/domain/models.py``.
    """

    HOURLY = 'hourly'
    MONTHLY = 'monthly'
    ANNUALLY = 'annually'

    @classmethod
    def _missing_(cls, value: object) -> 'SalaryPeriod | None':
        if isinstance(value, str) and value.lower() == LEGACY_ANNUAL:
            return cls.ANNUALLY
        return None


class ExperienceLevel(StrEnum):
    INTERN = 'intern'
    JUNIOR = 'junior'
    MID_LEVEL = 'mid_level'
    SENIOR = 'senior'
    STAFF = 'staff'
    LEAD = 'lead'
    PRINCIPAL = 'principal'
    SPECIALIST = 'specialist'


class WorkMode(StrEnum):
    REMOTE = 'remote'
    HYBRID = 'hybrid'
    ON_SITE = 'on_site'


class Availability(StrEnum):
    OPEN_TO_WORK = 'open_to_work'
    CASUALLY_LOOKING = 'casually_looking'
    NOT_LOOKING = 'not_looking'


class EventType(StrEnum):
    """The five timeline event types (R-001). Fixed in code, no catalog."""

    NOTE = 'note'
    INTERVIEW = 'interview'
    FEEDBACK = 'feedback'
    OFFER = 'offer'
    DENIED = 'denied'


class InterviewType(StrEnum):
    """Interview type, only on ``interview`` events (R-002, R-003).

    The owner: "i would like to create interviews types, hard coded ones (this
    only appears when the step is an interview type) so the user can select
    between initial screening, technical, cultural, and some other, and use
    unknown as default". The declaration order is the stage order of the
    per-stage statistics (R-023).
    """

    UNKNOWN = 'unknown'
    INITIAL_SCREENING = 'initial_screening'
    TECHNICAL = 'technical'
    CULTURAL = 'cultural'
    HIRING_MANAGER = 'hiring_manager'
    TAKE_HOME = 'take_home'
    FINAL = 'final'


class DiscordConnectionStatus(StrEnum):
    """A Discord connection's state (KODI-024, ADR-0013, PG type
    ``discord_connection_status``, lower-case labels - revision
    ``ba44f9cfd3c1``).

    ``active`` is a fresh or successfully refreshed grant. ``needs_reconnect``
    is set when Discord itself revokes the stored refresh token (a 400
    ``invalid_grant`` on renewal) or when the granted scopes turn out to be
    missing what report routing needs; the user has to run the consent flow
    again, which replaces the row in place and clears the mark.
    """

    ACTIVE = 'active'
    NEEDS_RECONNECT = 'needs_reconnect'


class DeniedReason(StrEnum):
    """The reason on a ``denied`` event only (KODI-014, R-033..R-036).

    The owner: "to event type denied, add a select input to select a reason
    with unknown pre-filled (add some options by yourself or based in the
    oldes feedback definition values)" — "Catalog-based list (Recommended)".
    Fixed in code, no catalog, exactly like ``InterviewType``. Migration R3
    (``c8b3e9f4a1d6``) backfills every existing ``denied`` event from the
    application's legacy feedback name, matched by name (see
    ``use_cases/compat/legacy_finalize.LEGACY_FEEDBACK_TO_DENIED_REASON``,
    pinned equal to the migration's own map).
    """

    UNKNOWN = 'unknown'
    NOT_GOOD_ENOUGH = 'not_good_enough'
    SKILLS_MISMATCH = 'skills_mismatch'
    ASSESSMENT_FAILED = 'assessment_failed'
    TOO_MANY_CANDIDATES = 'too_many_candidates'
    POSITION_FILLED = 'position_filled'
    ROLE_CLOSED = 'role_closed'
    GHOSTED = 'ghosted'
    SALARY_MISMATCH = 'salary_mismatch'
    OTHER = 'other'
