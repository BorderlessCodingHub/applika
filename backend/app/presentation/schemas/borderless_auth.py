from pydantic import BaseModel, ConfigDict, Field


class BorderlessCredentials(BaseModel):
    """The Borderless email and password. Checked with Borderless from the
    server, never stored or logged; ``repr`` hides the password."""

    email: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200, repr=False)

    model_config = ConfigDict(extra='ignore', hide_input_in_errors=True)


class BorderlessSignInResponse(BaseModel):
    """``redirect_to``: where the browser goes to hand a CLI sign-in back
    (null on the web, which got its cookies). ``new_account``: the sign-in
    created the account."""

    redirect_to: str | None
    new_account: bool


class CodedDetailSchema(BaseModel):
    detail: str
    code: str | None = None
