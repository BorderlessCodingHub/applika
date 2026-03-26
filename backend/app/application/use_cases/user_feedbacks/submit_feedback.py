from app.application.dto.user_feedback import (
    SubmitFeedbackPayloadDTO,
    UserFeedbackDTO,
)
from app.application.services.discord_service import DiscordService
from app.domain.models import UserFeedbackModel
from app.domain.repositories.user_feedback_repository import (
    UserFeedbackRepository,
)


class SubmitFeedbackUseCase:
    _DISCORD_SPECIAL_CHARS = ('\\', '*', '_', '`', '~', '|', '>')

    def __init__(
        self,
        feedback_repo: UserFeedbackRepository,
        discord_service: DiscordService,
    ):
        self.feedback_repo = feedback_repo
        self.discord_service = discord_service

    @classmethod
    def _sanitize_discord_text(
        cls, text: str, *, max_length: int
    ) -> str:
        sanitized = ' '.join(text.strip().split())
        for char in cls._DISCORD_SPECIAL_CHARS:
            sanitized = sanitized.replace(char, f'\\{char}')
        return sanitized[:max_length]

    @classmethod
    def _build_discord_message(
        cls,
        username: str,
        score: int,
        text: str | None,
    ) -> str:
        safe_username = cls._sanitize_discord_text(
            username, max_length=100
        )
        stars = '\u2b50' * score
        message = (
            f'\U0001f4ac **USER FEEDBACK** - @{safe_username}\n'
            f'{stars} ({score}/5)\n'
        )
        if text:
            safe_text = cls._sanitize_discord_text(
                text, max_length=2000
            )
            message += f'\n{safe_text}'
        return message

    async def execute(
        self,
        user_id: int,
        username: str,
        payload: SubmitFeedbackPayloadDTO,
    ) -> UserFeedbackDTO:
        feedback = UserFeedbackModel(
            user_id=user_id,
            score=payload.score,
            text=payload.text,
        )

        saved = await self.feedback_repo.create(feedback)

        discord_message = self._build_discord_message(
            username=username,
            score=payload.score,
            text=payload.text,
        )
        await self.discord_service.post_report_message(
            discord_message
        )

        return UserFeedbackDTO.model_validate(saved)
