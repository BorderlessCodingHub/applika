from datetime import date, datetime
from typing import List, Optional, TypedDict

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing_extensions import Literal


class BaseMixin:
    id: Mapped[int] = mapped_column(
        sa.Integer, primary_key=True, autoincrement=True
    )

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=sa.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=None,
        onupdate=sa.func.now(), nullable=True
    )


# TODO: Configure MappedAsDataclass and set default_factory for each model field
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
    first_name: Mapped[Optional[str]] = mapped_column(sa.String(100))
    last_name: Mapped[Optional[str]] = mapped_column(sa.String(100))
    current_company: Mapped[Optional[str]] = mapped_column(sa.String(200))
    current_salary: Mapped[Optional[float]] = mapped_column(sa.Numeric(10, 2))
    experience_years: Mapped[int] = mapped_column(sa.Integer, default=0)
    _tech_stack: Mapped[Optional[str]] = mapped_column(sa.Text)

    applications: Mapped[List['ApplicationModel']] = relationship(
        back_populates='user'
    )
    applications_steps: Mapped[List['ApplicationStepModel']] = relationship(
        back_populates='user'
    )

    @property
    def tech_stack(self) -> list[str]:
        if self._tech_stack:
            return self._tech_stack.split(',')
        return []

    @tech_stack.setter
    def tech_stack(self, techs: List[str] | None):
        if techs:
            techs = [tech.strip() for tech in techs if tech.strip()]
            self._tech_stack = ','.join(techs)
        else:
            self._tech_stack = None


class PlatformModel(BaseMixin, Base):
    __tablename__ = 'platforms'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(sa.String(200))

    applications: Mapped[List['ApplicationModel']] = relationship(
        back_populates='platform'
    )


class StepDefinitionModel(BaseMixin, Base):
    __tablename__ = 'steps_definition'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#007bff')
    # strict steps is only used in application finalization form
    strict: Mapped[bool] = mapped_column(sa.Boolean, default=False)

    applications: Mapped[List['ApplicationModel']] = relationship(
        back_populates='last_step_def'
    )
    application_steps: Mapped[List['ApplicationStepModel']] = relationship(
        back_populates='step_def'
    )


class FeedbackDefinitionModel(BaseMixin, Base):
    __tablename__ = 'feedbacks_definition'

    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    color: Mapped[str] = mapped_column(sa.String(7), default='#28a745')

    applications: Mapped[List['ApplicationModel']] = relationship(
        back_populates='feedback_def'
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
    observation: Mapped[Optional[str]] = mapped_column(sa.Text)
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )

    user: Mapped['UserModel'] = relationship(back_populates='applications_steps')
    application: Mapped['ApplicationModel'] = relationship(
        back_populates='application_steps'
    )
    step_def: Mapped['StepDefinitionModel'] = relationship(
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

    application_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    company: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    role: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    mode: Mapped[Literal['active', 'passive']] = mapped_column(
        sa.String(10), nullable=False
    )
    observation: Mapped[Optional[str]] = mapped_column(sa.Text)
    link_to_job: Mapped[Optional[str]] = mapped_column(sa.String(2083))

    salary_offer: Mapped[Optional[float]] = mapped_column(sa.Numeric(10, 2))
    expected_salary: Mapped[Optional[float]] = mapped_column(sa.Numeric(10, 2))
    salary_range_min: Mapped[Optional[float]] = mapped_column(
        sa.Numeric(10, 2)
    )
    salary_range_max: Mapped[Optional[float]] = mapped_column(
        sa.Numeric(10, 2)
    )

    last_step_id: Mapped[Optional[int]] = mapped_column(
        sa.ForeignKey('steps_definition.id')
    )
    last_step_date: Mapped[Optional[date]] = mapped_column(sa.Date)

    feedback_id: Mapped[Optional[int]] = mapped_column(
        sa.ForeignKey('feedbacks_definition.id')
    )
    feedback_date: Mapped[Optional[date]] = mapped_column(sa.Date)

    user: Mapped['UserModel'] = relationship(back_populates='applications')
    platform: Mapped['PlatformModel'] = relationship(
        back_populates='applications'
    )
    last_step_def: Mapped[Optional['StepDefinitionModel']] = relationship(
        back_populates='applications'
    )
    feedback_def: Mapped[Optional['FeedbackDefinitionModel']] = relationship(
        back_populates='applications'
    )
    application_steps: Mapped[List['ApplicationStepModel']] = relationship(
        back_populates='application'
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
