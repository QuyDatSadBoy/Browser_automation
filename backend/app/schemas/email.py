from typing import List, Optional
from pydantic import BaseModel, Field


class EmailIn(BaseModel):
    id: str = ""
    address: str
    label: str = ""
    password: str = ""
    app_password: str = ""
    recovery_email: str = ""
    totp_secret: str = ""
    phone: str = ""
    otp_link: str = ""
    provider: str = ""
    status: str = "active"
    tags: List[str] = Field(default_factory=list)
    notes: str = ""


class EmailMeta(BaseModel):
    id: str
    address: str
    label: str = ""
    provider: str = ""
    has_app_password: bool = False
    has_totp: bool = False
    recovery_email: str = ""
    phone: str = ""
    status: str = "active"
    tags: List[str] = Field(default_factory=list)
    notes: str = ""
    last_tested_at: str = ""
    last_test_result: str = ""
    last_test_error: str = ""
    updated_at: str = ""


class EmailOut(EmailIn):
    created_at: str = ""
    updated_at: str = ""
    last_tested_at: str = ""
    last_test_result: str = ""
    last_test_error: str = ""


class EmailBulkIn(BaseModel):
    raw: str


class EmailBulkOut(BaseModel):
    created: int
    items: List[EmailOut]
    skipped: List[str]


class EmailTestOut(BaseModel):
    ok: bool
    error: str = ""
    elapsed_ms: int = 0
    inbox_count: int = 0
