from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel


class JobOut(BaseModel):
    id: int
    source: str
    status: str
    total_found: int
    total_saved: int
    error: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobCreateIn(BaseModel):
    params: Optional[Dict[str, Any]] = None


class JobCreateOut(BaseModel):
    job_id: int
    source: str
    status: str
