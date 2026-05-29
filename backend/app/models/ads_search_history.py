from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class AdsSearchHistory(Base):
    """Lịch sử tra cứu Google Ads Transparency của 1 user."""
    __tablename__ = "ads_search_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    text: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    advertiser_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    creative_format: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    region: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    start_date: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    end_date: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    num: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    political_ads: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    results_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
