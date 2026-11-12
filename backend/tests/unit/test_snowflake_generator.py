from concurrent.futures import ThreadPoolExecutor

import pytest

from app.lib.types import SnowflakeGenerator


def _fixed_clock(gen: SnowflakeGenerator, values: list[int]) -> None:
    ticks = iter(values)
    gen._now = lambda: next(ticks)  # noqa: SLF001


def _ts(snowflake_id: int) -> int:
    return snowflake_id >> 22


def _seq(snowflake_id: int) -> int:
    return snowflake_id & 0xFFF


def test_ids_carry_the_instance_bits():
    gen = SnowflakeGenerator(instance=7)
    assert (next(gen) >> 12) & 0x3FF == 7


def test_same_millisecond_increments_the_sequence():
    gen = SnowflakeGenerator(instance=1)
    _fixed_clock(gen, [1000, 1000, 1000])
    ids = [next(gen) for _ in range(3)]
    assert [_ts(i) for i in ids] == [1000, 1000, 1000]
    assert [_seq(i) for i in ids] == [0, 1, 2]


def test_clock_stepping_back_never_returns_none():
    # The snowflake-id package returned None here: a NULL primary key.
    gen = SnowflakeGenerator(instance=1)
    _fixed_clock(gen, [1000, 990, 995, 1001])
    ids = [next(gen) for _ in range(4)]
    assert all(isinstance(i, int) for i in ids)
    assert ids == sorted(set(ids))
    assert [_ts(i) for i in ids] == [1000, 1000, 1000, 1001]


def test_exhausted_sequence_borrows_the_next_millisecond():
    gen = SnowflakeGenerator(instance=1)
    _fixed_clock(gen, [1000] * 4097)
    ids = [next(gen) for _ in range(4097)]
    assert len(set(ids)) == 4097
    assert _ts(ids[-1]) == 1001
    assert _seq(ids[-1]) == 0


def test_ids_are_unique_across_threads():
    gen = SnowflakeGenerator(instance=1)
    with ThreadPoolExecutor(8) as pool:
        ids = list(pool.map(lambda _: next(gen), range(20_000)))
    assert len(set(ids)) == len(ids)


def test_instance_out_of_range_is_refused():
    with pytest.raises(ValueError):
        SnowflakeGenerator(instance=1024)
