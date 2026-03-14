from datetime import date

from app.application.use_cases.quinzenal_reports.common import (
    get_current_day,
    get_next_report_day,
    get_phase,
    get_report_period,
    is_valid_report_day,
)


def test_get_report_period_for_day_one():
    start_date = date(2026, 1, 1)

    period_start, period_end = get_report_period(1, start_date)

    assert period_start == date(2026, 1, 1)
    assert period_end == date(2026, 1, 1)


def test_get_report_period_for_day_fourteen():
    start_date = date(2026, 1, 1)

    period_start, period_end = get_report_period(14, start_date)

    assert period_start == date(2026, 1, 1)
    assert period_end == date(2026, 1, 14)


def test_get_report_period_for_day_twenty_eight():
    start_date = date(2026, 1, 1)

    period_start, period_end = get_report_period(28, start_date)

    assert period_start == date(2026, 1, 15)
    assert period_end == date(2026, 1, 28)


def test_get_phase_boundaries():
    assert get_phase(1) == 1
    assert get_phase(30) == 1
    assert get_phase(31) == 2
    assert get_phase(60) == 2
    assert get_phase(61) == 3
    assert get_phase(90) == 3
    assert get_phase(91) == 4
    assert get_phase(120) == 4


def test_valid_report_days():
    assert is_valid_report_day(1) is True
    assert is_valid_report_day(14) is True
    assert is_valid_report_day(120) is True
    assert is_valid_report_day(2) is False
    assert is_valid_report_day(15) is False


def test_current_day_for_today_start_date():
    assert get_current_day(date.today()) == 1


def test_get_next_report_day():
    assert get_next_report_day(set()) == 1
    assert get_next_report_day({1}) == 14
    assert get_next_report_day({1, 14, 28}) == 42
    assert get_next_report_day({1, 14, 28, 42, 56, 70, 84, 98, 112, 120}) is None
