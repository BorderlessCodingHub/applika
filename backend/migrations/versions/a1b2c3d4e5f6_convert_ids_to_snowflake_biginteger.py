"""convert ids to snowflake biginteger and add enrichment columns

Revision ID: a1b2c3d4e5f6
Revises: 79f1d9bc77de
Create Date: 2026-03-22 00:00:00.000000

Converts all auto-increment INTEGER PKs and FK references to BigInteger,
migrates existing IDs to application-generated Snowflake IDs, and drops
PostgreSQL sequences. Also adds user profile and application enrichment
columns (enums, country, salary fields, etc.).

Downgrade is fully supported: reassigns IDs back to sequential integers,
restores SERIAL sequences, and converts columns back to INTEGER.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '79f1d9bc77de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_currency_enum = sa.Enum(
    'USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR',
    name='currency',
)
_salaryperiod_enum = sa.Enum(
    'HOURLY', 'MONTHLY', 'ANNUAL',
    name='salaryperiod',
)
_experiencelevel_enum = sa.Enum(
    'INTERN', 'JUNIOR', 'MID_LEVEL', 'SENIOR', 'STAFF',
    'LEAD', 'PRINCIPAL', 'SPECIALIST',
    name='experiencelevel',
)
_workmode_enum = sa.Enum(
    'REMOTE', 'HYBRID', 'ON_SITE',
    name='workmode',
)
_availability_enum = sa.Enum(
    'OPEN_TO_WORK', 'CASUALLY_LOOKING', 'NOT_LOOKING',
    name='availability',
)

# (table, column, existing_nullable) for all INTEGER PK/FK columns
_INT_COLUMNS = [
    # Independent tables first (no FK deps)
    ('users', 'id', False),
    ('platforms', 'id', False),
    ('steps_definition', 'id', False),
    ('feedbacks_definition', 'id', False),
    # applications references the above
    ('applications', 'user_id', False),
    ('applications', 'platform_id', False),
    ('applications', 'last_step_id', True),
    ('applications', 'feedback_id', True),
    ('applications', 'id', False),
    # application_steps references applications
    ('application_steps', 'application_id', False),
    ('application_steps', 'step_id', False),
    ('application_steps', 'user_id', False),
    ('application_steps', 'id', False),
    # quinzenal_reports references users
    ('quinzenal_reports', 'user_id', False),
    ('quinzenal_reports', 'id', False),
]

# FK constraints present after 79f1d9bc77de
_FK_CONSTRAINTS = [
    ('fk_applications_user_id', 'applications'),
    ('fk_applications_platform_id', 'applications'),
    ('fk_applications_last_step_id', 'applications'),
    ('fk_applications_feedback_id', 'applications'),
    ('fk_steps_application_id', 'application_steps'),
    ('fk_steps_step_id', 'application_steps'),
    ('fk_application_steps_user_id', 'application_steps'),
    ('fk_quinzenal_reports_user_id', 'quinzenal_reports'),
]

# Tables whose PKs are migrated to Snowflake (order matters for FK updates)
_TABLES = [
    'users',
    'platforms',
    'steps_definition',
    'feedbacks_definition',
    'applications',
    'application_steps',
    'quinzenal_reports',
]

# (table, column, ref_table) for FK value updates
_FK_COLUMNS = [
    ('applications', 'user_id', 'users'),
    ('applications', 'platform_id', 'platforms'),
    ('applications', 'last_step_id', 'steps_definition'),
    ('applications', 'feedback_id', 'feedbacks_definition'),
    ('application_steps', 'application_id', 'applications'),
    ('application_steps', 'step_id', 'steps_definition'),
    ('application_steps', 'user_id', 'users'),
    ('quinzenal_reports', 'user_id', 'users'),
]

# PostgreSQL SERIAL sequence names (application_steps was renamed from 'steps')
_SEQUENCES = {
    'users': 'users_id_seq',
    'platforms': 'platforms_id_seq',
    'steps_definition': 'steps_definition_id_seq',
    'feedbacks_definition': 'feedbacks_definition_id_seq',
    'applications': 'applications_id_seq',
    'application_steps': 'steps_id_seq',
    'quinzenal_reports': 'quinzenal_reports_id_seq',
}


def upgrade() -> None:
    # =========================================================
    # Step 1 — Create enum types
    # =========================================================
    bind = op.get_bind()
    _currency_enum.create(bind, checkfirst=True)
    _salaryperiod_enum.create(bind, checkfirst=True)
    _experiencelevel_enum.create(bind, checkfirst=True)
    _workmode_enum.create(bind, checkfirst=True)
    _availability_enum.create(bind, checkfirst=True)

    # =========================================================
    # Step 2 — Add enrichment columns to applications
    # =========================================================
    op.add_column(
        'applications',
        sa.Column('currency', _currency_enum, nullable=True),
    )
    op.add_column(
        'applications',
        sa.Column('salary_period', _salaryperiod_enum, nullable=True),
    )
    op.add_column(
        'applications',
        sa.Column(
            'experience_level', _experiencelevel_enum, nullable=True
        ),
    )
    op.add_column(
        'applications',
        sa.Column('work_mode', _workmode_enum, nullable=True),
    )
    op.add_column(
        'applications',
        sa.Column('country', sa.String(100), nullable=True),
    )

    # =========================================================
    # Step 3 — Add profile columns to users
    # =========================================================
    op.add_column(
        'users',
        sa.Column('current_role', sa.String(200), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('salary_currency', _currency_enum, nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('salary_period', _salaryperiod_enum, nullable=True),
    )
    op.add_column(
        'users',
        sa.Column(
            'seniority_level', _experiencelevel_enum, nullable=True
        ),
    )
    op.add_column(
        'users',
        sa.Column('location', sa.String(200), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('availability', _availability_enum, nullable=True),
    )
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column(
        'users',
        sa.Column('linkedin_url', sa.String(500), nullable=True),
    )

    # =========================================================
    # Step 4 — Convert INTEGER PK/FK columns to BigInteger
    # =========================================================
    for table, column, existing_nullable in _INT_COLUMNS:
        op.alter_column(
            table,
            column,
            existing_type=sa.INTEGER(),
            type_=sa.BigInteger(),
            existing_nullable=existing_nullable,
        )

    conn = op.get_bind()

    # =========================================================
    # Step 5 — Drop FK constraints (required before PK updates)
    # =========================================================
    for constraint_name, table in _FK_CONSTRAINTS:
        op.drop_constraint(
            constraint_name, table, type_='foreignkey'
        )

    # =========================================================
    # Step 6 — Generate Snowflake IDs and update PKs
    # =========================================================
    id_maps: dict[str, dict[int, int]] = {}
    for table in _TABLES:
        rows = conn.execute(
            sa.text(f'SELECT id FROM {table} ORDER BY id')
        ).fetchall()
        id_maps[table] = {
            row[0]: generate_snowflake_id() for row in rows
        }

    for table in _TABLES:
        mapping = id_maps[table]
        if not mapping:
            continue
        conn.execute(
            sa.text(
                f'UPDATE {table} SET id = :new_id WHERE id = :old_id'
            ),
            [
                {'new_id': new, 'old_id': old}
                for old, new in mapping.items()
            ],
        )

    # =========================================================
    # Step 7 — Update FK columns to match new Snowflake PKs
    # =========================================================
    for table, column, ref_table in _FK_COLUMNS:
        mapping = id_maps[ref_table]
        if not mapping:
            continue
        conn.execute(
            sa.text(
                f'UPDATE {table} SET {column} = :new_id'
                f' WHERE {column} = :old_id'
            ),
            [
                {'new_id': new, 'old_id': old}
                for old, new in mapping.items()
            ],
        )

    # =========================================================
    # Step 8 — Drop SERIAL sequences; IDs now managed by app
    # =========================================================
    for table, seq in _SEQUENCES.items():
        conn.execute(
            sa.text(
                f'ALTER TABLE {table} ALTER COLUMN id DROP DEFAULT'
            )
        )
        conn.execute(sa.text(f'DROP SEQUENCE IF EXISTS {seq}'))

    # =========================================================
    # Step 9 — Restore FK constraints
    # =========================================================
    op.create_foreign_key(
        'fk_applications_user_id', 'applications', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_applications_platform_id', 'applications', 'platforms',
        ['platform_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_last_step_id', 'applications',
        'steps_definition', ['last_step_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_feedback_id', 'applications',
        'feedbacks_definition', ['feedback_id'], ['id'],
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
    conn = op.get_bind()

    # =========================================================
    # Step 1 — Drop FK constraints
    # =========================================================
    for constraint_name, table in _FK_CONSTRAINTS:
        op.drop_constraint(
            constraint_name, table, type_='foreignkey'
        )

    # =========================================================
    # Step 2 — Reassign Snowflake IDs to sequential integers
    #
    # Snowflake IDs (~19 digits) are always larger than any
    # sequential integer (1, 2, 3...) so there are no collision
    # risks during this batch update.
    # =========================================================
    id_maps: dict[str, dict[int, int]] = {}
    for table in _TABLES:
        rows = conn.execute(
            sa.text(f'SELECT id FROM {table} ORDER BY id')
        ).fetchall()
        id_maps[table] = {
            row[0]: i + 1 for i, row in enumerate(rows)
        }

    for table in _TABLES:
        mapping = id_maps[table]
        if not mapping:
            continue
        conn.execute(
            sa.text(
                f'UPDATE {table} SET id = :new_id WHERE id = :old_id'
            ),
            [
                {'new_id': new, 'old_id': old}
                for old, new in mapping.items()
            ],
        )

    # =========================================================
    # Step 3 — Update FK columns to match restored sequential PKs
    # =========================================================
    for table, column, ref_table in _FK_COLUMNS:
        mapping = id_maps[ref_table]
        if not mapping:
            continue
        conn.execute(
            sa.text(
                f'UPDATE {table} SET {column} = :new_id'
                f' WHERE {column} = :old_id'
            ),
            [
                {'new_id': new, 'old_id': old}
                for old, new in mapping.items()
            ],
        )

    # =========================================================
    # Step 4 — Convert BigInteger columns back to INTEGER
    #
    # Values are now small sequential integers so the cast is safe.
    # Reverse the order used in upgrade (dependents first).
    # =========================================================
    for table, column, existing_nullable in reversed(_INT_COLUMNS):
        op.alter_column(
            table,
            column,
            existing_type=sa.BigInteger(),
            type_=sa.INTEGER(),
            existing_nullable=existing_nullable,
        )

    # =========================================================
    # Step 5 — Recreate SERIAL sequences and set auto-increment
    # =========================================================
    for table, seq in _SEQUENCES.items():
        max_id = conn.execute(
            sa.text(f'SELECT COALESCE(MAX(id), 0) FROM {table}')
        ).scalar()
        conn.execute(
            sa.text(
                f'CREATE SEQUENCE {seq} START WITH {max_id + 1}'
            )
        )
        conn.execute(
            sa.text(
                f"ALTER TABLE {table} ALTER COLUMN id"
                f" SET DEFAULT nextval('{seq}'::regclass)"
            )
        )

    # =========================================================
    # Step 6 — Restore FK constraints
    # =========================================================
    op.create_foreign_key(
        'fk_applications_user_id', 'applications', 'users',
        ['user_id'], ['id'], ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_applications_platform_id', 'applications', 'platforms',
        ['platform_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_last_step_id', 'applications',
        'steps_definition', ['last_step_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_applications_feedback_id', 'applications',
        'feedbacks_definition', ['feedback_id'], ['id'],
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

    # =========================================================
    # Step 7 — Drop enrichment columns
    # =========================================================
    op.drop_column('applications', 'country')
    op.drop_column('applications', 'work_mode')
    op.drop_column('applications', 'experience_level')
    op.drop_column('applications', 'salary_period')
    op.drop_column('applications', 'currency')
    op.drop_column('users', 'linkedin_url')
    op.drop_column('users', 'bio')
    op.drop_column('users', 'availability')
    op.drop_column('users', 'location')
    op.drop_column('users', 'seniority_level')
    op.drop_column('users', 'salary_period')
    op.drop_column('users', 'salary_currency')
    op.drop_column('users', 'current_role')

    # =========================================================
    # Step 8 — Drop enum types
    # =========================================================
    bind = op.get_bind()
    _availability_enum.drop(bind, checkfirst=True)
    _workmode_enum.drop(bind, checkfirst=True)
    _experiencelevel_enum.drop(bind, checkfirst=True)
    _salaryperiod_enum.drop(bind, checkfirst=True)
    _currency_enum.drop(bind, checkfirst=True)
