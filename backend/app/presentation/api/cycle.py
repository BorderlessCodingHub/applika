from typing import List

from fastapi import APIRouter

from app.application.dto.cycle import CycleCreateDTO
from app.application.use_cases.cycles.create_cycle import CreateCycleUseCase
from app.application.use_cases.cycles.list_cycles import ListCyclesUseCase
from app.presentation.dependencies import CycleRepositoryDp, CurrentUserDp
from app.presentation.schemas.cycle import CreateCycle, Cycle

router = APIRouter(tags=['Cycles'])


@router.post('/cycles', response_model=Cycle, status_code=201)
async def create_cycle(
    payload: CreateCycle,
    c_user: CurrentUserDp,
    cycle_repo: CycleRepositoryDp,
):
    use_case = CreateCycleUseCase(cycle_repo)
    data = CycleCreateDTO(name=payload.name)
    cycle = await use_case.execute(c_user.id, data)
    return Cycle.model_validate(
        cycle.model_dump(exclude={'user_id'})
    )


@router.get('/cycles', response_model=List[Cycle])
async def list_cycles(
    c_user: CurrentUserDp,
    cycle_repo: CycleRepositoryDp,
):
    use_case = ListCyclesUseCase(cycle_repo)
    cycles = await use_case.execute(c_user.id)
    return [
        Cycle.model_validate(c.model_dump(exclude={'user_id'}))
        for c in cycles
    ]
