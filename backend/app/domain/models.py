from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, TypedDict

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.enums import (
    Availability,
    Currency,
    ExperienceLevel,
    SalaryPeriod,
    WorkMode,
)
from app.lib.types import generate_snowflake_id


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
        sa.Enum(
            SalaryPeriod,
            name='salaryperiod',
            create_constraint=False,
            native_enum=True,
        )
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
    is_org_member: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default='false', nullable=False
    )
    is_admin: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default='false', nullable=False
    )

    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='user'
    )
    applications_steps: Mapped[list[ApplicationStepModel]] = relationship(
        back_populates='user'
    )
    created_companies: Mapped[list[CompanyModel]] = relationship(
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


class CompanyModel(BaseMixin, Base):
    __tablename__ = 'companies'

    __table_args__ = (
        sa.Index(
            'uq_companies_name_url',
            sa.text('lower(name)'),
            sa.text('url'),
            unique=True,
        ),
    )

    name: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    url: Mapped[str] = mapped_column(sa.String(2083), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, nullable=False
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
    __tablename__ = 'platforms'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    url: Mapped[str | None] = mapped_column(sa.String(200))

    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='platform'
    )


class StepDefinitionModel(BaseMixin, Base):
    __tablename__ = 'steps_definition'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#007bff')
    # strict steps is only used in application finalization form
    strict: Mapped[bool] = mapped_column(sa.Boolean, default=False)

    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='last_step_def'
    )
    application_steps: Mapped[list[ApplicationStepModel]] = relationship(
        back_populates='step_def'
    )


class FeedbackDefinitionModel(BaseMixin, Base):
    __tablename__ = 'feedbacks_definition'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#28a745')

    applications: Mapped[list[ApplicationModel]] = relationship(
        back_populates='feedback_def'
    )


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


class ApplicationStepModel(BaseMixin, Base):
    __tablename__ = 'application_steps'

    application_id: Mapped[int] = mapped_column(
        sa.ForeignKey('applications.id', ondelete='CASCADE'), nullable=False
    )
    step_id: Mapped[int] = mapped_column(
        sa.ForeignKey('steps_definition.id'), nullable=False
    )
    step_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(sa.Time)
    end_time: Mapped[time | None] = mapped_column(sa.Time)
    timezone: Mapped[str | None] = mapped_column(sa.String(50))
    observation: Mapped[str | None] = mapped_column(sa.Text)
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )

    user: Mapped[UserModel] = relationship(back_populates='applications_steps')
    application: Mapped[ApplicationModel] = relationship(
        back_populates='application_steps'
    )
    step_def: Mapped[StepDefinitionModel] = relationship(
        back_populates='application_steps'
    )

    @property
    def step_name(self) -> str:
        try:
            return self.step_def.name
        except Exception:
            return None


class ApplicationLastStep(TypedDict):
    id: int
    name: str
    color: str
    date: date


class ApplicationFeedback(TypedDict):
    id: int
    name: str
    color: str
    date: date


class ApplicationModel(BaseMixin, Base):
    __tablename__ = 'applications'

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

    salary_offer: Mapped[float | None] = mapped_column(sa.Numeric(10, 2))
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
        sa.Enum(
            SalaryPeriod,
            name='salaryperiod',
            create_constraint=False,
            native_enum=True,
            create_type=False,
        )
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

    last_step_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey('steps_definition.id')
    )
    last_step_date: Mapped[date | None] = mapped_column(sa.Date)

    feedback_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey('feedbacks_definition.id')
    )
    feedback_date: Mapped[date | None] = mapped_column(sa.Date)

    user: Mapped[UserModel] = relationship(back_populates='applications')
    company_rel: Mapped[CompanyModel | None] = relationship(
        back_populates='applications'
    )
    platform: Mapped[PlatformModel] = relationship(
        back_populates='applications'
    )
    last_step_def: Mapped[StepDefinitionModel | None] = relationship(
        back_populates='applications'
    )
    feedback_def: Mapped[FeedbackDefinitionModel | None] = relationship(
        back_populates='applications'
    )
    application_steps: Mapped[list[ApplicationStepModel]] = relationship(
        back_populates='application'
    )
    cycle: Mapped[CycleModel | None] = relationship(
        back_populates='applications'
    )

    @property
    def last_step(self) -> ApplicationLastStep | None:
        if self.last_step_def:
            return ApplicationLastStep(
                id=self.last_step_def.id,
                name=self.last_step_def.name,
                color=self.last_step_def.color,
                date=self.last_step_date,
            )

    @property
    def feedback(self) -> ApplicationFeedback | None:
        if self.feedback_def:
            return ApplicationLastStep(
                id=self.feedback_def.id,
                name=self.feedback_def.name,
                color=self.feedback_def.color,
                date=self.feedback_date,
            )

    @property
    def finalized(self) -> bool:
        return self.feedback_id is not None


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
