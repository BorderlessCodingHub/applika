from app.application.dto import BaseSchema


class FeedbackDefinitionDTO(BaseSchema):
    """A frozen feedback definition, read-only (R-018, R-021)."""

    name: str
    color: str
