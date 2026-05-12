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
