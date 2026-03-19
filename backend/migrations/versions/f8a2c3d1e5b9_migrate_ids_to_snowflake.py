"""migrate ids to snowflake biginteger

Revision ID: f8a2c3d1e5b9
Revises: bcc794104101
Create Date: 2026-03-19 12:00:00.000000

This migration replaces all auto-incremented integer PKs and their FK references
with application-generated Snowflake IDs. It also drops the PostgreSQL sequences
used by the old SERIAL columns, since IDs are now generated at the application layer.

Downgrade is intentionally not supported — this is a one-way version upgrade.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = 'f8a2c3d1e5b9'
down_revision: Union[str, Sequence[str], None] = 'bcc794104101'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # =========================================================================
    # Step 1 — Drop all FK constraints so we can freely update PKs and FKs
    # =========================================================================
    op.drop_constraint(
        'fk_quinzenal_reports_user_id', 'quinzenal_reports', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_application_steps_user_id', 'application_steps', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_steps_application_id', 'application_steps', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_steps_step_id', 'application_steps', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_applications_user_id', 'applications', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_applications_platform_id', 'applications', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_applications_company_id', 'applications', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_applications_last_step_id', 'applications', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_applications_feedback_id', 'applications', type_='foreignkey'
    )
    op.drop_constraint(
        'fk_companies_created_by', 'companies', type_='foreignkey'
    )

    # =========================================================================
    # Step 2 — Fetch existing IDs and generate new Snowflake IDs for each table
    # =========================================================================
    tables = [
        'users',
        'platforms',
        'steps_definition',
        'feedbacks_definition',
        'companies',
        'applications',
        'application_steps',
        'quinzenal_reports',
    ]

    id_maps: dict[str, dict[int, int]] = {}
    for table in tables:
        rows = conn.execute(
            sa.text(f'SELECT id FROM {table} ORDER BY id')
        ).fetchall()
        id_maps[table] = {row[0]: generate_snowflake_id() for row in rows}

    # =========================================================================
    # Step 3 — Update primary keys on each table
    #
    # Snowflake IDs (~18-19 digits) are far larger than the old sequential
    # integers, so there is no risk of collision between old and new values.
    # =========================================================================
    for table in tables:
        mapping = id_maps[table]
        if not mapping:
            continue
        conn.execute(
            sa.text(f'UPDATE {table} SET id = :new_id WHERE id = :old_id'),
            [{'new_id': new, 'old_id': old} for old, new in mapping.items()],
        )

    # =========================================================================
    # Step 4 — Update all FK columns using the PK mappings of referenced tables
    #
    # Nullable FKs (created_by, last_step_id, feedback_id) are handled safely:
    # NULL rows are not matched by the WHERE clause and remain NULL.
    # =========================================================================
    fk_columns = [
        # (table,               column,           ref_table)
        ('companies',          'created_by',      'users'),
        ('applications',       'user_id',          'users'),
        ('applications',       'platform_id',      'platforms'),
        ('applications',       'company_id',       'companies'),
        ('applications',       'last_step_id',     'steps_definition'),
        ('applications',       'feedback_id',      'feedbacks_definition'),
        ('application_steps',  'application_id',   'applications'),
        ('application_steps',  'step_id',          'steps_definition'),
        ('application_steps',  'user_id',          'users'),
        ('quinzenal_reports',  'user_id',          'users'),
    ]

    for table, column, ref_table in fk_columns:
        mapping = id_maps[ref_table]
        if not mapping:
            continue
        conn.execute(
            sa.text(
                f'UPDATE {table} SET {column} = :new_id WHERE {column} = :old_id'
            ),
            [{'new_id': new, 'old_id': old} for old, new in mapping.items()],
        )

    # =========================================================================
    # Step 5 — Drop SERIAL sequences and remove DEFAULT on id columns
    #
    # IDs are now generated by generate_snowflake_id() at the application layer.
    # Note: the 'application_steps' table was renamed from 'steps', but the
    # PostgreSQL sequence kept its original name 'steps_id_seq'.
    # =========================================================================
    sequence_map = {
        'users':               'users_id_seq',
        'platforms':           'platforms_id_seq',
        'steps_definition':    'steps_definition_id_seq',
        'feedbacks_definition':'feedbacks_definition_id_seq',
        'companies':           'companies_id_seq',
        'applications':        'applications_id_seq',
        'application_steps':   'steps_id_seq',
        'quinzenal_reports':   'quinzenal_reports_id_seq',
    }
    for table, seq in sequence_map.items():
        conn.execute(
            sa.text(f'ALTER TABLE {table} ALTER COLUMN id DROP DEFAULT')
        )
        conn.execute(sa.text(f'DROP SEQUENCE IF EXISTS {seq}'))

    # =========================================================================
    # Step 6 — Re-add FK constraints
    # =========================================================================
    op.create_foreign_key(
        'fk_companies_created_by', 'companies', 'users',
        ['created_by'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_applications_user_id', 'applications', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_applications_platform_id', 'applications', 'platforms',
        ['platform_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_company_id', 'applications', 'companies',
        ['company_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_last_step_id', 'applications', 'steps_definition',
        ['last_step_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_feedback_id', 'applications', 'feedbacks_definition',
        ['feedback_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_steps_application_id', 'application_steps', 'applications',
        ['application_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_steps_step_id', 'application_steps', 'steps_definition',
        ['step_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_application_steps_user_id', 'application_steps', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_quinzenal_reports_user_id', 'quinzenal_reports', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    raise NotImplementedError(
        'Downgrade not supported: migrating from Snowflake IDs back to '
        'sequential integers is not possible without a data snapshot.'
    )
