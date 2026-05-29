from typing import List
from pydantic import BaseModel, Field


class ProxyIn(BaseModel):
    id: str = ""
    label: str = ""
    host: str
    port: int
    type: str = "http"
    username: str = ""
    password: str = ""
    country: str = ""
    provider: str = ""
    status: str = "active"
    tags: List[str] = Field(default_factory=list)
    notes: str = ""


class ProxyMeta(BaseModel):
    id: str
    label: str = ""
    host: str = ""
    port: int = 0
    type: str = "http"
    country: str = ""
    provider: str = ""
    username: str = ""
    has_password: bool = False
    url: str = ""
    status: str = "active"
    last_tested_at: str = ""
    last_test_result: str = ""
    last_test_ip: str = ""
    tags: List[str] = Field(default_factory=list)
    notes: str = ""
    updated_at: str = ""


class ProxyOut(ProxyIn):
    url: str = ""
    last_tested_at: str = ""
    last_test_result: str = ""
    last_test_ip: str = ""
    created_at: str = ""
    updated_at: str = ""


class ProxyBulkIn(BaseModel):
    raw: str
    default_type: str = "http"


class ProxyBulkOut(BaseModel):
    created: int
    items: List[ProxyOut]
    skipped: List[str]


class ProxyTestOut(BaseModel):
    ok: bool
    ip: str = ""
    error: str = ""
    elapsed_ms: int = 0
