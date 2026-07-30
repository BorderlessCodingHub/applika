from enum import Enum


class Currency(str, Enum):
    USD = 'USD'
    BRL = 'BRL'
    EUR = 'EUR'
    GBP = 'GBP'
    CAD = 'CAD'
    AUD = 'AUD'
    JPY = 'JPY'
    CHF = 'CHF'
    INR = 'INR'


class SalaryPeriod(str, Enum):
    HOURLY = 'hourly'
    MONTHLY = 'monthly'
    ANNUAL = 'annual'


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
