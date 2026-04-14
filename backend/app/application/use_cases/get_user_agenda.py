from datetime import date

from app.application.dto.agenda import AgendaStepDTO
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)


class GetUserAgendaUseCase:
    def __init__(
        self, app_step_repo: ApplicationStepRepository
    ):
        self.app_step_repo = app_step_repo

    async def execute(
        self,
        user_id: int,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> list[AgendaStepDTO]:
        steps = await self.app_step_repo.get_user_agenda(
            user_id=user_id,
            from_date=from_date,
            to_date=to_date,
        )
        return [
            AgendaStepDTO(
                id=s.id,
                step_id=s.step_id,
                step_date=s.step_date,
                step_name=(
                    s.step_def.name if s.step_def else None
                ),
                step_color=(
                    s.step_def.color if s.step_def else None
                ),
                start_time=s.start_time,
                end_time=s.end_time,
                timezone=s.timezone,
                observation=s.observation,
                application_id=s.application_id,
                company_name=s.application.company_name,
                role=s.application.role,
            )
            for s in steps
        ]
