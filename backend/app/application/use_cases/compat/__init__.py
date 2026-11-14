"""The compatibility layer for installed ``applika-cli`` 0.1.4 (ADR 0009).

It translates the retired step/feedback vocabulary onto the timeline and
back. Nothing here owns data: every write lands in ``timeline_events`` and
``applications.finalized_at`` through the same rules the timeline uses.
"""
