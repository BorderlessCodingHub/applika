from app.presentation.schemas import BaseSchema


class AccountLinkStart(BaseSchema):
    authorize_url: str
