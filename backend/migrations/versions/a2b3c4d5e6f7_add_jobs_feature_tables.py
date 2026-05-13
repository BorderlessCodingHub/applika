"""add jobs feature tables

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # job_sources
    op.create_table(
        'job_sources',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column(
            'is_enabled', sa.Boolean(), nullable=False, server_default='true'
        ),
        sa.Column(
            'last_scraped_at', sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column('last_scrape_status', sa.String(20), nullable=True),
        sa.Column('last_scrape_error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_job_sources'),
        sa.UniqueConstraint('code', name='uq_job_sources_code'),
    )

    # jobs
    op.create_table(
        'jobs',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source_id', sa.BigInteger(), nullable=False),
        sa.Column('external_id', sa.String(500), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('company_name', sa.String(300), nullable=False),
        sa.Column('company_url', sa.String(2083), nullable=True),
        sa.Column(
            'location_text', sa.String(300), nullable=False,
            server_default='Remote'
        ),
        sa.Column('job_url', sa.String(2083), nullable=False),
        sa.Column('description_raw', sa.Text(), nullable=True),
        sa.Column('description_text', sa.Text(), nullable=False),
        sa.Column('employment_type', sa.String(100), nullable=True),
        sa.Column('salary_text', sa.String(200), nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'is_active', sa.Boolean(), nullable=False, server_default='true'
        ),
        sa.Column('content_hash', sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(
            ['source_id'], ['job_sources.id'],
            name='fk_jobs_source_id',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_jobs'),
        sa.UniqueConstraint(
            'source_id', 'external_id', name='uq_jobs_source_external'
        ),
    )
    op.create_index(
        'idx_jobs_posted_at_desc',
        'jobs',
        [sa.text('posted_at DESC')],
    )
    op.create_index(
        'idx_jobs_source_posted',
        'jobs',
        ['source_id', sa.text('posted_at DESC')],
    )
    op.create_index(
        'idx_jobs_active_posted',
        'jobs',
        ['is_active', sa.text('posted_at DESC')],
    )

    # job_tags
    op.create_table(
        'job_tags',
        sa.Column('job_id', sa.BigInteger(), nullable=False),
        sa.Column('tag', sa.String(200), nullable=False),
        sa.ForeignKeyConstraint(
            ['job_id'], ['jobs.id'],
            ondelete='CASCADE',
            name='fk_job_tags_job_id',
        ),
        sa.PrimaryKeyConstraint('job_id', 'tag', name='pk_job_tags'),
    )
    op.create_index('idx_job_tags_job_id', 'job_tags', ['job_id'])

    # user_resumes
    op.create_table(
        'user_resumes',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('content_type', sa.String(200), nullable=False),
        sa.Column('storage_path', sa.String(1000), nullable=False),
        sa.Column('parsed_text', sa.Text(), nullable=False),
        sa.Column(
            'is_default', sa.Boolean(), nullable=False,
            server_default='false'
        ),
        sa.Column('byte_size', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            ondelete='CASCADE',
            name='fk_user_resumes_user_id',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_user_resumes'),
    )
    op.create_index('idx_user_resumes_user_id', 'user_resumes', ['user_id'])

    # job_fit_snapshots
    op.create_table(
        'job_fit_snapshots',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('job_id', sa.BigInteger(), nullable=False),
        sa.Column('resume_id', sa.BigInteger(), nullable=False),
        sa.Column('fit_score', sa.Integer(), nullable=False),
        sa.Column('matched_keywords_json', sa.Text(), nullable=False),
        sa.Column('missing_keywords_json', sa.Text(), nullable=False),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            ondelete='CASCADE',
            name='fk_job_fit_snapshots_user_id',
        ),
        sa.ForeignKeyConstraint(
            ['job_id'], ['jobs.id'],
            ondelete='CASCADE',
            name='fk_job_fit_snapshots_job_id',
        ),
        sa.ForeignKeyConstraint(
            ['resume_id'], ['user_resumes.id'],
            ondelete='CASCADE',
            name='fk_job_fit_snapshots_resume_id',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_job_fit_snapshots'),
        sa.UniqueConstraint(
            'user_id', 'job_id', 'resume_id',
            name='uq_fit_user_job_resume',
        ),
    )
    op.create_index(
        'idx_fit_snapshots_user_computed',
        'job_fit_snapshots',
        ['user_id', sa.text('computed_at DESC')],
    )

    # tailored_documents
    op.create_table(
        'tailored_documents',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('job_id', sa.BigInteger(), nullable=False),
        sa.Column('resume_id', sa.BigInteger(), nullable=True),
        sa.Column(
            'kind', sa.String(20), nullable=False, server_default='cv'
        ),
        sa.Column(
            'provider', sa.String(50), nullable=False,
            server_default='heuristic'
        ),
        sa.Column(
            'template_version', sa.String(20), nullable=False,
            server_default='1.0'
        ),
        sa.Column('content_json', sa.Text(), nullable=False),
        sa.Column('plain_text', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            ondelete='CASCADE',
            name='fk_tailored_documents_user_id',
        ),
        sa.ForeignKeyConstraint(
            ['job_id'], ['jobs.id'],
            ondelete='CASCADE',
            name='fk_tailored_documents_job_id',
        ),
        sa.ForeignKeyConstraint(
            ['resume_id'], ['user_resumes.id'],
            ondelete='SET NULL',
            name='fk_tailored_documents_resume_id',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_tailored_documents'),
    )

    # ats_reports
    op.create_table(
        'ats_reports',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tailored_document_id', sa.BigInteger(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.Column('warnings_json', sa.Text(), nullable=False),
        sa.Column('missing_keywords_json', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ['tailored_document_id'], ['tailored_documents.id'],
            ondelete='CASCADE',
            name='fk_ats_reports_tailored_document_id',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_ats_reports'),
        sa.UniqueConstraint(
            'tailored_document_id',
            name='uq_ats_reports_tailored_document_id',
        ),
    )

    # Seed job sources
    job_sources = sa.table(
        'job_sources',
        sa.column('code', sa.String),
        sa.column('name', sa.String),
        sa.column('base_url', sa.String),
        sa.column('is_enabled', sa.Boolean),
        sa.column('created_at', sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        job_sources,
        [
            {
                'code': 'himalayas',
                'name': 'Himalayas',
                'base_url': 'https://himalayas.app',
                'is_enabled': True,
                'created_at': sa.func.now(),
            },
            {
                'code': 'remoteok',
                'name': 'RemoteOK',
                'base_url': 'https://remoteok.com',
                'is_enabled': True,
                'created_at': sa.func.now(),
            },
        ],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('ats_reports')
    op.drop_table('tailored_documents')
    op.drop_index(
        'idx_fit_snapshots_user_computed', table_name='job_fit_snapshots'
    )
    op.drop_table('job_fit_snapshots')
    op.drop_index('idx_user_resumes_user_id', table_name='user_resumes')
    op.drop_table('user_resumes')
    op.drop_index('idx_job_tags_job_id', table_name='job_tags')
    op.drop_table('job_tags')
    op.drop_index('idx_jobs_active_posted', table_name='jobs')
    op.drop_index('idx_jobs_source_posted', table_name='jobs')
    op.drop_index('idx_jobs_posted_at_desc', table_name='jobs')
    op.drop_table('jobs')
    op.drop_table('job_sources')
