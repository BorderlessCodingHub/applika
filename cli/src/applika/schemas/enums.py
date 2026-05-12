from enum import StrEnum


class Currency(StrEnum):
    USD = 'USD'
    BRL = 'BRL'
    EUR = 'EUR'
    GBP = 'GBP'
    CAD = 'CAD'
    AUD = 'AUD'
    JPY = 'JPY'
    CHF = 'CHF'
    INR = 'INR'


class SalaryPeriod(StrEnum):
    HOURLY = 'hourly'
    MONTHLY = 'monthly'
    ANNUAL = 'annual'


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


class ApplicationMode(StrEnum):
    ACTIVE = 'active'
    PASSIVE = 'passive'


class ModeFilter(StrEnum):
    ACTIVE = 'active'
    PASSIVE = 'passive'
    ALL = 'all'


class StatusFilter(StrEnum):
    ACTIVE = 'active'
    FINALIZED = 'finalized'
    ALL = 'all'


class OutputFormat(StrEnum):
    TABLE = 'table'
    JSON = 'json'


class ClearField(StrEnum):
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
