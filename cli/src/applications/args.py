import argparse

from choices import (
    CURRENCY_CHOICES,
    EXPERIENCE_CHOICES,
    MODE_CHOICES,
    SALARY_PERIOD_CHOICES,
    WORK_MODE_CHOICES,
)


def add_application_args(
    parser: argparse.ArgumentParser,
    *,
    require_all: bool,
) -> None:
    parser.add_argument('--company', required=require_all)
    parser.add_argument('--company-url')
    parser.add_argument('--role', required=require_all)
    parser.add_argument('--platform', required=require_all)
    parser.add_argument('--mode', choices=MODE_CHOICES[:2], required=require_all)
    parser.add_argument('--date', dest='application_date', required=require_all)
    parser.add_argument('--job-url')
    parser.add_argument('--observation')
    parser.add_argument('--expected-salary', type=float)
    parser.add_argument('--salary-min', type=float)
    parser.add_argument('--salary-max', type=float)
    parser.add_argument('--currency', choices=CURRENCY_CHOICES)
    parser.add_argument('--salary-period', choices=SALARY_PERIOD_CHOICES)
    parser.add_argument('--experience-level', choices=EXPERIENCE_CHOICES)
    parser.add_argument('--work-mode', choices=WORK_MODE_CHOICES)
    parser.add_argument('--country')
