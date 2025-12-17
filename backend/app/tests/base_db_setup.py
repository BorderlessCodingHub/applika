from dataclasses import dataclass

from app.domain.models import FeedbackDefinitionModel, PlatformModel, UserModel


@dataclass
class _DataSetup:
    user = UserModel(
        id=1, github_id=1, username="testuser", email="test@user.com"
    )
    plat_linkedin = PlatformModel(
        id=1, name="Linkedin", url="https://www.linkedin.com/"
    )
    fb_denied = FeedbackDefinitionModel(
        id=1, name="Denied", color="#a80000"
    )

    def to_list(self):
        return [
            self.user,
            self.plat_linkedin,
            self.fb_denied,
        ]


base_data = _DataSetup()
