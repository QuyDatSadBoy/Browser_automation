"""SignupJob — bản ghi 1 lần chạy đăng ký hàng loạt qua browser-use agent."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SignupJob(Base):
    __tablename__ = "signup_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    # JSON arrays / dict (string)
    program_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    profile_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    email_ids_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")
    proxy_ids_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")
    instruction_names_json: Mapped[Optional[str]] = mapped_column(Text, default="[]")
    instruction_name: Mapped[Optional[str]] = mapped_column(String(255))
    extra_prompt: Mapped[Optional[str]] = mapped_column(Text)
    headless: Mapped[bool] = mapped_column(default=False)
    # SMS profile override cho cả job (ưu tiên hơn preset của program)
    sms_profile_id: Mapped[Optional[str]] = mapped_column(String(64))
    # Batch ID — gom nhiều job chạy cùng lúc vào 1 nhóm để xem thống kê tổng
    batch_id: Mapped[Optional[str]] = mapped_column(String(36), index=True)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", index=True
    )  # pending|running|success|failed|partial
    total: Mapped[int] = mapped_column(Integer, default=0)
    succeeded: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    # Per-program attempts: [{program_id, profile_id, status, message, screenshot, steps, started_at, finished_at}]
    results_json: Mapped[Optional[str]] = mapped_column(Text)
    error: Mapped[Optional[str]] = mapped_column(Text)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
