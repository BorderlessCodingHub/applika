from pydantic import BaseModel


class CliLoginStartRequest(BaseModel):
    callback_url: str
    state: str


class CliLoginStartResponse(BaseModel):
    login_id: str
    login_url: str


class CliExchangeRequest(BaseModel):
    code: str


class CliExchangeResponse(BaseModel):
    access_token: str
    refresh_token: str
    access_expires_in: int
    refresh_expires_in: int
