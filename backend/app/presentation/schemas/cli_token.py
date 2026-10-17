"""CLI sign-in schemas for ``applika-cli`` 1.1.0 and later (KODI-057,
ADR-0019): ``POST /auth/token``, ``POST /auth/revoke`` and the device code
routes. Shapes follow RFC 6749, RFC 7009 and RFC 8628."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.application.use_cases.cli_auth.token import (
    AUTHORIZATION_CODE,
    DEVICE_CODE,
    REFRESH_TOKEN,
)

_REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    AUTHORIZATION_CODE: ('code', 'code_verifier', 'redirect_uri'),
    REFRESH_TOKEN: ('refresh_token',),
    DEVICE_CODE: ('device_code',),
}


class TokenRequest(BaseModel):
    """One body for the three grants, told apart by ``grant_type``. A known
    grant missing one of its fields is a 422; an unknown grant passes here
    and is answered 400 ``unsupported_grant_type``."""

    model_config = ConfigDict(extra='ignore')

    grant_type: str = Field(max_length=200)
    code: str | None = Field(default=None, max_length=200)
    code_verifier: str | None = Field(default=None, max_length=200)
    redirect_uri: str | None = Field(default=None, max_length=2000)
    device_name: str | None = Field(default=None, max_length=255)
    refresh_token: str | None = Field(default=None, max_length=200)
    device_code: str | None = Field(default=None, max_length=200)

    @model_validator(mode='after')
    def _grant_fields(self) -> Self:
        missing = [
            name
            for name in _REQUIRED_FIELDS.get(self.grant_type, ())
            if not getattr(self, name)
        ]
        if missing:
            raise ValueError(f'{self.grant_type} needs: {", ".join(missing)}')
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal['Bearer'] = 'Bearer'
    expires_in: int
    refresh_token: str
    refresh_expires_in: int


class OAuthErrorSchema(BaseModel):
    error: str
    detail: str


class RevokeRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')

    refresh_token: str = Field(max_length=200)


class DeviceCodeRequest(BaseModel):
    device_name: str | None = Field(default=None, max_length=255)


class DeviceCodeResponse(BaseModel):
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int


class DeviceVerifyResponse(BaseModel):
    device_name: str
    client_label: str
    ip: str | None
    requested_at: datetime
    expires_at: datetime


class UserCodeRequest(BaseModel):
    user_code: str = Field(max_length=32)
