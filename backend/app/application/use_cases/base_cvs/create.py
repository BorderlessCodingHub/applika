"""Create-master-CV use case."""

from app.application.dto.base_cv import BaseCVCreateDTO, BaseCVDTO
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict
from app.domain.repositories.base_cv_repository import BaseCVRepository

MAX_BASE_CVS = 3
"""The owner's words: "a user can create up to 3 master CV's"."""


class CreateBaseCVUseCase:
    """Create a master CV for the acting user, enforcing the 3-per-user cap.

    One transaction, in this order:

    1. ``lock_user`` takes a ``SELECT ... FOR UPDATE`` on the owning user row;
    2. the user's existing master CVs are counted under that lock;
    3. at ``MAX_BASE_CVS`` or above the transaction is rolled back (releasing
       the lock) and a 409 ``ResourceConflict`` is raised;
    4. otherwise the row is inserted and the commit releases the lock.

    The lock is the whole point: two concurrent creates cannot both read a
    count of 2 and both insert, so a user can never end up with four master
    CVs. There is deliberately no database trigger and no database constraint
    behind it.
    """

    def __init__(self, base_cv_repo: BaseCVRepository):
        self.base_cv_repo = base_cv_repo

    async def execute(self, data: BaseCVCreateDTO) -> BaseCVDTO:
        await self.base_cv_repo.lock_user(data.user_id)
        existing = await self.base_cv_repo.count_by_user_id(data.user_id)
        if existing >= MAX_BASE_CVS:
            await self.base_cv_repo.rollback()
            logger.info(
                f'Base CV limit reached for user {data.user_id}',
                extra={
                    'extra_data': {
                        'event': 'base_cv_limit_reached',
                        'user_id': data.user_id,
                        'existing': existing,
                    }
                },
            )
            raise ResourceConflict(
                f'Base CV limit reached (max {MAX_BASE_CVS} per user)',
                ErrorCode.CV_BASE_CV_LIMIT,
                params={'max': MAX_BASE_CVS},
            )

        base_cv = await self.base_cv_repo.create(data)
        logger.info(
            f'Base CV created: {base_cv.id}',
            extra={
                'extra_data': {
                    'event': 'base_cv_created',
                    'base_cv_id': base_cv.id,
                    'user_id': data.user_id,
                }
            },
        )
        return BaseCVDTO.model_validate(base_cv)
