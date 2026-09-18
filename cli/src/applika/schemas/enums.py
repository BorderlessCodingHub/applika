from enum import Enum


class Currency(str, Enum):
    """The 20 salary currencies of applika and mynextjob combined (R-031).

    Order matches ``applika/backend/app/core/enums.py``: the 9 known first,
    then the 11 KODI-011 added.
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


class SalaryPeriod(str, Enum):
    """Salary period for an application's own salary fields (``new``/``edit``).

    ``ANNUAL`` stays a valid CLI *input* value only because
    ``test_applications_new_builds_matching_payload`` (0.1.4) pins
    ``--salary-period annual`` sending the literal string ``annual`` — the API
    still accepts it (``SalaryPeriod._missing_`` on the backend). ``ANNUALLY``
    is added so ``applications edit`` can round-trip an application the API
    already reports as ``annually`` (KODI-011's known 0.1.4 limitation, fixed
    here). No 0.2.0 *new* command (``timeline``, ``finalize --outcome``) ever
    offers or sends ``annual``: those use ``OfferPeriod`` below, which never
    had it.
    """

    HOURLY = 'hourly'
    MONTHLY = 'monthly'
    ANNUAL = 'annual'
    ANNUALLY = 'annually'


class OfferPeriod(str, Enum):
    """The salary period an offer timeline event or finalize outcome takes.

    Only ``monthly`` and ``annually`` (R-006/R-032): the API refuses
    ``hourly`` on an offer with 422 'offer salary_period must be monthly or
    annually'.
    """

    MONTHLY = 'monthly'
    ANNUALLY = 'annually'


class EventType(str, Enum):
    NOTE = 'note'
    INTERVIEW = 'interview'
    FEEDBACK = 'feedback'
    OFFER = 'offer'
    DENIED = 'denied'


class InterviewType(str, Enum):
    UNKNOWN = 'unknown'
    INITIAL_SCREENING = 'initial_screening'
    TECHNICAL = 'technical'
    CULTURAL = 'cultural'
    HIRING_MANAGER = 'hiring_manager'
    TAKE_HOME = 'take_home'
    FINAL = 'final'


class DeniedReason(str, Enum):
    """The 10 denied-event reasons (R-033..R-036, KODI-014). Same wire
    values as ``backend/app/core/enums.py``'s ``DeniedReason``."""

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


class FinalizeOutcome(str, Enum):
    OFFER = 'offer'
    DENIED = 'denied'


class ExperienceLevel(str, Enum):
    INTERN = 'intern'
    JUNIOR = 'junior'
    MID_LEVEL = 'mid_level'
    SENIOR = 'senior'
    STAFF = 'staff'
    LEAD = 'lead'
    PRINCIPAL = 'principal'
    SPECIALIST = 'specialist'


class WorkMode(str, Enum):
    REMOTE = 'remote'
    HYBRID = 'hybrid'
    ON_SITE = 'on_site'


class ApplicationMode(str, Enum):
    ACTIVE = 'active'
    PASSIVE = 'passive'


class ModeFilter(str, Enum):
    ACTIVE = 'active'
    PASSIVE = 'passive'
    ALL = 'all'


class StatusFilter(str, Enum):
    ACTIVE = 'active'
    FINALIZED = 'finalized'
    ALL = 'all'


class OutputFormat(str, Enum):
    TABLE = 'table'
    JSON = 'json'


class ClearField(str, Enum):
    OBSERVATION = 'observation'
    JOB_URL = 'job_url'
    COUNTRY = 'country'
    EXPERIENCE_LEVEL = 'experience_level'
    WORK_MODE = 'work_mode'
    EXPECTED_SALARY = 'expected_salary'
    SALARY_MIN = 'salary_min'
    SALARY_MAX = 'salary_max'
    CURRENCY = 'currency'
    SALARY_PERIOD = 'salary_period'
    SALARY = 'salary'


class StepClearField(str, Enum):
    OBSERVATION = 'observation'
    TIME = 'time'
    TIMEZONE = 'timezone'
