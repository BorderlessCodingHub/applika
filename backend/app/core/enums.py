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


class Availability(StrEnum):
    OPEN_TO_WORK = 'open_to_work'
    CASUALLY_LOOKING = 'casually_looking'
    NOT_LOOKING = 'not_looking'
