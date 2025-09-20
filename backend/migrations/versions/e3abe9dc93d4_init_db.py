"""'init db'

Revision ID: e3abe9dc93d4
Revises:
Create Date: 2025-09-18 11:56:21.494191

"""

from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3abe9dc93d4'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def insert_initial_data() -> None:
    now = datetime.now(timezone.utc)

    platforms_table = sa.table(
        'platforms',
        sa.column('name', sa.String),
        sa.column('url', sa.String),
        sa.column('created_at', sa.DateTime(timezone=True)),
    )

    steps_table = sa.table(
        'steps_definition',
        sa.column('name', sa.String),
        sa.column('color', sa.String),
        sa.column('created_at', sa.DateTime(timezone=True)),
    )

    feedbacks_table = sa.table(
        'feedbacks_definition',
        sa.column('name', sa.String),
        sa.column('color', sa.String),
        sa.column('created_at', sa.DateTime(timezone=True)),
    )

    # Platforms
    op.bulk_insert(
        platforms_table,
        [
            {'name': 'Arc', 'url': 'https://arc.dev', 'created_at': now},
            {
                'name': 'Codesta',
                'url': 'https://www.codesta.io',
                'created_at': now,
            },
            {
                'name': 'Lever',
                'url': 'https://www.lever.co',
                'created_at': now,
            },
            {
                'name': 'LinkedIn',
                'url': 'https://linkedin.com',
                'created_at': now,
            },
            {
                'name': 'RemoteOK',
                'url': 'https://remoteok.com',
                'created_at': now,
            },
            {
                'name': 'Sigma',
                'url': 'https://www.sigma.se/career/jobs/',
                'created_at': now,
            },
            {
                'name': 'Tarmac',
                'url': 'https://jobsearch.tarmac.com',
                'created_at': now,
            },
            {
                'name': 'web3.career',
                'url': 'https://web3.career',
                'created_at': now,
            },
            {
                'name': 'WeWorkRemotely',
                'url': 'https://weworkremotely.com',
                'created_at': now,
            },
            {
                'name': 'Whitespectre',
                'url': 'https://www.whitespectre.com',
                'created_at': now,
            },
            {
                'name': 'Working Nomads',
                'url': 'https://www.workingnomads.com/jobs',
                'created_at': now,
            },
            {
                'name': 'YCombinator',
                'url': 'https://www.ycombinator.com/jobs',
                'created_at': now,
            },
            {
                'name': 'Himalayas',
                'url': 'https://himalayas.app/',
                'created_at': now,
            },
            {
                'name': 'Remote Rocketship',
                'url': 'https://www.remoterocketship.com/',
                'created_at': now,
            },
            {
                'name': 'Jobright',
                'url': 'https://jobright.ai/',
                'created_at': now,
            },
        ],
    )

    # Steps
    op.bulk_insert(
        steps_table,
        [
            {'name': 'Application', 'color': '#b5a2dd', 'created_at': now},
            {'name': 'Initial Screen', 'color': '#a892d3', 'created_at': now},
            {'name': 'Phase 2', 'color': '#9373d3', 'created_at': now},
            {'name': 'Phase 3', 'color': '#7b52cb', 'created_at': now},
            {'name': 'Phase 4', 'color': '#662ed6', 'created_at': now},
            {'name': 'Offer', 'color': '#31d845', 'created_at': now},
            {'name': 'Denied', 'color': '#cf3030', 'created_at': now},
        ],
    )

    # Feedbacks
    op.bulk_insert(
        feedbacks_table,
        [
            {'name': 'On going', 'color': '#47bfd7', 'created_at': now},
            {'name': 'Accepted', 'color': '#4dc771', 'created_at': now},
            {'name': 'Not good enough', 'color': '#d29137', 'created_at': now},
            {
                'name': 'Too many candidates',
                'color': '#cdc02d',
                'created_at': now,
            },
            {'name': 'Position filled', 'color': '#d14415', 'created_at': now},
            {'name': 'Ghost', 'color': '#bababa', 'created_at': now},
            {'name': 'Skills', 'color': '#d74299', 'created_at': now},
            {'name': 'Role closed', 'color': '#ac372a', 'created_at': now},
            {
                'name': 'Assessment failed',
                'color': '#d50707',
                'created_at': now,
            },
        ],
    )


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        'feedbacks_definition',
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=False),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_feedbacks_definition'),
    )
    op.create_table(
        'platforms',
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('url', sa.String(length=200), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_platforms'),
    )
    op.create_table(
        'steps_definition',
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=False),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_steps_definition'),
    )
    op.create_table(
        'users',
        sa.Column('github_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('email', sa.String(length=100), nullable=False),
        sa.Column('current_company', sa.String(length=200), nullable=True),
        sa.Column(
            'current_salary', sa.Numeric(precision=10, scale=2), nullable=True
        ),
        sa.Column('experience_years', sa.Integer(), nullable=False),
        sa.Column('_tech_stack', sa.Text(), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_users'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(
        op.f('ix_users_github_id'), 'users', ['github_id'], unique=True
    )
    op.create_table(
        'applications',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('platform_id', sa.Integer(), nullable=False),
        sa.Column('application_date', sa.Date(), nullable=False),
        sa.Column('company', sa.String(length=200), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=False),
        sa.Column('mode', sa.String(length=10), nullable=True),
        sa.Column('observation', sa.Text(), nullable=True),
        sa.Column(
            'salary_offer', sa.Numeric(precision=10, scale=2), nullable=True
        ),
        sa.Column(
            'expected_salary', sa.Numeric(precision=10, scale=2), nullable=True
        ),
        sa.Column(
            'salary_range_min',
            sa.Numeric(precision=10, scale=2),
            nullable=True,
        ),
        sa.Column(
            'salary_range_max',
            sa.Numeric(precision=10, scale=2),
            nullable=True,
        ),
        sa.Column('last_step', sa.Integer(), nullable=True),
        sa.Column('last_step_date', sa.Date(), nullable=True),
        sa.Column('feedback_id', sa.Integer(), nullable=True),
        sa.Column('feedback_date', sa.Date(), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['feedback_id'],
            ['feedbacks_definition.id'],
            name='fk_applications_feedback_id',
        ),
        sa.ForeignKeyConstraint(
            ['last_step'],
            ['steps_definition.id'],
            name='fk_applications_last_step',
        ),
        sa.ForeignKeyConstraint(
            ['platform_id'],
            ['platforms.id'],
            name='fk_applications_platform_id',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            ondelete='CASCADE',
            name='fk_applications_user_id',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_applications'),
    )
    op.create_table(
        'steps',
        sa.Column('application_id', sa.Integer(), nullable=False),
        sa.Column('step_id', sa.Integer(), nullable=False),
        sa.Column('step_date', sa.Date(), nullable=False),
        sa.Column('observation', sa.Text(), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['application_id'],
            ['applications.id'],
            ondelete='CASCADE',
            name='fk_steps_application_id',
        ),
        sa.ForeignKeyConstraint(
            ['step_id'], ['steps_definition.id'], name='fk_steps_step_id'
        ),
        sa.PrimaryKeyConstraint('id', name='pk_steps'),
    )
    insert_initial_data()
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('steps')
    op.drop_table('applications')
    op.drop_index(op.f('ix_users_github_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('steps_definition')
    op.drop_table('platforms')
    op.drop_table('feedbacks_definition')
    # ### end Alembic commands ###
