from app.application.dto import BaseSchema


class StepDefinitionDTO(BaseSchema):
    """A frozen step definition, read-only (R-018, R-021)."""

    name: str
    color: str
    strict: bool
