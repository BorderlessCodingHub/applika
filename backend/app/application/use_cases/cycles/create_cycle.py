from app.application.dto.cycle import CycleCreateDTO, CycleDTO
from app.config.logging import logger
from app.core.exceptions import BusinessRuleViolation
from app.domain.repositories.cycle_repository import CycleRepository

MIN_APPLICATIONS_FOR_CYCLE = 10


class CreateCycleUseCase:
    def __init__(self, cycle_repo: CycleRepository):
        self.cycle_repo = cycle_repo

    async def execute(
        self, user_id: int, data: CycleCreateDTO
    ) -> CycleDTO:
        current_count = await self.cycle_repo.count_current_applications(
            user_id
        )
        if current_count < MIN_APPLICATIONS_FOR_CYCLE:
            raise BusinessRuleViolation(
                f'At least {MIN_APPLICATIONS_FOR_CYCLE} applications are '
                f'required to start a new cycle '
                f'(currently {current_count})'
            )
        cycle = await self.cycle_repo.create(user_id, data.name)
        archived_apps = await self.cycle_repo.archive_current_applications(
            user_id, cycle.id
        )
        archived_reports = await self.cycle_repo.archive_current_reports(
            user_id, cycle.id
        )
        await self.cycle_repo.commit()
        logger.info(
            f'Cycle created: {cycle.id}',
            extra={'extra_data': {
                'event': 'cycle_created',
                'cycle_id': cycle.id,
                'cycle_name': data.name,
                'user_id': user_id,
                'archived_applications': archived_apps,
                'archived_reports': archived_reports,
            }},
        )
        return CycleDTO.model_validate(cycle)
