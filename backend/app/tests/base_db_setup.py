from typing import TypedDict

from app.domain.models import FeedbackDefinitionModel, PlatformModel, UserModel


class BaseDataType(TypedDict):
    user: UserModel
    plat_linkedin: PlatformModel
    fb_denied: FeedbackDefinitionModel


def base_data() -> BaseDataType:
    return {
        'user': UserModel(
            id=1, github_id=1, username="testuser", email="test@user.com"
        ),
        'plat_linkedin': PlatformModel(
            id=1, name="Linkedin", url="https://www.linkedin.com/"
        ),
        'fb_denied': FeedbackDefinitionModel(
            id=1, name="Denied", color="#a80000"
        ),
    }
