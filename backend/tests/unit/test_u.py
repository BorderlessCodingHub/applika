from datetime import date

from app.application.use_cases.quinzenal_reports.common import (
    REPORT_DAYS,
    get_current_day,
    get_next_report_day,
    get_phase,
    get_report_period,
)


def test_report_days_tuple():
    assert len(REPORT_DAYS) == 10
    assert REPORT_DAYS[0] == 1
    assert REPORT_DAYS[-1] == 120


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


def test_get_report_period_for_day_120():
    start_date = date(2026, 1, 1)
    period_start, period_end = get_report_period(120, start_date)
    assert period_end == date(2026, 4, 30)


def test_get_phase_boundaries():
    assert get_phase(1) == 1
    assert get_phase(30) == 1
    assert get_phase(31) == 2
    assert get_phase(60) == 2
    assert get_phase(61) == 3
    assert get_phase(90) == 3
    assert get_phase(91) == 4
    assert get_phase(120) == 4


def test_current_day_for_today_start_date():
    assert get_current_day(date.today()) == 1


def test_current_day_for_past_start_date():
    past = date.today().replace(year=date.today().year - 1)
    result = get_current_day(past)
    assert result == 120  # capped at 120


def test_current_day_for_future_start_date():
    from datetime import timedelta
    future = date.today() + timedelta(days=5)
    result = get_current_day(future)
    assert result == 1  # minimum is 1


def test_get_next_report_day():
    assert get_next_report_day(set()) == 1
    assert get_next_report_day({1}) == 14
    assert get_next_report_day({1, 14, 28}) == 42
    assert get_next_report_day(
        {1, 14, 28, 42, 56, 70, 84, 98, 112, 120}
    ) is None
