"""TrafficScanJob — bản ghi 1 lần quét traffic SimilarWeb cho nhiều program."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TrafficScanJob(Base):
    __tablename__ = "traffic_scan_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, index=True)

    program_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    skip_existing: Mapped[bool] = mapped_column(default=True)
    months: Mapped[int] = mapped_column(Integer, default=12)
    concurrency: Mapped[int] = mapped_column(Integer, default=2)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", index=True
    )  # pending|running|success|failed
    total: Mapped[int] = mapped_column(Integer, default=0)
    scanned: Mapped[int] = mapped_column(Integer, default=0)
    found: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    # Per-program kết quả: [{program_id, name, status, monthly_visits, period_month, error}]
    results_json: Mapped[Optional[str]] = mapped_column(Text)
    error: Mapped[Optional[str]] = mapped_column(Text)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
