from typing import TypedDict

from app.domain.models import (
    CompanyModel,
    FeedbackDefinitionModel,
    PlatformModel,
    StepDefinitionModel,
    UserModel,
)


class BaseDataType(TypedDict):
    user: UserModel
    admin_user: UserModel
    plat_linkedin: PlatformModel
    fb_denied: FeedbackDefinitionModel
    fb_accepted: FeedbackDefinitionModel
    step_applied: StepDefinitionModel
    company_acme: CompanyModel


def base_data() -> BaseDataType:
    return {
        'user': UserModel(
            id=1, github_id=1, username='testuser', email='test@user.com'
        ),
        'admin_user': UserModel(
            id=2,
            github_id=2,
            username='adminuser',
            email='admin@user.com',
            is_admin=True,
        ),
        'plat_linkedin': PlatformModel(
            id=1, name='Linkedin', url='https://www.linkedin.com/'
        ),
        'fb_denied': FeedbackDefinitionModel(
            id=1, name='Denied', color='#a80000'
        ),
        'fb_accepted': FeedbackDefinitionModel(
            id=200, name='Accepted', color='#00a800'
        ),
        'step_applied': StepDefinitionModel(
            id=100, name='Applied', color='#007bff'
        ),
        'company_acme': CompanyModel(
            id=1,
            name='Acme Corp',
            url='https://www.linkedin.com/company/acme',
            created_by=1,
        ),
    }
