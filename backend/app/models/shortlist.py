from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Integer, Float, ForeignKey, UniqueConstraint, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class Shortlist(Base):
    """Bộ tiêu chí + danh sách program đã chọn lọc của user."""
    __tablename__ = "shortlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # JSON: { weights:{traffic,commission,cookie}, thresholds:{min_traffic,min_commission,min_cookie_days},
    #        sources:[...], categories:[...] }
    criteria_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ShortlistItem(Base):
    """1 program nằm trong 1 shortlist."""
    __tablename__ = "shortlist_items"
    __table_args__ = (UniqueConstraint("shortlist_id", "program_id", name="uq_shortlist_program"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shortlist_id: Mapped[int] = mapped_column(Integer, ForeignKey("shortlists.id", ondelete="CASCADE"), index=True, nullable=False)
    program_id: Mapped[int] = mapped_column(Integer, ForeignKey("affiliate_programs.id", ondelete="CASCADE"), index=True, nullable=False)
    added_manually: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Float)
    note: Mapped[Optional[str]] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
