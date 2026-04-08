from pydantic import Field

from app.presentation.schemas import BaseSchema, TimeSchema


class SubmitFeedbackRequest(BaseSchema):
    score: int = Field(ge=1, le=5)
    text: str | None = Field(default=None, max_length=2000)


class SubmitFeedbackResponse(BaseSchema, TimeSchema):
    id: int
    score: int
    text: str | None = None
    user_id: int
