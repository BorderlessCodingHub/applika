import threading
import time
from datetime import UTC, datetime
from functools import lru_cache

from pydantic import GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema

from app.config.settings import envs

# Custom epoch: Jan 1, 2010 (in milliseconds)
SNOWFLAKE_EPOCH_MS = int(datetime(2010, 1, 1, tzinfo=UTC).timestamp() * 1000)
_MAX_INSTANCE = (1 << 10) - 1
_MAX_SEQ = (1 << 12) - 1


class SnowflakeGenerator:
    """41-bit ms timestamp | 10-bit instance | 12-bit sequence.

    Same layout as the ``snowflake-id`` package, whose generator returns
    ``None`` when the wall clock steps back (an NTP or VM clock sync) or
    the sequence runs out in one millisecond - a NULL primary key and a
    500 on insert. This one never does: it keeps issuing from the last
    timestamp it used, so ids stay unique and increasing, and the lock
    keeps it safe across the threadpool.
    """

    def __init__(self, instance: int, epoch_ms: int = SNOWFLAKE_EPOCH_MS):
        if not 0 <= instance <= _MAX_INSTANCE:
            raise ValueError(f'instance must be in 0..{_MAX_INSTANCE}')
        self._instance = instance << 12
        self._epoch_ms = epoch_ms
        self._last_ts = -1
        self._seq = 0
        self._lock = threading.Lock()

    def _now(self) -> int:
        return time.time_ns() // 1_000_000 - self._epoch_ms

    def __next__(self) -> int:
        with self._lock:
            ts = self._now()
            if ts > self._last_ts:
                self._seq = 0
            elif self._seq < _MAX_SEQ:
                # Same millisecond, or the clock stepped back.
                ts = self._last_ts
                self._seq += 1
            else:
                # Sequence exhausted: borrow the next millisecond.
                ts = self._last_ts + 1
                self._seq = 0
            self._last_ts = ts
            return ts << 22 | self._instance | self._seq


@lru_cache(maxsize=1)
def __get_snowflake_generator() -> SnowflakeGenerator:
    return SnowflakeGenerator(envs.INSTANCE_ID)


def generate_snowflake_id() -> int:
    snowflake_gen = __get_snowflake_generator()
    return next(snowflake_gen)


class SnowflakeID(int):
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.union_schema([
                core_schema.int_schema(),
                core_schema.str_schema(),
            ]),
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: str(v)
            ),
        )

    @classmethod
    def validate(cls, value):
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
        raise ValueError('Invalid SnowflakeID')

    @classmethod
    def __get_pydantic_json_schema__(
        cls, core_schema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        # Force OpenAPI to show as string
        return {'type': 'string', 'example': '179847239847239847'}
