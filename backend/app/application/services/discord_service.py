import asyncio
import json
from urllib import error, request

from app.config.logging import logger
from app.config.settings import envs


class DiscordService:
    def __init__(
        self,
        webhook_url: str | None = None,
        timeout_seconds: int = 10,
    ):
        self.webhook_url = webhook_url or envs.DISCORD_REPORTS_WEBHOOK
        self.timeout_seconds = timeout_seconds

    def _post_message(self, payload: dict[str, object]) -> tuple[bool, str | None]:
        if not self.webhook_url:
            return False, 'Discord webhook not configured'

        data = json.dumps(payload).encode('utf-8')
        req = request.Request(
            self.webhook_url,
            data=data,
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'ApplikaBot/1.0 (+https://applika.dev)',
            },
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                if response.status in (200, 204):
                    return True, None

                body = response.read().decode('utf-8', errors='ignore')
                return (
                    False,
                    f'Webhook returned status {response.status}: {body[:200]}',
                )
        except error.HTTPError as exc:
            body = exc.read().decode('utf-8', errors='ignore')
            return False, f'Webhook returned status {exc.code}: {body[:200]}'
        except error.URLError as exc:
            return False, f'Webhook request failed: {exc.reason}'
        except TimeoutError:
            return False, 'Webhook timeout'

    async def post_report_message(self, message: str) -> tuple[bool, str | None]:
        payload = {
            'content': message,
            'allowed_mentions': {'parse': []},
        }

        discord_posted, discord_error = await asyncio.to_thread(
            self._post_message,
            payload,
        )

        if discord_posted:
            logger.info('Quinzenal report posted to Discord successfully')
        else:
            logger.error(
                f'Failed to post quinzenal report to Discord: {discord_error}'
            )

        return discord_posted, discord_error
