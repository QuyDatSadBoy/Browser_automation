from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from app.schemas.program import ProgramOut


class Weights(BaseModel):
    """Trọng số cho từng tiêu chí. Sẽ được normalize về tổng = 1."""
    traffic: float = 0.4
    commission: float = 0.3
    cookie: float = 0.3


class Thresholds(BaseModel):
    """Ngưỡng tối thiểu để 1 program lọt vào shortlist."""
    min_traffic: float = 0.0          # ví dụ 300000 (visits/tháng)
    min_commission: float = 0.0       # %, ví dụ 15
    min_cookie_days: int = 0          # ngày, ví dụ 30


class Criteria(BaseModel):
    weights: Weights = Field(default_factory=Weights)
    thresholds: Thresholds = Field(default_factory=Thresholds)
    sources: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    search: str = ""
    # Nếu program thiếu traffic_score, có 3 chính sách:
    #   "zero" (mặc định) coi như 0, "ignore" loại bỏ, "include" cho qua filter
    missing_traffic_policy: str = "zero"


class ShortlistCreate(BaseModel):
    name: str
    description: str = ""
    criteria: Criteria = Field(default_factory=Criteria)


class ShortlistUpdate(BaseModel):
    name: str = ""
    description: str = ""
    criteria: Optional[Criteria] = None


class ShortlistOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    criteria: Criteria
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShortlistItemOut(BaseModel):
    id: int
    program_id: int
    added_manually: bool
    score: Optional[float] = None
    note: Optional[str] = None
    added_at: datetime
    program: Optional[ProgramOut] = None

    model_config = {"from_attributes": True}


class ScoredProgramOut(BaseModel):
    """Program kèm điểm số khi preview."""
    program: ProgramOut
    score: float
    breakdown: Dict[str, float]   # {traffic, commission, cookie} đã normalize 0..1


class PreviewOut(BaseModel):
    items: List[ScoredProgramOut]
    total: int


class AddItemIn(BaseModel):
    program_id: int
    note: str = ""


class AutoFillIn(BaseModel):
    """Apply criteria và lưu top N program vào shortlist."""
    limit: int = 50
    replace: bool = False     # True = xoá items cũ (chỉ items auto, giữ manual) trước khi add


class TrafficUpdateIn(BaseModel):
    traffic_score: float
