from datetime import date


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def ensure_date_string(value: str) -> str:
    parse_date(value)
    return value
