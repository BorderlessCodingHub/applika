from app.application.dto.cycle import CycleDTO
from app.domain.repositories.cycle_repository import CycleRepository


class ListCyclesUseCase:
    def __init__(self, cycle_repo: CycleRepository):
        self.cycle_repo = cycle_repo

    async def execute(self, user_id: int) -> list[CycleDTO]:
        cycles = await self.cycle_repo.get_all_by_user_id(user_id)
        return [CycleDTO.model_validate(c) for c in cycles]
