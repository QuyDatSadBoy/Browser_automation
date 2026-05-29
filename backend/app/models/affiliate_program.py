from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Float, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class AffiliateProgram(Base):
    __tablename__ = "affiliate_programs"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_source_external"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(String(500))
    signup_url: Mapped[Optional[str]] = mapped_column(String(500))
    category: Mapped[Optional[str]] = mapped_column(String(128), index=True)
    commission: Mapped[Optional[str]] = mapped_column(String(128))
    commission_value: Mapped[Optional[float]] = mapped_column(Float, index=True)
    commission_type: Mapped[Optional[str]] = mapped_column(String(32))
    payout: Mapped[Optional[str]] = mapped_column(String(128))
    cookie_duration: Mapped[Optional[str]] = mapped_column(String(64))
    description: Mapped[Optional[str]] = mapped_column(Text)
    tags_json: Mapped[Optional[str]] = mapped_column(Text)
    # Từ directory nguồn (vd Lovable card hiển thị sẵn)
    directory_traffic: Mapped[Optional[str]] = mapped_column(String(64))      # "100K-300K monthly"
    directory_popularity: Mapped[Optional[str]] = mapped_column(String(64))    # "Phổ biến cao"
    directory_status: Mapped[Optional[str]] = mapped_column(String(64))        # "Active & Verified" / "Verified" / "Auto-approve"
    # Logo (goaffpro trả URL ảnh, openaffiliate có thể có icon sau)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500))
    # Short pitch (openaffiliate có short_description riêng + description dài)
    short_description: Mapped[Optional[str]] = mapped_column(String(500))
    # Network của program (in-house / CJ / Impact / AWIN / PartnerStack…) — chủ yếu openaffiliate
    directory_network: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    # Approval (auto / manual) + thời gian duyệt (instant / 1-3 days …)
    directory_approval: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    directory_approval_time: Mapped[Optional[str]] = mapped_column(String(32))
    # Attribution model + tracking method
    directory_attribution: Mapped[Optional[str]] = mapped_column(String(32))
    directory_tracking: Mapped[Optional[str]] = mapped_column(String(32))
    # Verified date (ISO yyyy-mm-dd) + tuổi chương trình
    directory_last_verified_at: Mapped[Optional[str]] = mapped_column(String(32))
    directory_program_age: Mapped[Optional[str]] = mapped_column(String(32))
    # Payout chi tiết (openaffiliate)
    payout_min: Mapped[Optional[float]] = mapped_column(Float)
    payout_currency: Mapped[Optional[str]] = mapped_column(String(16))
    payout_frequency: Mapped[Optional[str]] = mapped_column(String(32))
    payout_methods_json: Mapped[Optional[str]] = mapped_column(Text)  # ["bank","paypal"]
    # Commission chi tiết (openaffiliate)
    commission_duration: Mapped[Optional[str]] = mapped_column(String(64))  # "12 months"
    commission_conditions: Mapped[Optional[str]] = mapped_column(Text)
    # Restrictions (openaffiliate): list các điều cấm
    restrictions_json: Mapped[Optional[str]] = mapped_column(Text)
    # AI agent recommendation (openaffiliate): {prompt, keywords[], use_cases[]}
    agents_json: Mapped[Optional[str]] = mapped_column(Text)
    # Goaffpro: đăng ký có đang mở không (1/0)
    registrations_open: Mapped[Optional[int]] = mapped_column()
    raw_json: Mapped[Optional[str]] = mapped_column(Text)
    source_url: Mapped[Optional[str]] = mapped_column(String(500))
    traffic_score: Mapped[Optional[float]] = mapped_column(Float, index=True)
    traffic_period_month: Mapped[Optional[str]] = mapped_column(String(7))
    traffic_details_json: Mapped[Optional[str]] = mapped_column(Text)
    traffic_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    # SMS OTP preset (override env defaults khi đăng ký program này)
    sms_country_id: Mapped[Optional[str]] = mapped_column(String(16))
    sms_service_id: Mapped[Optional[str]] = mapped_column(String(16))
    sms_profile_id: Mapped[Optional[str]] = mapped_column(String(64))  # ref → sms_profile_store id
    crawled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
