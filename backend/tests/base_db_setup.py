from typing import TypedDict

from app.core.enums import EventType, InterviewType
from app.domain.models import (
    CompanyModel,
    PlatformModel,
    StepDefinitionModel,
    UserModel,
)


class BaseDataType(TypedDict):
    user: UserModel
    admin_user: UserModel
    plat_linkedin: PlatformModel
    step_applied: StepDefinitionModel
    company_acme: CompanyModel


def base_data() -> BaseDataType:
    return {
        'user': UserModel(id=1, username='testuser', email='test@user.com'),
        'admin_user': UserModel(
            id=2,
            username='adminuser',
            email='admin@user.com',
            is_admin=True,
        ),
        'plat_linkedin': PlatformModel(
            id=1, name='Linkedin', url='https://www.linkedin.com/'
        ),
        # Not in revision afd4074c70c2's STEP_MAPPING, so it carries the
        # revision's STEP_FALLBACK, as an admin-created definition does.
        'step_applied': StepDefinitionModel(
            id=100,
            name='Applied',
            color='#007bff',
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
        'company_acme': CompanyModel(
            id=1,
            name='Acme Corp',
            url='https://www.linkedin.com/company/acme',
            created_by=1,
        ),
    }
