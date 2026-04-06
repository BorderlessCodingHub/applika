from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.cycle_repository import CycleRepository


class DeleteCycleUseCase:
    def __init__(self, cycle_repo: CycleRepository):
        self.cycle_repo = cycle_repo

    async def execute(self, cycle_id: int, user_id: int) -> None:
        cycle = await self.cycle_repo.get_by_id_and_user_id(
            cycle_id, user_id
        )
        if not cycle:
            logger.warning(
                f'Delete failed: cycle {cycle_id} not found',
                extra={'extra_data': {
                    'event': 'delete_cycle_failed',
                    'cycle_id': cycle_id,
                    'user_id': user_id,
                }},
            )
            raise ResourceNotFound(
                'Cycle not found or not owned by user'
            )

        await self.cycle_repo.delete_cycle_cascade(cycle_id, user_id)
        logger.info(
            f'Cycle deleted: {cycle_id}',
            extra={'extra_data': {
                'event': 'cycle_deleted',
                'cycle_id': cycle_id,
                'cycle_name': cycle.name,
                'user_id': user_id,
            }},
        )
