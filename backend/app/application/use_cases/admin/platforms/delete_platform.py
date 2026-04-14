from app.config.logging import logger
from app.core.exceptions import ResourceConflict
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.platform_repository import (
    PlatformRepository,
)


class DeletePlatformUseCase:
    def __init__(
        self,
        platform_repo: PlatformRepository,
        admin_repo: AdminRepository,
    ):
        self.platform_repo = platform_repo
        self.admin_repo = admin_repo

    async def execute(
        self, platform_id: int, admin_id: int
    ) -> None:
        refs = await self.admin_repo.count_entity_references(
            'platform', platform_id
        )
        if refs > 0:
            logger.warning(
                f'Admin delete platform blocked: '
                f'{platform_id}',
                extra={'extra_data': {
                    'event': (
                        'admin_delete_platform_blocked'
                    ),
                    'reason': 'has_references',
                    'platform_id': platform_id,
                    'references_count': refs,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceConflict(
                f'Cannot delete: {refs} application(s) '
                f'reference this platform'
            )

        await self.platform_repo.delete(platform_id)

        logger.info(
            f'Admin deleted platform: {platform_id}',
            extra={'extra_data': {
                'event': 'admin_delete_platform',
                'platform_id': platform_id,
                'admin_id': admin_id,
            }},
        )
