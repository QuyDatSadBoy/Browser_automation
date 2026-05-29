from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ProgramOut(BaseModel):
    id: int
    source: str
    external_id: str
    name: str
    url: Optional[str] = None
    signup_url: Optional[str] = None
    category: Optional[str] = None
    commission: Optional[str] = None
    commission_value: Optional[float] = None
    commission_type: Optional[str] = None
    payout: Optional[str] = None
    cookie_duration: Optional[str] = None
    description: Optional[str] = None
    tags_json: Optional[str] = None
    raw_json: Optional[str] = None
    source_url: Optional[str] = None
    directory_traffic: Optional[str] = None
    directory_popularity: Optional[str] = None
    directory_status: Optional[str] = None
    logo_url: Optional[str] = None
    short_description: Optional[str] = None
    directory_network: Optional[str] = None
    directory_approval: Optional[str] = None
    directory_approval_time: Optional[str] = None
    directory_attribution: Optional[str] = None
    directory_tracking: Optional[str] = None
    directory_last_verified_at: Optional[str] = None
    directory_program_age: Optional[str] = None
    payout_min: Optional[float] = None
    payout_currency: Optional[str] = None
    payout_frequency: Optional[str] = None
    payout_methods_json: Optional[str] = None
    commission_duration: Optional[str] = None
    commission_conditions: Optional[str] = None
    restrictions_json: Optional[str] = None
    agents_json: Optional[str] = None
    registrations_open: Optional[int] = None
    traffic_score: Optional[float] = None
    traffic_period_month: Optional[str] = None
    traffic_details_json: Optional[str] = None
    traffic_scanned_at: Optional[datetime] = None
    sms_country_id: Optional[str] = None
    sms_service_id: Optional[str] = None
    sms_profile_id: Optional[str] = None
    crawled_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProgramListOut(BaseModel):
    items: List[ProgramOut]
    total: int
    page: int
    page_size: int
