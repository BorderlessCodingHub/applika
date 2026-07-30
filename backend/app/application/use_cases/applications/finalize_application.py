from app.application.dto.application import (
    ApplicationDTO,
    FinalizeApplicationDTO,
)
from app.application.dto.application_step import ApplicationStepCreateDTO
from app.application.validators.application_date import ensure_not_in_future
from app.config.logging import logger
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    ResourceNotFound,
)
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)

OFFER_STEP_NAME = 'offer'
ACCEPTED_FEEDBACK_NAME = 'accepted'


class FinalizeApplicationUseCase:
    def __init__(
        self,
        step_repo: StepDefinitionRepository,
        feedback_repo: FeedbackDefinitionRepository,
        application_repo: ApplicationRepository,
        application_step_repo: ApplicationStepRepository,
    ):
        self.step_repo = step_repo
        self.feedback_repo = feedback_repo
        self.application_repo = application_repo
        self.application_step_repo = application_step_repo

    async def execute(
        self, id: int, user_id: int, data: FinalizeApplicationDTO
    ) -> ApplicationDTO:
        ensure_not_in_future(data.finalize_date, 'finalize_date')

        application = await self.application_repo.get_by_id_and_user_id(
            id, user_id
        )
        if not application:
            logger.warning(
                f'Finalize failed: application {id} not found',
                extra={
                    'extra_data': {
                        'event': 'finalize_application_failed',
                        'reason': 'not_found',
                        'application_id': id,
                        'user_id': user_id,
                    }
                },
            )
            raise ResourceNotFound('Application not found or not owned by user')

        if application.cycle_id is not None:
            raise BusinessRuleViolation(
                'Cannot modify an application from an archived cycle'
            )

        if application.feedback_id is not None:
            logger.warning(
                f'Finalize failed: application {id} already finalized',
                extra={
                    'extra_data': {
                        'event': 'finalize_application_failed',
                        'reason': 'already_finalized',
                        'application_id': id,
                        'user_id': user_id,
                    }
                },
            )
            raise ApplicationFinalized(
                'This application has already been finalized'
            )

        step = await self.step_repo.get_by_id_strict_only(data.step_id)
        if not step:
            raise ResourceNotFound('Step not found or is invalid')

        feedback = await self.feedback_repo.get_by_id(data.feedback_id)
        if not feedback:
            raise ResourceNotFound('Feedback not found')

        self._validate_finalize_combination(
            step_name=step.name,
            feedback_name=feedback.name,
            salary_offer=data.salary_offer,
        )

        # Insert final step record
        application_step = ApplicationStepCreateDTO(
            user_id=user_id,
            application_id=application.id,
            step_id=step.id,
            step_date=data.finalize_date,
            observation=data.observation,
        )
        await self.application_step_repo.create(application_step)

        application.last_step_id = step.id
        application.last_step_date = data.finalize_date
        application.feedback_id = feedback.id
        application.feedback_date = data.finalize_date
        application.salary_offer = data.salary_offer

        application = await self.application_repo.update(application)
        logger.info(
            f'Application finalized: {id}',
            extra={
                'extra_data': {
                    'event': 'application_finalized',
                    'application_id': id,
                    'user_id': user_id,
                    'feedback_id': feedback.id,
                    'step_id': step.id,
                }
            },
        )
        return ApplicationDTO.model_validate(application)

    @staticmethod
    def _validate_finalize_combination(
        *,
        step_name: str,
        feedback_name: str,
        salary_offer: float | None,
    ) -> None:
        normalized_step = step_name.strip().lower()
        normalized_feedback = feedback_name.strip().lower()

        if (
            normalized_feedback == ACCEPTED_FEEDBACK_NAME
            and normalized_step != OFFER_STEP_NAME
        ):
            raise BusinessRuleViolation(
                'Accepted feedback requires the Offer final step'
            )

        if (
            normalized_step == OFFER_STEP_NAME
            and normalized_feedback != ACCEPTED_FEEDBACK_NAME
        ):
            raise BusinessRuleViolation(
                'Offer final step requires Accepted feedback'
            )

        if salary_offer is not None and (
            normalized_step != OFFER_STEP_NAME
            or normalized_feedback != ACCEPTED_FEEDBACK_NAME
        ):
            raise BusinessRuleViolation(
                'salary_offer can only be set for Offer + Accepted'
            )
