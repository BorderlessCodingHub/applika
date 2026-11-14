from sqlalchemy import ColumnElement, or_

from app.domain.models import CompanyModel, PlatformModel


def visible_to(
    model: type[CompanyModel] | type[PlatformModel], user_id: int
) -> ColumnElement[bool]:
    """A catalog row (company or platform) is visible to ``user_id`` when it
    is public, or private and created by that user (ADR-0014, "Private
    catalog rows"). Used by every ``get_visible``/``list_visible``/
    ``find_visible_*`` query on ``CompanyRepository`` and
    ``PlatformRepository`` so the visibility rule lives in one place.
    """
    return or_(model.is_public.is_(True), model.created_by == user_id)
