"""The application salary rule, shared by the REST/MCP schemas and the
draft finish.

An application's salary is ``expected_salary``, ``salary_range_min`` and
``salary_range_max``, read in ``currency`` per ``salary_period``. A salary
amount with no currency or no period cannot be read, so once any of the
three amounts is set both are required - the rule every web form already
enforces (``applications.validation.requiredWithSalary``).
"""

from decimal import Decimal

SALARY_NEEDS_CURRENCY_AND_PERIOD = (
    'currency and salary_period are required when expected_salary, '
    'salary_range_min or salary_range_max is set'
)


def salary_is_incomplete(
    amounts: tuple[float | Decimal | None, ...],
    currency: object | None,
    salary_period: object | None,
) -> bool:
    """True when an amount is set but the currency or the period is not."""
    has_amount = any(amount is not None for amount in amounts)
    return has_amount and (currency is None or salary_period is None)
