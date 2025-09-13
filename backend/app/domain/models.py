from datetime import datetime

from sqlalchemy import Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class BaseMixin:
    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True)

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        onupdate=func.now(), nullable=True
    )


class Base(DeclarativeBase):
    ...


class UserModel(BaseMixin, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False)
