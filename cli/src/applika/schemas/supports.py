from typing_extensions import TypedDict


class FeedbackDefinitionSchema(TypedDict):
    id: str
    name: str
    color: str


class StepDefinitionSchema(TypedDict):
    id: str
    name: str
    color: str
    strict: bool


class PlatformSchema(TypedDict):
    id: str
    name: str
    url: str


class SupportSchema(TypedDict):
    feedbacks: list[FeedbackDefinitionSchema]
    steps: list[StepDefinitionSchema]
    platforms: list[PlatformSchema]


class Company(TypedDict):
    id: str
    name: str
    url: str
