from datetime import date, timedelta

REPORT_DAYS = (1, 14, 28, 42, 56, 70, 84, 98, 112, 120)


def is_valid_report_day(report_day: int) -> bool:
    return report_day in REPORT_DAYS


def get_next_report_day(submitted_days: set[int]) -> int | None:
    for report_day in REPORT_DAYS:
        if report_day not in submitted_days:
            return report_day
    return None


def get_report_period(report_day: int, start_date: date) -> tuple[date, date]:
    end_date = start_date + timedelta(days=report_day - 1)

    if report_day == 1:
        return start_date, start_date

    start_date_fortnight = end_date - timedelta(days=13)
    return start_date_fortnight, end_date


def get_phase(report_day: int) -> int:
    if report_day <= 30:
        return 1
    if report_day <= 60:
        return 2
    if report_day <= 90:
        return 3
    return 4


def get_current_day(start_date: date) -> int:
    current_day = (date.today() - start_date).days + 1

    if current_day < 1:
        return 1

    return min(current_day, 120)
