from pydantic import BaseModel, Field

from app.application.dto import BaseSchema


class SubmitFeedbackPayloadDTO(BaseModel):
    score: int = Field(ge=1, le=5)
    text: str | None = Field(default=None, max_length=2000)


class UserFeedbackDTO(BaseSchema):
    score: int
    text: str | None = None
    user_id: int
