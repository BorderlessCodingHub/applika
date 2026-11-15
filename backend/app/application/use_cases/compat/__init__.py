"""The retired step vocabulary, read side only (ADR 0009, ADR-0028).

``step_translation`` maps a timeline event back to its ``steps_definition``
row for the ``last_step`` of every application and the agenda. Nothing here
owns or writes data.
"""
