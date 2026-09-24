from typing import Literal

from app.presentation.schemas import BaseSchema


class AccountLinkStart(BaseSchema):
    authorize_url: str


class AccountLinkOut(BaseSchema):
    provider: Literal['discord']
    linked: bool
