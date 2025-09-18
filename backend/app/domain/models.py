from typing_extensions import Literal
import sqlalchemy as sq
from datetime import date, datetime
from typing import List, Optional
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class BaseMixin:
    id: Mapped[int] = mapped_column(
        sq.Integer, primary_key=True, autoincrement=True)

    created_at: Mapped[datetime] = mapped_column(
        default=sq.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        onupdate=sq.func.now(), nullable=True
    )


class Base(DeclarativeBase):
    ...


class UserModel(BaseMixin, Base):
    __tablename__ = "users"

    github_id: Mapped[int] = mapped_column(
        sq.BigInteger, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(sq.String(100), nullable=False)
    email: Mapped[str] = mapped_column(
        sq.String(100), unique=True, index=True, nullable=False)
    current_company: Mapped[Optional[str]] = mapped_column(sq.String(200))
    current_salary: Mapped[Optional[float]] = mapped_column(sq.Numeric(10, 2))
    experience_years: Mapped[int] = mapped_column(sq.Integer, default=0)
    _tech_stack: Mapped[Optional[str]] = mapped_column(sq.Text)

    applications: Mapped[List["ApplicationModel"]] = relationship(
        back_populates="user")

    @property
    def tech_stack(self) -> Optional[list[str]]:
        if self._tech_stack:
            return self._tech_stack.split(',')
        return None

    @tech_stack.setter
    def tech_stack(self, techs: Optional[list[str]]):
        if techs:
            techs = [tech.strip() for tech in techs if tech.strip()]
            self._tech_stack = ','.join(techs)
        else:
            self._tech_stack = None


class PlatformModel(BaseMixin, Base):
    __tablename__ = "platforms"

    name: Mapped[str] = mapped_column(sq.String(100), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(sq.String(200))

    applications: Mapped[List["ApplicationModel"]] = relationship(
        back_populates="platform")


class StepDefinitionModel(BaseMixin, Base):
    __tablename__ = "steps_definition"

    name: Mapped[str] = mapped_column(sq.String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(sq.Text)
    color: Mapped[str] = mapped_column(sq.String(7), default="#007bff")

    applications: Mapped[List["ApplicationModel"]] = relationship(
        back_populates="last_step_def")
    steps: Mapped[List["StepModel"]] = relationship(back_populates="step_def")


class FeedbackDefinitionModel(BaseMixin, Base):
    __tablename__ = "feedbacks_definition"

    name: Mapped[str] = mapped_column(sq.String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(sq.Text)
    color: Mapped[str] = mapped_column(sq.String(7), default="#28a745")

    applications: Mapped[List["ApplicationModel"]] = relationship(
        back_populates="feedback_def")


class StepModel(BaseMixin, Base):
    __tablename__ = "steps"

    application_id: Mapped[int] = mapped_column(sq.ForeignKey(
        "applications.id", ondelete="CASCADE"), nullable=False)
    step_id: Mapped[int] = mapped_column(
        sq.ForeignKey("steps_definition.id"), nullable=False)
    step_date: Mapped[date] = mapped_column(sq.Date, nullable=False)
    observation: Mapped[Optional[str]] = mapped_column(sq.Text)

    application: Mapped["ApplicationModel"] = relationship(
        back_populates="steps")
    step_def: Mapped["StepDefinitionModel"] = relationship(
        back_populates="steps")


class ApplicationModel(BaseMixin, Base):
    __tablename__ = "applications"

    user_id: Mapped[int] = mapped_column(sq.ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[int] = mapped_column(
        sq.ForeignKey("platforms.id"), nullable=False)

    application_date: Mapped[date] = mapped_column(sq.Date, nullable=False)
    company: Mapped[str] = mapped_column(sq.String(200), nullable=False)
    role: Mapped[str] = mapped_column(sq.String(200), nullable=False)
    mode: Mapped[Optional[Literal['active', 'passive']]] = mapped_column(
        sq.String(10))
    observation: Mapped[Optional[str]] = mapped_column(sq.Text)

    salary_offer: Mapped[Optional[float]] = mapped_column(sq.Numeric(10, 2))
    expected_salary: Mapped[Optional[float]] = mapped_column(sq.Numeric(10, 2))
    salary_range_min: Mapped[Optional[float]] = mapped_column(
        sq.Numeric(10, 2))
    salary_range_max: Mapped[Optional[float]] = mapped_column(
        sq.Numeric(10, 2))

    last_step: Mapped[Optional[int]] = mapped_column(
        sq.ForeignKey("steps_definition.id"))
    last_step_date: Mapped[Optional[date]] = mapped_column(sq.Date)
    feedback_id: Mapped[Optional[int]] = mapped_column(
        sq.ForeignKey("feedbacks_definition.id"))
    feedback_date: Mapped[Optional[date]] = mapped_column(sq.Date)

    user: Mapped["UserModel"] = relationship(
        back_populates="applications")
    platform: Mapped["PlatformModel"] = relationship(
        back_populates="applications")
    last_step_def: Mapped[Optional["StepDefinitionModel"]] = relationship(
        back_populates="applications")
    feedback_def: Mapped[Optional["FeedbackDefinitionModel"]] = relationship(
        back_populates="applications")
    steps: Mapped[List["StepModel"]] = relationship(
        back_populates="application")
