from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.enums import (
    Availability,
    Currency,
    DeniedReason,
    DiscordConnectionStatus,
    EventType,
    ExperienceLevel,
    InterviewType,
    SalaryPeriod,
    WorkMode,
)
from app.lib.types import generate_snowflake_id

# ``salaryperiod`` stores enum *names* (upper case). ``ANNUAL`` is the legacy
# label: rows written before R-031 still hold it until the contract migration
# remaps them, and it must read back as ``annually``. ``ANNUALLY`` is what
# every write stores now. The order is the one production has
# (``a1b2c3d4e5f6`` created the first three, ``afd4074c70c2`` appended
# ``ANNUALLY``), so the ``create_all`` test schema carries all four labels.
SALARY_PERIOD_LABELS = ('HOURLY', 'MONTHLY', 'ANNUAL', 'ANNUALLY')
LEGACY_SALARY_PERIOD_LABELS: dict[str, SalaryPeriod] = {
    'ANNUAL': SalaryPeriod.ANNUALLY,
}


class SalaryPeriodType(sa.types.TypeDecorator[SalaryPeriod]):
    """The ``salaryperiod`` PG enum, mapped to ``SalaryPeriod``.

    A plain ``sa.Enum(SalaryPeriod)`` cannot read a label that is not a
    member name, and ``ANNUAL`` no longer is one (owner decision (c): "rename
    to annually"). This type binds ``SalaryPeriod.ANNUALLY`` as ``ANNUALLY``
    and reads both ``ANNUAL`` and ``ANNUALLY`` as ``SalaryPeriod.ANNUALLY``,
    so the API never returns ``annual`` and never writes ``ANNUAL``. The
    labels themselves are untouched: remapping the rows is the contract
    migration's job (R2, KODI-013).
    """

    impl = sa.Enum(
        *SALARY_PERIOD_LABELS,
        name='salaryperiod',
        create_constraint=False,
        native_enum=True,
    )
    cache_ok = True

    def process_bind_param(
        self, value: SalaryPeriod | str | None, dialect: sa.Dialect
    ) -> str | None:
        if value is None:
            return None
        return SalaryPeriod(value).name

    def process_result_value(
        self, value: str | None, dialect: sa.Dialect
    ) -> SalaryPeriod | None:
        if value is None:
            return None
        legacy = LEGACY_SALARY_PERIOD_LABELS.get(value)
        return legacy if legacy is not None else SalaryPeriod[value]


def _lower_case_enum(
    enum_class: type[EventType] | type[InterviewType] | type[DeniedReason],
    name: str,
):
    """A PG enum whose labels are the member *values* (R1/R3 created them
    so)."""
    return sa.Enum(
        enum_class,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        create_constraint=False,
        native_enum=True,
    )


class BaseMixin:
    id: Mapped[int] = mapped_column(
        sa.BigInteger,
        primary_key=True,
        nullable=False,
        default=generate_snowflake_id,
    )

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=sa.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        default=None,
        onupdate=sa.func.now(),
        nullable=True,
    )


class Base(DeclarativeBase): ...


class UserModel(BaseMixin, Base):
    __tablename__ = 'users'

    github_id: Mapped[int] = mapped_column(
        sa.BigInteger, unique=True, index=True, nullable=False
    )
    username: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    email: Mapped[str] = mapped_column(
        sa.String(100), unique=True, index=True, nullable=False
    )
    first_name: Mapped[str | None] = mapped_column(sa.String(100))
    last_name: Mapped[str | None] = mapped_column(sa.String(100))
    current_company: Mapped[str | None] = mapped_column(sa.String(200))
    current_salary: Mapped[float | None] = mapped_column(sa.Numeric(10, 2))
    experience_years: Mapped[int] = mapped_column(sa.Integer, default=0)
    _tech_stack: Mapped[str | None] = mapped_column(sa.Text)
    current_role: Mapped[str | None] = mapped_column(sa.String(200))
    salary_currency: Mapped[Currency | None] = mapped_column(
        sa.Enum(
            Currency,
            name='currency',
            create_constraint=False,
            native_enum=True,
        )
    )
    salary_period: Mapped[SalaryPeriod | None] = mapped_column(
        SalaryPeriodType()
    )
    seniority_level: Mapped[ExperienceLevel | None] = mapped_column(
        sa.Enum(
            ExperienceLevel,
            name='experiencelevel',
            create_constraint=False,
            native_enum=True,
        )
    )
    location: Mapped[str | None] = mapped_column(sa.String(200))
    availability: Mapped[Availability | None] = mapped_column(
        sa.Enum(
            Availability,
            name='availability',
            create_constraint=False,
            native_enum=True,
        )
    )
    bio: Mapped[str | None] = mapped_column(sa.Text)
    linkedin_url: Mapped[str | None] = mapped_column(sa.String(500))
    encrypted_github_token: Mapped[str | None] = mapped_column(
        sa.Text, nullable=True
    )
    is_admin: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default='false', nullable=False
    )
    # KODI-024/ADR-0013: the Discord account link is no longer a column on
    # this table - it moved to its own ``DiscordConnectionModel`` row
    # (revision ``ba44f9cfd3c1``), read through
    # ``DiscordConnectionRepository``. ``users`` carries no Discord column at
    # all, and GitHub stays the only way to sign in.
    # KODI-026/ADR-0013: GitHub organisation membership is retired (R-042,
    # R-043). The retired flag column stays in the database (never dropped,
    # `.claude/rules/non-destructive-migrations.md`) but is intentionally
    # left off this model - no code reads or writes it any more.

    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='user'
    )
    created_companies: Mapped[list[CompanyModel]] = relationship(
        back_populates='created_by_user'
    )
    created_platforms: Mapped[list[PlatformModel]] = relationship(
        back_populates='created_by_user'
    )
    quinzenal_reports: Mapped[list[QuinzenalReportModel]] = relationship(
        back_populates='user'
    )
    user_feedbacks: Mapped[list[UserFeedbackModel]] = relationship(
        back_populates='user'
    )
    cycles: Mapped[list[CycleModel]] = relationship(back_populates='user')

    @property
    def tech_stack(self) -> list[str]:
        if self._tech_stack:
            return self._tech_stack.split(',')
        return []

    @tech_stack.setter
    def tech_stack(self, techs: list[str] | None):
        if techs:
            techs = [tech.strip() for tech in techs if tech.strip()]
            self._tech_stack = ','.join(techs)
        else:
            self._tech_stack = None


class DiscordConnectionModel(BaseMixin, Base):
    """One Discord account connection per Applika user (KODI-024, ADR-0013).

    Mapped object-for-object onto migration ``ba44f9cfd3c1``: ``user_id`` and
    ``discord_id`` are each UNIQUE (AC1/AC2 - a Discord account links to at
    most one Applika user, and a user holds at most one connection), the
    refresh token is stored encrypted and there is **no** access-token
    column - the access token is never persisted (R-013). The server list
    and role ids are read live at submit time (K7/K8) and never stored here.

    A record of its own, apart from the user's account data (R-012): no ORM
    relationship is declared back on ``UserModel``, the same choice already
    made for ``BaseCVModel``/``TailoredCVModel``. ``ondelete='CASCADE'`` is
    what removes this row when the owning user is deleted (R-011).
    """

    __tablename__ = 'discord_connections'

    __table_args__ = (
        sa.UniqueConstraint('user_id', name='uq_discord_connections_user_id'),
        sa.UniqueConstraint(
            'discord_id', name='uq_discord_connections_discord_id'
        ),
    )

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id',
            ondelete='CASCADE',
            name='fk_discord_connections_user_id',
        ),
        nullable=False,
    )
    discord_id: Mapped[int] = mapped_column(sa.BigInteger, nullable=False)
    username: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    global_name: Mapped[str | None] = mapped_column(sa.String(32))
    avatar: Mapped[str | None] = mapped_column(sa.String(64))
    scopes: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    encrypted_refresh_token: Mapped[str] = mapped_column(
        sa.Text, nullable=False
    )
    access_token_expires_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True)
    )
    status: Mapped[DiscordConnectionStatus] = mapped_column(
        sa.Enum(
            DiscordConnectionStatus,
            name='discord_connection_status',
            values_callable=lambda members: [m.value for m in members],
            create_constraint=False,
            native_enum=True,
        ),
        nullable=False,
        default=DiscordConnectionStatus.ACTIVE,
        server_default='active',
    )
    linked_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        default=sa.func.now(),
        server_default=sa.func.now(),
    )


class DiscordReportWebhookModel(BaseMixin, Base):
    """Admin-managed report webhook catalog (KODI-025, ADR-0013).

    Mapped object-for-object onto migration ``ba44f9cfd3c1``: a platform
    catalog row, no ``user_id`` (ADR-0004 - admin-only, not owned by a
    user), a unique ``webhook_url`` and an indexed ``guild_id`` - K8's
    submit-time lookup "selects the webhooks of those servers". Optional
    ``role_ids`` defaults to an empty array; ``label`` is optional free
    text. ``webhook_url`` is ``repr=False``-equivalent here: ``__repr__`` is
    overridden so the URL never appears in a log line or a debugger dump
    (R-030/AC3).
    """

    __tablename__ = 'discord_report_webhooks'

    __table_args__ = (
        sa.UniqueConstraint(
            'webhook_url', name='uq_discord_report_webhooks_webhook_url'
        ),
        sa.Index('ix_discord_report_webhooks_guild_id', 'guild_id'),
    )

    guild_id: Mapped[int] = mapped_column(sa.BigInteger, nullable=False)
    webhook_url: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    role_ids: Mapped[list[int]] = mapped_column(
        ARRAY(sa.BigInteger),
        nullable=False,
        default=list,
        server_default='{}',
    )
    label: Mapped[str | None] = mapped_column(sa.String(100))

    def __repr__(self) -> str:
        return (
            f'<DiscordReportWebhookModel id={self.id} '
            f'guild_id={self.guild_id} label={self.label!r}>'
        )


class CompanyModel(BaseMixin, Base):
    """A job company (ADR-0014). Public rows are shared catalog entries;
    a private row is visible only to the user who created it, until an
    admin publishes it (``PublishCompanyUseCase``).

    ``__table_args__`` mirrors migration ``3b78c3cd2a71`` object for object:
    one public row per ``(lower(name), url)`` and one private row per
    ``(created_by, lower(name), url)`` - two users may hold a private company
    with the same name and url (R-024), but neither a second identical
    public row nor a second identical private row for the same creator is
    allowed. ``create_all`` (the test schema) must build the same two
    indexes the migration does, so the old single global
    ``uq_companies_name_url`` declaration is gone - the migration replaced it
    with these two.
    """

    __tablename__ = 'companies'

    __table_args__ = (
        sa.Index(
            'uq_companies_public_name_url',
            sa.text('lower(name)'),
            'url',
            unique=True,
            postgresql_where=sa.text('is_public'),
        ),
        sa.Index(
            'uq_companies_private_owner_name_url',
            'created_by',
            sa.text('lower(name)'),
            'url',
            unique=True,
            postgresql_where=sa.text('NOT is_public'),
        ),
    )

    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    url: Mapped[str] = mapped_column(sa.String(2083), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, nullable=False
    )
    # ADR-0014: every row that existed before this ticket is public
    # (server_default true, migration 3b78c3cd2a71); a row a user adds
    # through the ordinary create flows is private until an admin publishes
    # it.
    is_public: Mapped[bool] = mapped_column(
        sa.Boolean,
        default=True,
        server_default=sa.text('true'),
        nullable=False,
    )
    created_by: Mapped[int | None] = mapped_column(
        sa.ForeignKey('users.id', ondelete='SET NULL')
    )

    created_by_user: Mapped[UserModel | None] = relationship(
        back_populates='created_companies'
    )
    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='company_rel'
    )


class PlatformModel(BaseMixin, Base):
    """A job platform (ADR-0014), same private-until-published shape as
    ``CompanyModel``. Only *private* platform names are scoped unique per
    creator (``uq_platforms_private_owner_name``) - there is deliberately no
    uniqueness on public platform names, because production may already
    hold duplicate public platform rows (migration ``3b78c3cd2a71``'s own
    docstring).
    """

    __tablename__ = 'platforms'

    __table_args__ = (
        sa.Index('ix_platforms_created_by', 'created_by'),
        sa.Index(
            'uq_platforms_private_owner_name',
            'created_by',
            sa.text('lower(name)'),
            unique=True,
            postgresql_where=sa.text('NOT is_public'),
        ),
    )

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    url: Mapped[str | None] = mapped_column(sa.String(200))
    is_public: Mapped[bool] = mapped_column(
        sa.Boolean,
        default=True,
        server_default=sa.text('true'),
        nullable=False,
    )
    created_by: Mapped[int | None] = mapped_column(
        sa.ForeignKey(
            'users.id',
            ondelete='SET NULL',
            name='fk_platforms_created_by',
        )
    )

    created_by_user: Mapped[UserModel | None] = relationship(
        back_populates='created_platforms'
    )
    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='platform'
    )


class StepDefinitionModel(BaseMixin, Base):
    __tablename__ = 'steps_definition'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#007bff')
    # strict steps is only used in application finalization form
    strict: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    # The mapping store of the compat layer (revision afd4074c70c2, owner
    # decision (a)): which timeline event a legacy step becomes. NULL on a
    # definition created after that revision; the translator then falls back
    # to interview/unknown, like the revision's STEP_FALLBACK.
    event_type: Mapped[EventType | None] = mapped_column(
        _lower_case_enum(EventType, 'event_type'), nullable=True
    )
    interview_type: Mapped[InterviewType | None] = mapped_column(
        _lower_case_enum(InterviewType, 'interview_type'), nullable=True
    )


class FeedbackDefinitionModel(BaseMixin, Base):
    __tablename__ = 'feedbacks_definition'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#28a745')


class CycleModel(BaseMixin, Base):
    __tablename__ = 'cycles'

    __table_args__ = (sa.Index('idx_cycles_user_id', 'user_id'),)

    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)

    user: Mapped[UserModel] = relationship(back_populates='cycles')
    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='cycle'
    )
    quinzenal_reports: Mapped[list[QuinzenalReportModel]] = relationship(
        back_populates='cycle'
    )


class ApplicationModel(BaseMixin, Base):
    """Job applications (R-001..R-020) plus the draft flag (ADR-0014,
    KODI-032). ``is_draft`` (``server_default false``, migration
    ``3b78c3cd2a71``) marks a "new application with CV" draft: it is
    excluded from every read model by default
    (``domain/repositories/application_filters.NOT_DRAFT``) - the
    applications list, statistics, reports, cycles, the agenda and admin
    counts all see only ``is_draft = false`` rows. The one caller that opts
    back in is ``tailored_cvs/guards.load_owned_application``, so the CV
    copy routes (create/get/update/delete/diff/pdf/markdown) work on a
    draft the same as on a finished application. ``__table_args__`` mirrors
    ``ix_applications_user_id_drafts`` object for object, because the test
    schema is built with ``create_all``.
    """

    __tablename__ = 'applications'

    __table_args__ = (
        sa.Index(
            'ix_applications_user_id_drafts',
            'user_id',
            postgresql_where=sa.text('is_draft'),
        ),
        # KODI-047, revision b28d5134631f: one application per user per job
        # (R-021). NULLs are free, so hand-made applications never collide.
        sa.Index(
            'uq_applications_user_job',
            'user_id',
            'job_id',
            unique=True,
            postgresql_where=sa.text('job_id IS NOT NULL'),
        ),
    )

    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )
    platform_id: Mapped[int] = mapped_column(
        sa.ForeignKey('platforms.id'), nullable=False
    )

    company_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey('companies.id'), nullable=True
    )
    cycle_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey('cycles.id', ondelete='SET NULL'), nullable=True
    )

    application_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    role: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    mode: Mapped[Literal['active', 'passive']] = mapped_column(
        sa.String(10), nullable=False
    )
    observation: Mapped[str | None] = mapped_column(sa.Text)
    link_to_job: Mapped[str | None] = mapped_column(sa.String(2083))
    # The pasted job posting, shown beside the application's CV copy and the
    # only application field the tailoring port reads. Nullable and additive
    # (revision f2a9c1d4b6e8), so a published CLI that never sends it keeps
    # working.
    job_description: Mapped[str | None] = mapped_column(sa.Text)

    expected_salary: Mapped[float | None] = mapped_column(sa.Numeric(10, 2))
    salary_range_min: Mapped[float | None] = mapped_column(sa.Numeric(10, 2))
    salary_range_max: Mapped[float | None] = mapped_column(sa.Numeric(10, 2))

    company_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)

    currency: Mapped[Currency | None] = mapped_column(
        sa.Enum(
            Currency,
            name='currency',
            create_constraint=False,
            native_enum=True,
            create_type=False,
        )
    )
    salary_period: Mapped[SalaryPeriod | None] = mapped_column(
        SalaryPeriodType()
    )
    experience_level: Mapped[ExperienceLevel | None] = mapped_column(
        sa.Enum(
            ExperienceLevel,
            name='experiencelevel',
            create_constraint=False,
            native_enum=True,
            create_type=False,
        )
    )
    work_mode: Mapped[WorkMode | None] = mapped_column(
        sa.Enum(
            WorkMode,
            name='workmode',
            create_constraint=False,
            native_enum=True,
        )
    )
    country: Mapped[str | None] = mapped_column(sa.String(100))

    # Closed (reversible) when set, open when NULL (R-007, R-008). Revision
    # afd4074c70c2 backfilled it from the legacy feedback_date. The legacy
    # last_step_id, last_step_date, feedback_id, feedback_date and
    # salary_offer columns still exist in the table but are no longer mapped:
    # the timeline is the single source of truth, and the contract migration
    # (R2) retires them.
    finalized_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )

    # KODI-032, ADR-0014: a "new application with CV" draft. Excluded from
    # every read model by default (NOT_DRAFT); see the class docstring.
    is_draft: Mapped[bool] = mapped_column(
        sa.Boolean,
        default=False,
        server_default=sa.text('false'),
        nullable=False,
    )

    # KODI-047 (PRD 0012 R-017/R-021): the job this application was started
    # from, kept when the job leaves the list (R-007) and cleared only when
    # the job row itself is deleted (``ON DELETE SET NULL``). Read only by the
    # drafts and the jobs routes: the ``Application`` response schema - what
    # ``GET /applications`` and every published CLI read - never carries it
    # (``.claude/rules/cli-compatibility.md``).
    job_id: Mapped[int | None] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'jobs.id', ondelete='SET NULL', name='fk_applications_job_id'
        ),
        nullable=True,
    )

    user: Mapped[UserModel] = relationship(back_populates='applications')
    company_rel: Mapped[CompanyModel | None] = relationship(
        back_populates='applications'
    )
    platform: Mapped[PlatformModel] = relationship(
        back_populates='applications'
    )
    # Bulk DELETEs (ApplicationRepository.delete_by_id, the cycle cascade)
    # rely on the FK ON DELETE CASCADE, hence ``passive_deletes``.
    timeline_events: Mapped[list['TimelineEventModel']] = relationship(
        back_populates='application', passive_deletes=True
    )
    cycle: Mapped[CycleModel | None] = relationship(
        back_populates='applications'
    )
    # At most one CV copy per application (UNIQUE on
    # tailored_cvs.application_id). ``passive_deletes`` is load-bearing:
    # ApplicationRepository.delete_by_id issues a bulk DELETE statement, which
    # runs no ORM cascade, so the copy disappears because of the FK
    # ON DELETE CASCADE. Without this flag SQLAlchemy would try to null out
    # the child's NOT NULL application_id whenever the relationship happens to
    # be loaded, fighting the database instead of leaving it to do the work.
    tailored_cv: Mapped['TailoredCVModel | None'] = relationship(
        back_populates='application',
        uselist=False,
        passive_deletes=True,
    )

    @property
    def finalized(self) -> bool:
        """Closed. Reversible since R-008, kept for installed CLIs (R-019)."""
        return self.finalized_at is not None


class TimelineEventModel(BaseMixin, Base):
    """One entry on an application's timeline (R-001..R-005).

    Mapped onto the table
    revision ``afd4074c70c2`` created, object for object: the two CHECKs, the
    three ``ix_timeline_events_*`` indexes and the partial unique index
    ``uq_timeline_events_one_initial_screening`` carry the revision's names and
    definitions, because the tests build their schema with ``create_all`` and
    the code relies on every one of them. ``denied_reason`` and its CHECK
    were added by migration R3 (``c8b3e9f4a1d6``, KODI-014), folded into
    Release A ahead of this ORM mapping (Release B).
    ``ck_timeline_events_schedule_interview_only`` was added by migration R4
    (``af50c83911a7``, KODI-016), folded into Release A the same way.

    * ``event_type`` is one of three fixed values, interview, offer or denied
      (``ck_timeline_events_event_type``, ADR-0020); ``interview_type`` is set
      on interview events only (``ck_timeline_events_interview_type``). The
      revision's copy of the former type is never mapped.
    * The salary triple is set on offer events only, all three or none
      (``ck_timeline_events_offer_salary``).
    * ``denied_reason`` is set on ``denied`` events only, defaulting to
      ``unknown`` (``ck_timeline_events_denied_reason``, R-033..R-036).
    * ``start_time``, ``end_time`` and ``timezone`` are set on interview
      events only (``ck_timeline_events_schedule_interview_only``, KODI-016,
      R-038/R-039). Owner: "if event type is different from interview,
      these attributes must be blocked".
    * At most one ``initial_screening`` interview per application (R-030,
      owner decision (a)).
    * Rows migrated from ``application_steps`` keep the step's id (R-013).

    Every read and write is scoped to ``user_id`` (ADR 0004).
    """

    __tablename__ = 'timeline_events'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_timeline_events'),
        sa.CheckConstraint(
            "(event_type = 'interview' AND interview_type IS NOT NULL) "
            "OR (event_type <> 'interview' AND interview_type IS NULL)",
            name='ck_timeline_events_interview_type',
        ),
        sa.CheckConstraint(
            "(event_type = 'offer' AND salary_amount IS NOT NULL "
            'AND salary_currency IS NOT NULL AND salary_period IS NOT NULL) '
            "OR (event_type <> 'offer' AND salary_amount IS NULL "
            'AND salary_currency IS NULL AND salary_period IS NULL)',
            name='ck_timeline_events_offer_salary',
        ),
        sa.CheckConstraint(
            "(event_type = 'denied' AND denied_reason IS NOT NULL) "
            "OR (event_type <> 'denied' AND denied_reason IS NULL)",
            name='ck_timeline_events_denied_reason',
        ),
        sa.CheckConstraint(
            "event_type = 'interview' "
            'OR (start_time IS NULL AND end_time IS NULL '
            'AND timezone IS NULL)',
            name='ck_timeline_events_schedule_interview_only',
        ),
        sa.CheckConstraint(
            "event_type IN ('interview', 'offer', 'denied')",
            name='ck_timeline_events_event_type',
        ),
        sa.Index('ix_timeline_events_application_id', 'application_id'),
        sa.Index('ix_timeline_events_user_id', 'user_id'),
        sa.Index(
            'ix_timeline_events_user_id_start_time', 'user_id', 'start_time'
        ),
        sa.Index(
            'uq_timeline_events_one_initial_screening',
            'application_id',
            unique=True,
            postgresql_where=sa.text("interview_type = 'initial_screening'"),
        ),
    )

    application_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'applications.id',
            ondelete='CASCADE',
            name='fk_timeline_events_application_id',
        ),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id', ondelete='CASCADE', name='fk_timeline_events_user_id'
        ),
        nullable=False,
    )
    event_type: Mapped[EventType] = mapped_column(
        _lower_case_enum(EventType, 'event_type'), nullable=False
    )
    interview_type: Mapped[InterviewType | None] = mapped_column(
        _lower_case_enum(InterviewType, 'interview_type'), nullable=True
    )
    denied_reason: Mapped[DeniedReason | None] = mapped_column(
        _lower_case_enum(DeniedReason, 'denied_reason'), nullable=True
    )
    event_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(sa.Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(sa.Time, nullable=True)
    timezone: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    observation: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    salary_amount: Mapped[Decimal | None] = mapped_column(
        sa.Numeric(12, 2), nullable=True
    )
    salary_currency: Mapped[Currency | None] = mapped_column(
        sa.Enum(
            Currency,
            name='currency',
            create_constraint=False,
            native_enum=True,
            create_type=False,
        ),
        nullable=True,
    )
    salary_period: Mapped[SalaryPeriod | None] = mapped_column(
        SalaryPeriodType(), nullable=True
    )

    application: Mapped[ApplicationModel] = relationship(
        back_populates='timeline_events'
    )


ReportDays = Literal[1, 14, 28, 42, 56, 70, 84, 98, 112, 120]


class QuinzenalReportModel(BaseMixin, Base):
    __tablename__ = 'quinzenal_reports'

    __table_args__ = (
        sa.CheckConstraint(
            'report_day IN (1, 14, 28, 42, 56, 70, 84, 98, 112, 120)',
            name='ck_quinzenal_reports_report_day',
        ),
        sa.CheckConstraint(
            'phase IN (1, 2, 3, 4)',
            name='ck_quinzenal_reports_phase',
        ),
        sa.UniqueConstraint(
            'user_id',
            'report_day',
            'cycle_id',
            name='uq_quinzenal_reports_user_day_cycle',
        ),
        sa.Index(
            'uq_quinzenal_reports_user_day_null_cycle',
            'user_id',
            'report_day',
            unique=True,
            postgresql_where=sa.text('cycle_id IS NULL'),
        ),
        sa.Index('idx_quinzenal_reports_user_id', 'user_id'),
        sa.Index('idx_quinzenal_reports_report_day', 'report_day'),
        sa.Index('idx_quinzenal_reports_user_day', 'user_id', 'report_day'),
    )

    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )
    cycle_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey('cycles.id', ondelete='SET NULL'), nullable=True
    )
    report_day: Mapped[ReportDays] = mapped_column(sa.Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    phase: Mapped[int] = mapped_column(sa.Integer, nullable=False)

    applications_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    callback_rate: Mapped[Decimal] = mapped_column(
        sa.Numeric(5, 2), default=Decimal('0.00')
    )
    initial_screenings_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    interviews_completed_fortnight: Mapped[int] = mapped_column(
        sa.Integer, default=0
    )
    active_processes_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    offers_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    offer_rate: Mapped[Decimal] = mapped_column(
        sa.Numeric(5, 2), default=Decimal('0.00')
    )

    total_applications_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    overall_conversion_rate: Mapped[Decimal] = mapped_column(
        sa.Numeric(5, 2), default=Decimal('0.00')
    )
    total_initial_screenings_count: Mapped[int] = mapped_column(
        sa.Integer, default=0
    )

    mock_interviews_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False
    )
    linkedin_posts_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False
    )
    strategic_connections_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False
    )
    biggest_win: Mapped[str] = mapped_column(sa.String(280), nullable=False)
    biggest_challenge: Mapped[str] = mapped_column(
        sa.String(280), nullable=False
    )
    next_fortnight_goal: Mapped[str] = mapped_column(
        sa.String(500), nullable=False
    )

    submitted_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False
    )
    discord_posted: Mapped[bool] = mapped_column(sa.Boolean, default=False)

    user: Mapped[UserModel] = relationship(back_populates='quinzenal_reports')
    cycle: Mapped[CycleModel | None] = relationship(
        back_populates='quinzenal_reports'
    )


class UserFeedbackModel(BaseMixin, Base):
    __tablename__ = 'user_feedbacks'

    __table_args__ = (
        sa.CheckConstraint(
            'score >= 1 AND score <= 5',
            name='ck_user_feedbacks_score',
        ),
        sa.Index('idx_user_feedbacks_user_id', 'user_id'),
    )

    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    score: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    text: Mapped[str | None] = mapped_column(sa.String(2000))

    user: Mapped[UserModel] = relationship(back_populates='user_feedbacks')


def _empty_jsonb_list() -> Mapped[Any]:
    """A NOT NULL JSONB column whose empty value is ``[]``, never NULL.

    The Python-side ``default`` covers ORM inserts; the ``server_default``
    mirrors revision ``f2a9c1d4b6e8`` so the ``Base.metadata.create_all``
    test schema and the migrated production schema agree on what an omitted
    section stores.
    """
    return mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=sa.text("'[]'::jsonb"),
    )


class BaseCVModel(BaseMixin, Base):
    """A master CV, owned by one user and capped at 3 per user.

    The owner's words: "a user can create up to 3 master CV's". The cap is
    enforced in ``CreateBaseCVUseCase`` under a ``SELECT ... FOR UPDATE`` lock
    on the owning user row - there is no trigger and no database constraint.

    A master CV is a document aggregate: it is read and written whole, so its
    seven repeatable sections (``links``, ``skills``, ``experience``,
    ``projects``, ``education``, ``certifications``, ``languages``) are JSONB
    arrays instead of child tables. Section sub-item ids are client-generated
    strings, preserved round-trip and never minted server-side.

    ``skills`` is a list of *categories* - ``{id, category, keywords[]}`` -
    not a flat list of strings. The owner: "skills isn't simply a section
    where i put "tags" or just "keywords" it's a section where i can create a
    category and inside this caregory add keywords".

    The mapping mirrors revision ``f2a9c1d4b6e8`` column for column, including
    every ``server_default``. The primary key is the inherited Snowflake
    ``BaseMixin.id`` (BIGINT, generated in Python, no sequence, no server
    default - docs/adr/0003-snowflake-string-ids.md).
    """

    __tablename__ = 'base_cvs'

    __table_args__ = (sa.Index('idx_base_cvs_user_id', 'user_id'),)

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id', ondelete='CASCADE', name='fk_base_cvs_user_id'
        ),
        nullable=False,
    )

    # --- Identity and contact ---
    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    full_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    headline: Mapped[str] = mapped_column(sa.String(300), nullable=False)
    location: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    email: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)

    # --- Summary (empty string, never NULL) ---
    summary: Mapped[str] = mapped_column(
        sa.Text,
        nullable=False,
        default='',
        server_default=sa.text("''"),
    )

    # --- Repeatable sections (JSONB arrays, never NULL) ---
    links: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    skills: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    experience: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    projects: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    education: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    certifications: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    languages: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()


class TailoredCVModel(BaseMixin, Base):
    """An application's CV copy: a full snapshot of a master CV.

    The owner's words: "each job application will store a "copy" of this
    master CV but edited to the job application". The copy is a *snapshot*,
    not a view: it carries its own identity, contact, summary and seven
    sections, so editing or deleting the master CV never touches it. When the
    master is deleted the database sets ``base_cv_id`` to NULL
    (``ON DELETE SET NULL``) and the copy keeps every field - it has simply
    forgotten where it came from.

    At most one copy per application, enforced by the UNIQUE constraint on
    ``application_id``; a second create is refused as a conflict before it
    ever reaches the database. The copy dies with its application
    (``ON DELETE CASCADE``) and with its owner.

    ``was_ai_generated`` and ``adjustments`` are the tailoring port's
    provenance fields. Nothing in this slice generates anything with a model:
    the only binding today copies verbatim, so they are always ``False`` and
    ``[]``. They exist so a real model can be swapped in later without
    changing the stored shape.

    The mapping mirrors revision ``f2a9c1d4b6e8`` column for column, including
    every ``server_default``, both FK ``ondelete`` clauses, the UNIQUE
    constraint and the ``user_id`` index. The primary key is the inherited
    Snowflake ``BaseMixin.id`` (BIGINT, generated in Python, no sequence, no
    server default - docs/adr/0003-snowflake-string-ids.md).
    ``base_snapshot`` mirrors revision ``c1d9f4a7b3e6`` (R5, KODI-017 part
    2): nullable JSONB, no server default, no backfill.

    There is deliberately no index on ``base_cv_id``: it has none in the
    migration either, and at current volume the sequential scan
    ``ON DELETE SET NULL`` performs is negligible.
    """

    __tablename__ = 'tailored_cvs'

    __table_args__ = (
        sa.UniqueConstraint(
            'application_id', name='uq_tailored_cvs_application_id'
        ),
        sa.Index('idx_tailored_cvs_user_id', 'user_id'),
    )

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id', ondelete='CASCADE', name='fk_tailored_cvs_user_id'
        ),
        nullable=False,
    )
    application_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'applications.id',
            ondelete='CASCADE',
            name='fk_tailored_cvs_application_id',
        ),
        nullable=False,
    )
    # Nullable on purpose: the source master CV may be deleted at any time and
    # deleting it is never blocked.
    base_cv_id: Mapped[int | None] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'base_cvs.id',
            ondelete='SET NULL',
            name='fk_tailored_cvs_base_cv_id',
        ),
        nullable=True,
    )

    # --- Identity and contact (snapshotted from the master CV) ---
    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    full_name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    headline: Mapped[str] = mapped_column(sa.String(300), nullable=False)
    location: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    email: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)

    # --- Summary (empty string, never NULL) ---
    summary: Mapped[str] = mapped_column(
        sa.Text,
        nullable=False,
        default='',
        server_default=sa.text("''"),
    )

    # --- Repeatable sections (JSONB arrays, never NULL) ---
    links: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    skills: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    experience: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    projects: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    education: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    certifications: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()
    languages: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()

    # --- Tailoring provenance (always false / [] in this slice) ---
    was_ai_generated: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=False,
        server_default=sa.text('false'),
    )
    adjustments: Mapped[list[dict[str, Any]]] = _empty_jsonb_list()

    # A snapshot of the master CV this copy was made from, taken once at
    # create time (revision ``c1d9f4a7b3e6``, R5, KODI-017 part 2). Nullable,
    # no server default, never backfilled: a copy created before this
    # revision reads back ``None``, and the web diff falls back to the
    # current master CV via ``base_cv_id`` for it. Never changed after
    # creation - not by PUT (``TailoredCVUpdateDTO`` carries no such field),
    # not by editing the master, not by deleting it. Its shape is exactly
    # ``TailoredCVContent`` (identity/contact, summary, seven sections) -
    # the same document shape the copy itself stores.
    base_snapshot: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    application: Mapped[ApplicationModel] = relationship(
        back_populates='tailored_cv'
    )


# --- Job board (KODI-046, plan 0012 ``## Data``, revision b28d5134631f) ---
#
# The three tables the background worker (ADR-0016) writes. Each mapping
# mirrors revision ``b28d5134631f`` object for object - column names, types,
# lengths, server defaults, FK names and ``ondelete``, UNIQUE, CHECK and the
# B-tree / GIN indexes - so the ``Base.metadata.create_all`` test schema is
# the migrated schema. ``job_dismissals``, ``saved_job_searches`` and
# ``applications.job_id`` are mapped by the slice that reads them (K5).

JOB_RUN_STATUSES = ('ok', 'failed', 'blocked')


class JobSourceModel(BaseMixin, Base):
    """A job board the worker collects from (``himalayas``, ``remoteok``).

    A shared catalog row with no owner (ADR-0004: admin-managed). The seed
    rows come from the migration; nothing in ``app/`` creates a source.
    ``platform_id`` points at the public platform named after the source
    (R-019), ``ON DELETE SET NULL`` - the admin platform delete refuses a
    platform a source uses (``AdminRepository.count_entity_references``).
    ``last_run_*`` record the outcome of the source's latest run (R-008).
    """

    __tablename__ = 'job_sources'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_job_sources'),
        sa.UniqueConstraint('code', name='uq_job_sources_code'),
        sa.CheckConstraint(
            "last_run_status IN ('ok', 'failed', 'blocked')",
            name='ck_job_sources_last_run_status',
        ),
    )

    code: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    base_url: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    platform_id: Mapped[int | None] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'platforms.id',
            ondelete='SET NULL',
            name='fk_job_sources_platform_id',
        ),
        nullable=True,
    )
    is_enabled: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text('true'),
    )
    last_run_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    last_run_status: Mapped[str | None] = mapped_column(
        sa.String(20), nullable=True
    )
    last_run_error: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    last_run_found: Mapped[int | None] = mapped_column(
        sa.Integer, nullable=True
    )
    last_run_saved: Mapped[int | None] = mapped_column(
        sa.Integer, nullable=True
    )


class JobModel(BaseMixin, Base):
    """One posting of one source, unique on ``(source_id, external_id)``.

    Shared by every user. ``description_text`` is plain text (the scrapers
    strip HTML); ``keywords`` is ``job_keywords(description, tags)``
    (ADR-0017), refreshed whenever ``content_hash`` changes. A posting leaves
    the list ``JOBS_RETENTION_DAYS`` after ``coalesce(posted_at,
    first_seen_at)`` by ``is_active = false`` - the row is never deleted
    (R-007), so an application started from it keeps its link.
    """

    __tablename__ = 'jobs'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_jobs'),
        sa.UniqueConstraint(
            'source_id', 'external_id', name='uq_jobs_source_external'
        ),
        sa.Index(
            'ix_jobs_active_posted', 'is_active', sa.text('posted_at DESC')
        ),
        sa.Index('ix_jobs_tags', 'tags', postgresql_using='gin'),
    )

    source_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'job_sources.id', ondelete='RESTRICT', name='fk_jobs_source_id'
        ),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    title: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    company_name: Mapped[str] = mapped_column(sa.String(300), nullable=False)
    company_url: Mapped[str | None] = mapped_column(
        sa.String(2083), nullable=True
    )
    location_text: Mapped[str] = mapped_column(
        sa.String(300),
        nullable=False,
        default='Remote',
        server_default=sa.text("'Remote'"),
    )
    job_url: Mapped[str] = mapped_column(sa.String(2083), nullable=False)
    description_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    employment_type: Mapped[str | None] = mapped_column(
        sa.String(100), nullable=True
    )
    salary_text: Mapped[str | None] = mapped_column(
        sa.String(200), nullable=True
    )
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(sa.Text),
        nullable=False,
        default=list,
        server_default=sa.text("'{}'"),
    )
    keywords: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=sa.text("'[]'::jsonb"),
    )
    content_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    posted_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    first_seen_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text('true'),
    )


class JobFitScoreModel(BaseMixin, Base):
    """The fit of one master CV for one job (ADR-0017), 0..100.

    One row per ``(base_cv_id, job_id)``; ``user_id`` is the CV's owner.
    Every FK cascades: deleting the master CV, the job or the user removes
    the row (R-016). A ``None`` fit (a job with no keywords) has no row.
    """

    __tablename__ = 'job_fit_scores'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_job_fit_scores'),
        sa.UniqueConstraint(
            'base_cv_id', 'job_id', name='uq_job_fit_scores_cv_job'
        ),
        sa.CheckConstraint(
            'score BETWEEN 0 AND 100', name='ck_job_fit_scores_score'
        ),
        sa.Index('ix_job_fit_scores_user_job', 'user_id', 'job_id'),
    )

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id', ondelete='CASCADE', name='fk_job_fit_scores_user_id'
        ),
        nullable=False,
    )
    job_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'jobs.id', ondelete='CASCADE', name='fk_job_fit_scores_job_id'
        ),
        nullable=False,
    )
    base_cv_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'base_cvs.id',
            ondelete='CASCADE',
            name='fk_job_fit_scores_base_cv_id',
        ),
        nullable=False,
    )
    score: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False
    )


class JobDismissalModel(BaseMixin, Base):
    """A job one user took off their own list (R-029), until they restore
    it. One row per ``(user_id, job_id)``; both FKs cascade. Per user, with
    no admin access (ADR-0004)."""

    __tablename__ = 'job_dismissals'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_job_dismissals'),
        sa.UniqueConstraint(
            'user_id', 'job_id', name='uq_job_dismissals_user_job'
        ),
    )

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id', ondelete='CASCADE', name='fk_job_dismissals_user_id'
        ),
        nullable=False,
    )
    job_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'jobs.id', ondelete='CASCADE', name='fk_job_dismissals_job_id'
        ),
        nullable=False,
    )


class SavedJobSearchModel(BaseMixin, Base):
    """A named job-list search of one user (R-030): ``filters`` is a
    ``JobFilters`` body. At most ten per user (enforced under a lock on the
    user row), names unique per user ignoring case
    (``uq_saved_job_searches_user_name`` on ``lower(name)``). It never
    notifies anyone (R-032)."""

    __tablename__ = 'saved_job_searches'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_saved_job_searches'),
        sa.Index(
            'uq_saved_job_searches_user_name',
            'user_id',
            sa.text('lower(name)'),
            unique=True,
        ),
    )

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id',
            ondelete='CASCADE',
            name='fk_saved_job_searches_user_id',
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class FeatureModel(BaseMixin, Base):
    """A feature behind the beta rule (ADR-0018, KODI-052).

    A shared catalog row with no owner, managed by admins. A feature joins
    only through an Alembic seed row (``641001baff09`` seeds ``jobs``) at
    stage ``beta``; the API never creates, renames or deletes one.
    ``released_at`` is set when it goes ``general`` and cleared when it moves
    back to ``beta``. ``__table_args__`` mirror revision ``641001baff09``.
    """

    __tablename__ = 'features'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_features'),
        sa.UniqueConstraint('key', name='uq_features_key'),
        sa.CheckConstraint(
            "stage IN ('beta', 'general')", name='ck_features_stage'
        ),
    )

    key: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(
        sa.String(500), nullable=True
    )
    stage: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        default='beta',
        server_default=sa.text("'beta'"),
    )
    released_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )


class FeatureBetaUserModel(BaseMixin, Base):
    """One user on one feature's beta list (ADR-0018). Only admins write
    it. The user FK cascades; ``added_by`` (the admin who added them) is
    set NULL when that admin's account goes."""

    __tablename__ = 'feature_beta_users'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_feature_beta_users'),
        sa.UniqueConstraint(
            'feature_id',
            'user_id',
            name='uq_feature_beta_users_feature_user',
        ),
        sa.Index('ix_feature_beta_users_user_id', 'user_id'),
    )

    feature_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'features.id',
            ondelete='CASCADE',
            name='fk_feature_beta_users_feature_id',
        ),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id',
            ondelete='CASCADE',
            name='fk_feature_beta_users_user_id',
        ),
        nullable=False,
    )
    added_by: Mapped[int | None] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id',
            ondelete='SET NULL',
            name='fk_feature_beta_users_added_by',
        ),
        nullable=True,
    )


class FeatureAdminOptOutModel(BaseMixin, Base):
    """One admin who turned one feature off for themselves (ADR-0018). It
    takes away only the automatic admin access, and only while the feature
    is ``beta``; an admin writes only their own row. Both FKs cascade."""

    __tablename__ = 'feature_admin_opt_outs'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_feature_admin_opt_outs'),
        sa.UniqueConstraint(
            'feature_id',
            'user_id',
            name='uq_feature_admin_opt_outs_feature_user',
        ),
        sa.Index('ix_feature_admin_opt_outs_user_id', 'user_id'),
    )

    feature_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'features.id',
            ondelete='CASCADE',
            name='fk_feature_admin_opt_outs_feature_id',
        ),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id',
            ondelete='CASCADE',
            name='fk_feature_admin_opt_outs_user_id',
        ),
        nullable=False,
    )


class UserSessionModel(BaseMixin, Base):
    """One sign-in, which is one device (KODI-057, ADR-0019).

    ``created_at`` is when access was granted. The row keeps the device's
    details and history; the live state (the refresh value and the last
    use) lives in Redis on ``REDIS_URL``. No refresh value and no hash of
    it is ever stored here. An ended row stays, so ended devices remain
    visible. ``__table_args__`` mirror revision ``ed39a0fad1e5`` (KODI-056)
    name for name, so ``create_all`` builds the migrated schema.
    """

    __tablename__ = 'user_sessions'

    __table_args__ = (
        sa.PrimaryKeyConstraint('id', name='pk_user_sessions'),
        sa.CheckConstraint(
            "client_type IN ('web', 'cli')",
            name='ck_user_sessions_client_type',
        ),
        sa.CheckConstraint(
            'sign_in_method IN '
            "('github_web', 'cli_browser', 'cli_device', 'cli_legacy')",
            name='ck_user_sessions_sign_in_method',
        ),
        sa.CheckConstraint(
            'end_reason IN '
            "('logout', 'revoked', 'expired', 'github_revoked', 'replaced')",
            name='ck_user_sessions_end_reason',
        ),
        sa.CheckConstraint(
            '(ended_at IS NULL) = (end_reason IS NULL)',
            name='ck_user_sessions_ended_pair',
        ),
        sa.Index(
            'ix_user_sessions_user_id_created_at',
            'user_id',
            sa.text('created_at DESC'),
        ),
        sa.Index(
            'ix_user_sessions_open',
            'user_id',
            postgresql_where=sa.text('ended_at IS NULL'),
        ),
    )

    user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(
            'users.id',
            ondelete='CASCADE',
            name='fk_user_sessions_user_id',
        ),
        nullable=False,
    )
    client_type: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    sign_in_method: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    device_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(
        sa.String(512), nullable=True
    )
    created_ip: Mapped[str | None] = mapped_column(sa.String(45), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(sa.String(45), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    end_reason: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
