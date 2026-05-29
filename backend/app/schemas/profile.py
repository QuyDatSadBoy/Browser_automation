from typing import List, Dict, Any
from pydantic import BaseModel, Field


class ProfileIn(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$", min_length=2, max_length=64)
    full_name: str = ""
    ho: str = ""
    ten: str = ""
    password: str = ""
    country: str = ""
    website: str = ""
    niche: List[str] = Field(default_factory=list)
    payment: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""
    tags: List[str] = Field(default_factory=list)


class ProfileOut(ProfileIn):
    created_at: str = ""
    updated_at: str = ""


class ProfileMeta(BaseModel):
    id: str
    full_name: str = ""
    niche: List[str] = Field(default_factory=list)
    country: str = ""
    notes: str = ""
    updated_at: str = ""
    tags: List[str] = Field(default_factory=list)
