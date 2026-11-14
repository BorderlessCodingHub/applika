# ADR-0003: Snowflake BIGINT ids serialized as strings (as-built)

**Status:** Accepted by LuisMSoares on 2026-09-16 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

Applika uses Snowflake ids for every primary key. No applika ADR records it. New tables use the
same strategy, so every table stays in one id space.

## Decision

This records what the code does today.

- Every primary key is a Snowflake `BigInteger` generated in Python, not by a database sequence
  (`backend/app/lib/types.py`, `BaseMixin` in `backend/app/domain/models.py`).
- Foreign keys are `BigInteger` in the same id space.
- Ids are serialized as strings in JSON and OpenAPI through the `SnowflakeID` Pydantic type
  (`backend/app/lib/types.py`).
- Migration `a1b2c3d4e5f6_convert_ids_to_snowflake_biginteger.py` converted the existing ids.

## Consequences

- The frontend and the CLI treat ids as strings. No precision loss above 2^53.
- New tables for CVs, timeline events and linked accounts use the same `BaseMixin`.

## Non-goals

- UUIDs.
- Database-generated ids.
