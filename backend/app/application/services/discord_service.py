import asyncio
import json
from urllib import error, request

from app.config.logging import logger


class DiscordService:
    def __init__(
        self,
        webhook_url: str | None = None,
        timeout_seconds: int = 10,
    ):
        self.webhook_url = webhook_url
        self.timeout_seconds = timeout_seconds

    def _post_message(
        self, payload: dict[str, object], webhook_url: str | None
    ) -> tuple[bool, str | None]:
        if not webhook_url:
            return False, 'Discord webhook not configured'

        data = json.dumps(payload).encode('utf-8')
        req = request.Request(
            webhook_url,
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
        except OSError as exc:
            # A dropped connection (e.g. ``http.client.RemoteDisconnected``,
            # a ``ConnectionResetError``) surfaces straight from
            # ``getresponse()`` - urllib does not wrap it in ``URLError``.
            # Never raised past here (T126: "a Discord failure never
            # raises"); the webhook address never reaches the message.
            return False, f'Webhook request failed: {type(exc).__name__}'

    async def post_report_message(
        self,
        message: str,
        mention_user_id: int | None = None,
        webhook_url: str | None = None,
    ) -> tuple[bool, str | None]:
        """Post one message to ``webhook_url``, or to the ctor's URL when
        none is given (K8 - a report is posted once per resolved webhook,
        each call passing its own URL). The payload is unchanged; the URL
        itself never appears in a log line or a returned error (R-030)."""
        allowed_mentions: dict[str, object] = {'parse': []}
        if mention_user_id is not None:
            allowed_mentions['users'] = [str(mention_user_id)]

        payload: dict[str, object] = {
            'content': message,
            'allowed_mentions': allowed_mentions,
        }

        resolved_url = webhook_url or self.webhook_url

        discord_posted, discord_error = await asyncio.to_thread(
            self._post_message,
            payload,
            resolved_url,
        )

        if discord_posted:
            logger.info('Quinzenal report posted to Discord successfully')
        else:
            logger.error(
                f'Failed to post quinzenal report to Discord: {discord_error}'
            )

        return discord_posted, discord_error
