from datetime import datetime, timezone
from functools import lru_cache

from pydantic import GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema
from snowflake import SnowflakeGenerator

from app.config.settings import envs


@lru_cache(maxsize=1)
def __get_snowflake_generator():
    # Custom epoch: Jan 1, 2010 (in milliseconds)
    epoch = int(
        datetime(2010, 1, 1, tzinfo=timezone.utc).timestamp() * 1000
    )
    return SnowflakeGenerator(envs.INSTANCE_ID, epoch=epoch)


def generate_snowflake_id() -> int:
    snowflake_gen = __get_snowflake_generator()
    return next(snowflake_gen)


class SnowflakeID(int):
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.union_schema(
                [core_schema.int_schema(), core_schema.str_schema()]
            ),
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
        raise ValueError("Invalid SnowflakeID")

    @classmethod
    def __get_pydantic_json_schema__(
        cls, core_schema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        # Force OpenAPI to show as string
        return {
            "type": "string",
            "example": "179847239847239847"
        }
